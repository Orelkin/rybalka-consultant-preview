import concurrent.futures
from functools import partial
from http.server import ThreadingHTTPServer
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from analysis import AIClient, EXPLANATION, build_brief, validate_extraction
from sources import Reader, registered_url, parse_fishingsib, parse_thread, latest_thread_page, fingerprint
from storage import Store, today
from service import Service
from recon_server import Handler, APP

FISHINGSIB = '''<h1>Участок Оби</h1><section class="articleFS"><a class="author__block__name" href="/users/profile/12/">Автор</a><span class="author__block__dateActivity">2 октября 2026, 18:18</span><article class="articleFS__content">Сегодня поймал окуня. Вода упала.</article></section><section class="commentsFS">Сегодня поймал щуку 10 кг</section><section class="articleFS"><article class="articleFS__content">Другой водоём и чужой улов</article></section>'''
THREAD = '''<h1>Участок водохранилища</h1><article class="message" data-content="post-123" data-author="same"><time datetime="2026-10-02T18:00:00+03:00"></time><div class="message-body"><blockquote>Чужой улов щуки</blockquote>Вчера поймал окуня.</div></article>'''

class SourceTests(unittest.TestCase):
    def test_report_excludes_comments_and_related_articles(self):
        report=parse_fishingsib(FISHINGSIB,'https://www.fishingsib.ru/tidings/view/22/','ob-novosibirsk')[0]
        self.assertEqual(report['text'],'Сегодня поймал окуня. Вода упала.')
        self.assertEqual(report['published'],'2026-10-02T18:18:00')
        self.assertEqual(report['id'],'fishingsib-22')

    def test_forum_quotes_are_not_new_evidence(self):
        post=parse_thread(THREAD,'https://www.rusfishing.ru/forum/threads/test.1/','rybinsk-reservoir')[0]
        self.assertNotIn('Чужой',post['text']);self.assertEqual(post['url'].split('#')[1],'post-123')

    def test_last_page_does_not_follow_another_thread(self):
        base='https://www.rusfishing.ru/forum/threads/test.1/'
        html='<a href="/forum/threads/test.1/page-7">7</a><a href="/forum/threads/other.2/page-999">999</a>'
        self.assertEqual(latest_thread_page(html,base),base+'page-7')

    def test_robots_disallow_and_foreign_urls(self):
        reader=Reader(min_interval=0)
        with patch.object(reader,'_fetch',return_value='User-agent: *\nDisallow: /forum/') as fetch:
            with self.assertRaises(PermissionError):reader.read('https://www.rusfishing.ru/forum/')
            self.assertEqual(fetch.call_count,1)
        for url in ['file:///etc/passwd','http://127.0.0.1/','https://www.fishingsib.ru@evil.test/','https://www.fishingsib.ru:8888/']:
            with self.assertRaises(ValueError):registered_url(url)

