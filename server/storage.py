"""SQLite persistence outside the public application directory."""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import sqlite3

def now():
    return datetime.now(timezone.utc)

def today():
    return now().astimezone(timezone(timedelta(hours=3))).date().isoformat()

def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()

class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript('''
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY, hash TEXT, processed_hash TEXT, payload TEXT);
                CREATE TABLE IF NOT EXISTS post_history(id TEXT, hash TEXT, payload TEXT, PRIMARY KEY(id,hash));
                CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY, place_id TEXT, outing_date TEXT, author_key TEXT, payload TEXT);
                CREATE TABLE IF NOT EXISTS briefs(id TEXT PRIMARY KEY, place_id TEXT, hash TEXT, payload TEXT);
                CREATE TABLE IF NOT EXISTS model_cache(hash TEXT PRIMARY KEY, payload TEXT);
                CREATE TABLE IF NOT EXISTS usage(day TEXT PRIMARY KEY, calls INTEGER NOT NULL, tokens INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS source_state(id TEXT PRIMARY KEY, payload TEXT);
                CREATE TABLE IF NOT EXISTS locks(name TEXT PRIMARY KEY, expires REAL);
                CREATE TABLE IF NOT EXISTS meta(name TEXT PRIMARY KEY, value TEXT);
            ''')

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def put_post(self, post):
        with self.connect() as db:
            previous = db.execute('SELECT hash FROM posts WHERE id=?', (post['id'],)).fetchone()
            if previous and previous['hash'] == post['hash']:
                return False
            db.execute('INSERT OR IGNORE INTO post_history VALUES(?,?,?)', (post['id'],post['hash'],json.dumps(post,ensure_ascii=False)))
            db.execute('INSERT INTO posts(id,hash,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET hash=excluded.hash,payload=excluded.payload', (post['id'], post['hash'], json.dumps(post, ensure_ascii=False)))
            return True

    def pending_posts(self, limit=5):
        with self.connect() as db:
            rows = db.execute('SELECT payload FROM posts WHERE processed_hash IS NULL OR processed_hash<>hash ORDER BY id LIMIT ?', (limit,)).fetchall()
        return [json.loads(row['payload']) for row in rows]

    def record_extraction(self, post, observations):
        with self.connect() as db:
            for observation in observations:
                db.execute('INSERT OR REPLACE INTO observations VALUES(?,?,?,?,?)', (observation['id'], observation['place_id'], observation['outing_date'], post['author_key'], json.dumps(observation, ensure_ascii=False)))
            db.execute('UPDATE posts SET processed_hash=? WHERE id=? AND hash=?', (post['hash'], post['id'], post['hash']))

    def observations(self, place_id=None, active_only=True):
        with self.connect() as db:
            if place_id:
                rows = db.execute('SELECT payload,author_key FROM observations WHERE place_id=?', (place_id,)).fetchall()
            else:
                rows = db.execute('SELECT payload,author_key FROM observations').fetchall()
            versions = {r['id']:r['hash'] for r in db.execute('SELECT id,hash FROM posts')}
        values = [{**json.loads(r['payload']), '_author_key': r['author_key']} for r in rows]
        if active_only:
            values = [o for o in values if not o.get('_post_id') or versions.get(o['_post_id'])==o.get('_post_hash')]
            processed_urls = {o['url'] for o in values if o.get('_post_id')}
            values = [o for o in values if o.get('_post_id') or o['url'] not in processed_urls]
        return values

    def save_brief(self, brief, fingerprint):
        with self.connect() as db:
            db.execute('INSERT OR REPLACE INTO briefs VALUES(?,?,?,?)', (brief['id'], brief['place_id'], fingerprint, json.dumps(brief, ensure_ascii=False)))

    def seed(self, snapshot):
        with self.connect() as db:
            for observation in snapshot['observations']:
                db.execute('INSERT OR IGNORE INTO observations VALUES(?,?,?,?,?)', (observation['id'], observation['place_id'], observation['outing_date'], '', json.dumps(observation, ensure_ascii=False)))
            for brief in snapshot['briefs']:
                brief = {**brief, 'analyzed_on': snapshot['analyzed_on'], 'analysis_kind': 'reviewed_snapshot'}
                db.execute('INSERT OR IGNORE INTO briefs VALUES(?,?,?,?)', (brief['id'], brief['place_id'], 'seed', json.dumps(brief, ensure_ascii=False)))

    def snapshot(self):
        observations = self.observations(active_only=False)
        for observation in observations:
            observation.pop('_author_key', None)
            observation.pop('_post_id', None)
            observation.pop('_post_hash', None)
        with self.connect() as db:
            briefs = [json.loads(r['payload']) for r in db.execute('SELECT payload FROM briefs')]
            states = [json.loads(r['payload']) for r in db.execute('SELECT payload FROM source_state')]
        selected = {}
        for brief in briefs:
            key = (brief['place_id'], tuple(sorted(brief['species'])))
            previous = selected.get(key)
            rank = lambda b: (b.get('analyzed_on',''), b.get('analysis_kind') == 'server_ai')
            if not previous or rank(brief) > rank(previous):
                selected[key] = brief
        briefs = list(selected.values())
        used = {identifier for b in briefs for identifier in b['observation_ids']}
        observations = [o for o in observations if o['id'] in used and o.get('outing_date')]
        valid_ids = {o['id'] for o in observations}
        briefs = [b for b in briefs if set(b['observation_ids']) <= valid_ids]
        analyzed = max((b.get('analyzed_on', '1970-01-01') for b in briefs), default=today())
        return {'schema_version': 1, 'mode': 'server_cached', 'analyzed_on': analyzed, 'observations': observations, 'briefs': briefs, 'source_status': states}

    def cache_get(self, key):
        with self.connect() as db:
            row = db.execute('SELECT payload FROM model_cache WHERE hash=?', (key,)).fetchone()
        return json.loads(row['payload']) if row else None

    def cache_put(self, key, value):
        with self.connect() as db:
            db.execute('INSERT OR REPLACE INTO model_cache VALUES(?,?)', (key, json.dumps(value, ensure_ascii=False)))

    def reserve(self, tokens, max_calls, max_tokens):
        day = today()
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('INSERT OR IGNORE INTO usage VALUES(?,0,0)', (day,))
            row = db.execute('SELECT calls,tokens FROM usage WHERE day=?', (day,)).fetchone()
            if row['calls'] >= max_calls or row['tokens'] + tokens > max_tokens:
                raise RuntimeError('Daily AI budget exhausted')
            db.execute('UPDATE usage SET calls=calls+1,tokens=tokens+? WHERE day=?', (tokens, day))
        return day

    def reconcile(self, day, reserved, actual):
        if not isinstance(actual, int) or actual < 0:
            return
        with self.connect() as db:
            db.execute('UPDATE usage SET tokens=MAX(0,tokens+?) WHERE day=?', (actual-reserved, day))

    def status(self, source_id, state, error=None, posts=0):
        value = {'source_id': source_id, 'checked_at': now().isoformat(), 'state': state, 'error': error, 'posts_read': posts}
        with self.connect() as db:
            db.execute('INSERT OR REPLACE INTO source_state VALUES(?,?)', (source_id, json.dumps(value)))

    def acquire(self, name='refresh', seconds=600):
        stamp = now().timestamp()
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT expires FROM locks WHERE name=?', (name,)).fetchone()
            if row and row['expires'] > stamp:
                return False
            db.execute('INSERT OR REPLACE INTO locks VALUES(?,?)', (name, stamp+seconds))
        return True

    def release(self, name='refresh'):
        with self.connect() as db:
            db.execute('DELETE FROM locks WHERE name=?', (name,))
