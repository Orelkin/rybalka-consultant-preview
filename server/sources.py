"""Bounded public-page readers. A failed/blocked source never becomes a fresh observation."""
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html.parser import HTMLParser
import hashlib
import json
import re
import time
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from urllib.robotparser import RobotFileParser

AGENT = 'RybalkaConsultant/0.1'
HOSTS = {'www.fishingsib.ru', 'www.rusfishing.ru', 'www.fisher.spb.ru', 'www.fishing.ru'}
MAX_BYTES = 1_500_000

def registered_url(url):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname not in HOSTS or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError('Unregistered source URL')
    return url

class SourceRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        registered_url(newurl)
        return super().redirect_request(request, fp, code, message, headers, newurl)

class Reader:
    def __init__(self, min_interval=2.0):
        self.opener = build_opener(SourceRedirect())
        self.robots = {}
        self.last = {}
        self.min_interval = min_interval

    def _fetch(self, url):
        registered_url(url)
        host = urlsplit(url).hostname
        delay = max(0, self.min_interval - (time.monotonic() - self.last.get(host, 0)))
        if delay:
            time.sleep(delay)
        self.last[host] = time.monotonic()
        request = Request(url, headers={'User-Agent': AGENT, 'Accept': 'text/html,text/plain;q=0.9'})
        with self.opener.open(request, timeout=15) as response:
            content = response.read(MAX_BYTES + 1)
            if len(content) > MAX_BYTES:
                raise ValueError('Source page too large')
            content_type = response.headers.get_content_type()
            if content_type not in ('text/html', 'text/plain'):
                raise ValueError('Unsupported source content')
            encoding = response.headers.get_content_charset() or 'utf-8'
            return content.decode(encoding, errors='replace')

    def read(self, url):
        registered_url(url)
        host = urlsplit(url).hostname
        if host not in self.robots:
            robots = RobotFileParser(f'https://{host}/robots.txt')
            try:
                body = self._fetch(robots.url)
                robots.parse(body.splitlines())
                delay = robots.crawl_delay(AGENT) or robots.crawl_delay('*')
                if delay:
                    self.min_interval = max(self.min_interval, delay)
            except HTTPError as error:
                if error.code == 404:
                    robots.parse([])
                else:
                    raise RuntimeError('Source robots unavailable') from None
            self.robots[host] = robots
        if not self.robots[host].can_fetch(AGENT, url):
            raise PermissionError('Source disallows automated reading')
        return self._fetch(url)

@dataclass
class Node:
    tag: str
    attrs: dict = field(default_factory=dict)
    children: list = field(default_factory=list)
    parent: object = None

    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.walk()

    def text(self):
        return re.sub(r'\s+', ' ', ' '.join(child.text() if isinstance(child, Node) else child for child in self.children)).strip()

    def has_class(self, name):
        return name in (self.attrs.get('class') or '').split()

class Tree(HTMLParser):
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Node('root')
        self.current = self.root
        self.skip = 0
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'svg'):
            self.skip += 1
            return
        if self.skip:
            return
        node = Node(tag, dict(attrs), parent=self.current)
        self.current.children.append(node)
        if tag not in self.VOID:
            self.current = node

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'svg'):
            self.skip = max(0, self.skip - 1)
            return
        if self.skip:
            return
        current = self.current
        while current.parent:
            if current.tag == tag:
                self.current = current.parent
                return
            current = current.parent

    def handle_data(self, data):
        if not self.skip:
            self.current.children.append(data)