class StorageAndAITests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.store=Store(Path(self.temp.name)/'data.sqlite')
    def tearDown(self):self.temp.cleanup()

    def test_changed_posts_preserve_previous_versions(self):
        post={'id':'p','hash':'a','text':'first'}
        self.assertTrue(self.store.put_post(post));self.assertFalse(self.store.put_post(post))
        self.store.put_post({**post,'hash':'b','text':'edited'})
        with self.store.connect() as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM post_history').fetchone()[0],2)

    def test_atomic_daily_limit(self):
        def reserve(_):
            try:self.store.reserve(10,1,100);return True
            except RuntimeError:return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:self.assertEqual(sum(pool.map(reserve,range(2))),1)

    def test_missing_key_does_not_contact_ai(self):
        with patch.dict(os.environ,{'OPENAI_API_KEY':''}):
            client=AIClient(self.store,transport=lambda _:self.fail('Unexpected network call'))
            with self.assertRaises(RuntimeError):client.call('analyze','test',{},EXPLANATION)

    def test_cache_and_structured_request(self):
        requests=[]
        def transport(value):
            requests.append(value)
            return {'status':'completed','usage':{'total_tokens':5},'output':[{'type':'message','content':[{'type':'output_text','text':'{}'}]}]}
        with patch.dict(os.environ,{'RECON_AI_PROVIDER':'openai','OPENAI_API_KEY':'unit-test-only','RECON_EXTRACT_MODEL':'test','RECON_ANALYZE_MODEL':'test'}):
            client=AIClient(self.store,transport=transport)
            first=client.call('analyze','test',{},EXPLANATION);second=client.call('analyze','test',{},EXPLANATION)
            self.assertEqual(first,second);self.assertEqual(len(requests),1)
            self.assertFalse(requests[0]['store']);self.assertTrue(requests[0]['text']['format']['strict'])
            with self.store.connect() as db:self.assertEqual(dict(db.execute('SELECT calls,tokens FROM usage').fetchone()),{'calls':1,'tokens':5})

    def test_refusal_and_incomplete_are_not_cached(self):
        with patch.dict(os.environ,{'RECON_AI_PROVIDER':'openai','OPENAI_API_KEY':'unit-test-only','RECON_EXTRACT_MODEL':'test','RECON_ANALYZE_MODEL':'test'}):
            for response in [{'status':'incomplete'}, {'status':'completed','output':[{'type':'message','content':[{'type':'refusal'}]}]}]:
                client=AIClient(self.store,transport=lambda _,r=response:r)
                with self.assertRaises(ValueError):client.call('analyze',str(response),{},EXPLANATION)

    def test_refresh_lock(self):
        self.assertTrue(self.store.acquire());self.assertFalse(self.store.acquire());self.store.release();self.assertTrue(self.store.acquire())

    def test_local_ai_requires_no_key_and_never_uses_cloud_endpoint(self):
        from io import BytesIO
        with patch.dict(os.environ,{'RECON_AI_PROVIDER':'ollama','OPENAI_API_KEY':'','RECON_EXTRACT_MODEL':'local-test','RECON_ANALYZE_MODEL':'local-test'}):
            client=AIClient(self.store)
            self.assertTrue(client.configured)
            reply={'done':True,'done_reason':'stop','prompt_eval_count':2,'eval_count':3,'message':{'content':'{}'}}
            with patch('analysis.urlopen',return_value=BytesIO(json.dumps(reply).encode())) as network:
                client.call('analyze','test',{},EXPLANATION)
                request=network.call_args.args[0]
                self.assertEqual(request.full_url,'http://127.0.0.1:11434/api/chat')
                self.assertIsNone(request.get_header('Authorization'))
                payload=json.loads(request.data);self.assertEqual(payload['format'],EXPLANATION);self.assertFalse(payload['stream'])
                self.assertEqual(payload['messages'][0]['role'],'system')
            with patch.dict(os.environ,{'RECON_ANALYZE_MODEL':'anything-cloud'}):self.assertFalse(AIClient(self.store).configured)

    def test_local_truncated_reply_and_disabled_provider_do_not_generate_brief(self):
        from io import BytesIO
        with patch.dict(os.environ,{'RECON_AI_PROVIDER':'ollama','RECON_EXTRACT_MODEL':'local-test','RECON_ANALYZE_MODEL':'local-test'}):
            client=AIClient(self.store)
            with patch('analysis.urlopen',return_value=BytesIO(b'{"done":true,"done_reason":"length","message":{"content":"{}"}}')):
                with self.assertRaises(ValueError):client.call('analyze','test',{},EXPLANATION)
        with patch.dict(os.environ,{'RECON_AI_PROVIDER':'none','OPENAI_API_KEY':'test','RECON_EXTRACT_MODEL':'test','RECON_ANALYZE_MODEL':'test'}):
            self.assertFalse(AIClient(self.store).configured)

