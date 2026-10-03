"""Collection worker and cached public recommendations; web requests do not spend AI tokens."""
from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from analysis import AIClient, EXPLANATION, EXTRACTION, EXTRACT_INSTRUCTIONS, ANALYZE_INSTRUCTIONS, build_brief, validate_extraction
from sources import Reader, articles_from_index, latest_thread_page, parse_fishingsib, parse_thread
from storage import Store, digest, today

def normalize(value):
    import re
    return re.sub(r'[^а-яa-z0-9]+', ' ', str(value).casefold().replace('ё','е')).strip()

class Service:
    def __init__(self, app, db_path, reader=None, ai=None):
        self.app = Path(app)
        config = json.loads((self.app/'server/places.json').read_text(encoding='utf-8'))
        self.places = {p['id']:p for p in config['places']}
        self.store = Store(db_path)
        self.store.seed(json.loads((self.app/'data/forum-conditions.json').read_text(encoding='utf-8')))
        self.reader = reader or Reader()
        self.ai = ai or AIClient(self.store)

    def resolve(self, query):
        text = normalize(query)
        return next((p for p in self.places.values() if text == normalize(p['name']) or text in [normalize(a) for a in p['aliases']]), None)

    def conditions(self, query='', species=''):
        snapshot = self.store.snapshot()
        resolved = self.resolve(query) if query else None
        if query:
            place = self.resolve(query)
            snapshot['briefs'] = [b for b in snapshot['briefs'] if place and b['place_id'] == place['id']]
        if species:
            snapshot['briefs'] = [b for b in snapshot['briefs'] if normalize(species) in [normalize(s) for s in b['species']]]
        ids = {i for b in snapshot['briefs'] for i in b['observation_ids']}
        snapshot['observations'] = [o for o in snapshot['observations'] if o['id'] in ids]
        snapshot['service'] = {'ai_configured':self.ai.configured, 'read_only_requests':True, 'places_registered':len(self.places), 'place_resolved':bool(resolved)}
        return snapshot

    def weather(self, place):
        reference = place.get('weather')
        if not reference:
            return []
        # Only coordinates verified in the registry may be sent; personal locations never enter this service.
        url = 'https://api.open-meteo.com/v1/forecast?' + urlencode({'latitude':reference['latitude'],'longitude':reference['longitude'],'current':'temperature_2m,wind_speed_10m,pressure_msl','wind_speed_unit':'ms','timezone':'UTC','timeformat':'unixtime'})
        with urlopen(Request(url,headers={'User-Agent':'RybalkaConsultant/0.1'}),timeout=12) as response:
            data = json.loads(response.read(100_000))
        current, units = data.get('current',{}), data.get('current_units',{})
        if units.get('temperature_2m') != '°C' or units.get('wind_speed_10m') != 'm/s' or units.get('pressure_msl') != 'hPa' or not isinstance(current.get('time'),int):
            raise ValueError('Weather units/time mismatch')
        if abs(datetime.now(timezone.utc).timestamp()-current['time']) > 7200:
            raise ValueError('Weather is stale')
        return [{'id':f'weather:{place["id"]}:{current["time"]}', 'kind':'weather_model', 'place_id':place['id'],
            'scope':reference['scope'], 'time_utc':datetime.fromtimestamp(current['time'],timezone.utc).isoformat(),
            'source_url':url,'licence_url':'https://open-meteo.com/en/licence',
            'air_temperature_c':current.get('temperature_2m'),'wind_ms':current.get('wind_speed_10m'),'pressure_msl_hpa':current.get('pressure_msl'),
            'water_temperature_c':None, 'water_level_cm':None}]

    def collect(self):
        cutoff = date.fromisoformat(today())-timedelta(days=7)
        seen = set(); post_count=0; topic_count=0; outcomes=[]
        for place in self.places.values():
            for source in place['sources']:
                if topic_count >= 5 or post_count >= 20:
                    return outcomes
                try:
                    html = self.reader.read(source['url'])
                    if source['kind'] == 'index':
                        urls = articles_from_index(html,source['url'],source['source_id'],min(source.get('topics',2),5-topic_count))
                    else:
                        urls = [source['url']]
                    count=0; recent=0
                    for url in urls:
                        topic_count += 1
                        page = html if url==source['url'] else self.reader.read(url)
                        if source['source_id']=='rusfishing':
                            latest = latest_thread_page(page,url)
                            if latest != url:
                                page = self.reader.read(latest); url=latest
                            posts = parse_thread(page,url,place['id'])
                        elif source['source_id']=='fishingsib':
                            posts = parse_fishingsib(page,url,None if source.get('geography')=='resolve_from_report' else place['id'])
                        else:
                            raise ValueError('Source adapter not implemented')
                        for post in posts:
                            if post_count >= 20:
                                break
                            if post['id'] in seen:
                                continue
                            seen.add(post['id']); count += 1
                            publication = date.fromisoformat(post['published'][:10])
                            if publication < cutoff or publication > date.fromisoformat(today()):
                                continue
                            recent += 1
                            if self.store.put_post(post):
                                post_count += 1
                    self.store.status(source['source_id'],'read_with_recent_posts' if recent else 'read_without_recent_posts',posts=count)
                    outcomes.append({'source':source['source_id'],'read':count,'recent':recent})
                except Exception as error:
                    state = 'access_denied' if isinstance(error,PermissionError) else 'unavailable'
                    self.store.status(source['source_id'],state,error=type(error).__name__)
                    outcomes.append({'source':source['source_id'],'state':state})
        return outcomes

    def process(self):
        if not self.ai.configured:
            return {'state':'awaiting_ai_configuration','extracted':0,'explained':0}
        extracted=0; explained=0; errors=[]
        for post in self.store.pending_posts(limit=max(1,self.ai.max_calls-1)):
            try:
                result = self.ai.call('extract',EXTRACT_INSTRUCTIONS,{'post':post,'registered_places':[{k:p[k] for k in ('id','name','precision')} for p in self.places.values()]},EXTRACTION)
                observations = validate_extraction(result,post,self.places)
                self.store.record_extraction(post,observations)
                extracted += len(observations)
            except Exception as error:
                errors.append(type(error).__name__)
        # Unknown dates remain in the private store and cannot become a current recommendation.
        cutoff = date.fromisoformat(today())-timedelta(days=3)
        for place in self.places.values():
            observations = [o for o in self.store.observations(place['id']) if o.get('outing_date') and cutoff <= date.fromisoformat(o['outing_date']) <= date.fromisoformat(today())]
            if not observations:
                continue
            try:
                contexts = self.weather(place)
            except Exception:
                contexts = []
            for species in sorted({s for o in observations for s in o['species']}):
                matching = sorted((o for o in observations if species in o['species']),key=lambda o:(o['outing_date'],o.get('published_local','')),reverse=True)[:3]
                request = {'place':{'id':place['id'],'name':place['name'],'precision':place['precision']}, 'species':species,
                    'observations':matching,'contexts':contexts, 'missing':['Правила ловли и доступ не проверены'] + ([] if contexts else ['Погода участка не сопоставлена'])}
                try:
                    result = self.ai.call('analyze',ANALYZE_INSTRUCTIONS,request,EXPLANATION)
                    brief = build_brief(result,place,species,matching,contexts)
                    if brief:
                        self.store.save_brief(brief,digest(request)); explained += 1
                except Exception as error:
                    errors.append(type(error).__name__)
        return {'state':'processed','extracted':extracted,'explained':explained,'errors':errors}

    def refresh(self):
        if not self.store.acquire():
            return {'state':'already_running'}
        try:
            return {'collection':self.collect(),'analysis':self.process()}
        finally:
            self.store.release()