def fingerprint(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def articles_from_index(html, base, source_id, limit=5):
    expression = r'/tidings/view/\d+/' if source_id == 'fishingsib' else r'/forum/threads/[^/?#]+/'
    urls = []
    for node in Tree(html).root.walk():
        if node.tag == 'a':
            match = re.search(expression, node.attrs.get('href', ''))
            if match:
                url = urljoin(base, match.group())
                registered_url(url)
                if url not in urls:
                    urls.append(url)
                    if len(urls) == limit:
                        break
    return urls

def latest_thread_page(html, base):
    candidates = [(1, base)]
    for node in Tree(html).root.walk():
        if node.tag == 'a':
            url = urljoin(base, node.attrs.get('href', ''))
            match = re.search(r'/page-(\d+)(?:[#?]|$)', url)
            if match and urlsplit(url).hostname == urlsplit(base).hostname and url.split('/page-')[0].rstrip('/') == base.rstrip('/'):
                candidates.append((int(match.group(1)), registered_url(url.split('#')[0])))
    return max(candidates)[1]

def parse_thread(html, url, place_id):
    tree = Tree(html).root
    title = next((n.text() for n in tree.walk() if n.tag == 'h1'), 'Сообщения с водоёма')[:180]
    posts = []
    for node in tree.walk():
        if node.tag != 'article' or not node.has_class('message'):
            continue
        post_id = node.attrs.get('data-content', '') or node.attrs.get('id', '')
        match = re.search(r'post[-_]?\d+', post_id)
        body = next((n for n in node.walk() if n.has_class('message-body')), None)
        stamp = next((n.attrs.get('datetime') for n in node.walk() if n.tag == 'time' and n.attrs.get('datetime')), None)
        if not match or not body or not stamp:
            continue
        # Quoted earlier replies are dependent evidence and must not become a new report.
        def unquoted(n):
            if n.tag == 'blockquote' or n.has_class('bbCodeBlock'):
                return ''
            return ' '.join(unquoted(c) if isinstance(c, Node) else c for c in n.children)
        text = re.sub(r'\s+', ' ', unquoted(body)).strip()[:6000]
        author_name = node.attrs.get('data-author', '')
        author = fingerprint(author_name) if author_name else ''
        identifier = 'rusfishing-' + match.group().replace('_', '-').replace('post', '').strip('-')
        posts.append({'id': identifier, 'source_id': 'rusfishing', 'url': url.split('#')[0] + '#' + match.group().replace('_', '-'), 'title': title, 'published': stamp, 'author_key': author, 'place_id': place_id, 'text': text, 'hash': fingerprint(text)})
    return posts

def parse_fishingsib(html, url, place_id=None):
    tree = Tree(html).root
    title = next((n.text() for n in tree.walk() if n.tag == 'h1'), None)
    article = next((n for n in tree.walk() if n.has_class('articleFS')), None)
    scope = article or tree
    # Verified FishingSib layout: first articleFS contains the report, later siblings contain comments/related items.
    body = next((n for n in scope.walk() if n.has_class('articleFS__content') or n.attrs.get('itemprop') == 'articleBody'), None)
    if not title or not body:
        raise ValueError('Article body markup not recognized')
    stamp = next((n.attrs.get('content') or n.attrs.get('datetime') or n.text() for n in scope.walk() if n.attrs.get('itemprop') == 'datePublished'), None)
    if not stamp:
        human = next((n.text() for n in scope.walk() if n.has_class('author__block__dateActivity')), '')
        months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']
        match = re.search(r'(\d{1,2})\s+([а-я]+)\s+(\d{4}),?\s+(\d{2}:\d{2})', human)
        if match and match.group(2) in months:
            stamp = f'{match.group(3)}-{months.index(match.group(2))+1:02d}-{int(match.group(1)):02d}T{match.group(4)}:00'
    if not stamp:
        raise ValueError('Article publication date missing')
    text = body.text()[:6000]
    author = next((n.attrs.get('href') or n.text() for n in scope.walk() if n.has_class('author__block__name') or n.attrs.get('itemprop') == 'author'), '')
    match = re.search(r'/view/(\d+)/', url)
    if not match:
        raise ValueError('Article identifier missing')
    return [{'id': 'fishingsib-' + match.group(1), 'source_id': 'fishingsib', 'url': url, 'title': title[:180], 'published': stamp, 'author_key': fingerprint(author) if author else '', 'place_id': place_id, 'text': text, 'hash': fingerprint(text)}]