class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.places={'p':{'id':'p','name':'Место','aliases':['Место']}}
        self.post={'id':'post1','source_id':'fishingsib','url':'https://www.fishingsib.ru/tidings/view/1/','title':'Место','place_id':'p','published':today()+'T12:00:00','author_key':'author','text':'Сегодня поймал окуня. Вода упала.','hash':'abc123'}
        self.item={'place_id':'p','place_precision':'Берег','outing_date':today(),'date_basis':'Сегодня','firsthand':True,'method':'спиннинг','species':['окунь'],'outcome':'Поимка окуня','water_state':None,'water_trend':'falling','measured_cm':None,'water_summary':'Автор отмечает падение воды','supporting_quote':'поймал окуня','water_quote':'Вода упала','access':None}

    def test_qualitative_water_stays_qualitative(self):
        observation=validate_extraction({'observations':[self.item]},self.post,self.places)[0]
        self.assertIsNone(observation['water_level']['measured_cm'])

    def test_invented_centimeters_date_quote_and_place_are_rejected(self):
        for change in [{'measured_cm':30},{'outing_date':'2001-01-01'},{'supporting_quote':'поймал щуку'},{'place_id':'unknown'}]:
            with self.assertRaises(ValueError):validate_extraction({'observations':[{**self.item,**change}]},self.post,self.places)

    def test_unknown_outing_date_is_preserved_privately(self):
        item={**self.item,'outing_date':None,'date_basis':None}
        self.assertIsNone(validate_extraction({'observations':[item]},self.post,self.places)[0]['outing_date'])

    def test_same_author_does_not_raise_confidence(self):
        observation=validate_extraction({'observations':[self.item]},self.post,self.places)[0]
        observations=[{**observation,'id':str(i),'_author_key':'same'} for i in range(2)]
        result={'status':'supported','summary':'Предварительный локальный сигнал.','reasons':[{'text':'Есть улов','evidence_ids':['0']}],'risks':[],'missing':[],'hypotheses':[]}
        brief=build_brief(result,self.places['p'],'окунь',observations)
        self.assertEqual(brief['independent_reports'],1);self.assertEqual(brief['status'],'preliminary')
        with self.assertRaises(ValueError):build_brief({**result,'reasons':[{'text':'Тезис','evidence_ids':['unknown']}]},self.places['p'],'окунь',observations)

class APITests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.service=Service(APP,Path(self.temp.name)/'api.sqlite')
        self.server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,service=self.service))
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.base=f'http://127.0.0.1:{self.server.server_port}'
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.temp.cleanup()
    def get(self,path,headers=None):return urlopen(Request(self.base+path,headers=headers or {}),timeout=3)

    def test_conditions_are_cached_and_target_specific(self):
        from urllib.parse import urlencode
        with self.get('/api/recon/conditions?'+urlencode({'place':'Новосибирск','species':'окунь'})) as response:
            value=json.load(response);self.assertEqual(len(value['briefs']),1);self.assertEqual(value['mode'],'server_cached')
        with self.get('/api/recon/conditions?'+urlencode({'place':'Новосибирск','species':'щука'})) as response:self.assertFalse(json.load(response)['briefs'])
        with self.service.store.connect() as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM usage').fetchone()[0],0)

    def test_config_and_health_do_not_claim_live_ai(self):
        with self.get('/api/health') as response:self.assertEqual(json.load(response)['recon_status'],'cached_only')
        with self.get('/recon-service-config.js') as response:self.assertIn(b'"/"',response.read())

    def test_private_files_unknown_api_and_mutations_are_blocked(self):
        for path in ['/server/.env.example','/%73erver/.env.example','/%2eenv','/server/storage.py','/api/unknown','/data/']:
            with self.assertRaises(HTTPError) as error:self.get(path)
            self.assertEqual(error.exception.code,404)
        with self.assertRaises(HTTPError) as error:urlopen(Request(self.base+'/api/refresh',data=b'{}'),timeout=3)
        self.assertEqual(error.exception.code,405)

    def test_only_configured_cors_origins_receive_header(self):
        with self.get('/api/health',{'Origin':'https://orelkin.github.io'}) as response:self.assertEqual(response.headers.get('Access-Control-Allow-Origin'),'https://orelkin.github.io')
        with self.get('/api/health',{'Origin':'https://untrusted.example'}) as response:self.assertIsNone(response.headers.get('Access-Control-Allow-Origin'))

class PipelineTests(unittest.TestCase):
    def test_source_to_cached_brief_with_controlled_ai_transport(self):
        # Controlled model responses exercise the full path without a paid API call.
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ,{'RECON_AI_PROVIDER':'openai','OPENAI_API_KEY':'unit-test-only','RECON_EXTRACT_MODEL':'test','RECON_ANALYZE_MODEL':'test'}):
            service=Service(APP,Path(directory)/'pipeline.sqlite')
            service.places={key:place for key,place in service.places.items() if key=='ob-novosibirsk'}
            service.places['ob-novosibirsk']['sources']=service.places['ob-novosibirsk']['sources'][:1]
            with service.store.connect() as db:
                db.execute('DELETE FROM observations');db.execute('DELETE FROM briefs')
            html=FISHINGSIB.replace('2 октября 2026, 18:18',today()+'T12:00:00').replace('class="author__block__dateActivity"','itemprop="datePublished"')
            service.reader=type('ControlledReader',(),{'read':lambda _,url:html})()
            requests=[]
            def transport(payload):
                requests.append(payload)
                value=json.loads(payload['input'][1]['content'])
                if payload['text']['format']['name']=='recon_extract':
                    item=EvidenceTests();item.setUp()
                    result={'observations':[{**item.item,'place_id':'ob-novosibirsk'}]}
                else:
                    identifier=value['observations'][0]['id']
                    result={'status':'preliminary','summary':'Есть недавний локальный отчёт по окуню; доступ и правила нужно уточнить.','reasons':[{'text':'Автор сообщил поимку окуня','evidence_ids':[identifier]}],'risks':[],'missing':['Доступ не проверен'],'hypotheses':[]}
                return {'status':'completed','usage':{'total_tokens':10},'output':[{'type':'message','content':[{'type':'output_text','text':json.dumps(result,ensure_ascii=False)}]}]}
            service.ai=AIClient(service.store,transport=transport)
            with patch.object(service,'weather',return_value=[]):
                result=service.refresh()
                self.assertEqual(result['analysis']['extracted'],1);self.assertEqual(result['analysis']['explained'],1)
                self.assertEqual(len(requests),2)
                service.refresh();self.assertEqual(len(requests),2)
            snapshot=service.conditions('Новосибирск','окунь')
            self.assertEqual(len(snapshot['briefs']),1);self.assertEqual(snapshot['briefs'][0]['analysis_kind'],'server_ai')
            self.assertEqual(snapshot['observations'][0]['outing_date'],today())
            self.assertNotIn('_post_hash',snapshot['observations'][0])
            self.assertFalse(service.conditions('Новосибирск','щука')['briefs'])
            service.ai.call=lambda *args: (_ for _ in ()).throw(RuntimeError('Provider unavailable'))
            with patch.object(service,'weather',return_value=[]):service.process()
            self.assertEqual(service.conditions('Новосибирск','окунь')['briefs'],snapshot['briefs'])

    def test_edited_report_versions_do_not_count_as_new_independent_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            store=Store(Path(directory)/'versions.sqlite')
            fixture=EvidenceTests();fixture.setUp()
            post=fixture.post;store.put_post(post)
            original=validate_extraction({'observations':[fixture.item]},post,fixture.places)
            store.record_extraction(post,original)
            updated={**post,'hash':'updated123'};store.put_post(updated)
            store.record_extraction(updated,validate_extraction({'observations':[fixture.item]},updated,fixture.places))
            self.assertEqual(len(store.observations()),1)
            self.assertEqual(len(store.observations(active_only=False)),2)

if __name__=='__main__':unittest.main(verbosity=1)
