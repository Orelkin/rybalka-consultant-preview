"""Run: python server/recon_server.py --serve (loopback by default)."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import threading
from urllib.parse import parse_qs, urlsplit, unquote
from service import Service

APP = Path(__file__).resolve().parents[1]
DEFAULT_DB = APP.parent / 'data/server-runtime/recon.sqlite'

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, service, **kwargs):
        self.service=service
        super().__init__(*args, directory=str(APP), **kwargs)

    def log_message(self, *args):
        pass  # Do not record user queries or addresses in web logs.

    def cors(self):
        origin=self.headers.get('Origin')
        allowed=os.environ.get('RECON_ALLOWED_ORIGINS','https://orelkin.github.io,http://127.0.0.1:4173').split(',')
        if origin in allowed:
            self.send_header('Access-Control-Allow-Origin',origin)
            self.send_header('Vary','Origin')

    def output(self, value, status=200):
        raw=json.dumps(value,ensure_ascii=False).encode('utf-8')
        self.send_response(status); self.cors()
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(raw)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.end_headers(); self.wfile.write(raw)

    def do_GET(self):
        parsed=urlsplit(self.path)
        if len(self.path)>2000:
            return self.output({'error':'query_too_long'},400)
        if parsed.path=='/api/health':
            return self.output({'version':'recon-0.1','recon_available':True,'ai_configured':self.service.ai.configured,'recon_status':'cached_only','public_requests_trigger_ai':False})
        if parsed.path=='/api/recon/conditions':
            query=parse_qs(parsed.query)
            if set(query)-{'place','species'} or any(len(v[0])>160 for v in query.values()):
                return self.output({'error':'invalid_query'},400)
            try:
                return self.output(self.service.conditions(query.get('place',[''])[0],query.get('species',[''])[0]))
            except Exception:
                return self.output({'error':'conditions_unavailable'},503)
        if parsed.path=='/recon-service-config.js':
            body=b'window.RYBALKA_RECON_SERVICE_URL="/";'
            self.send_response(200); self.send_header('Content-Type','application/javascript');self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body);return
        if parsed.path.startswith('/api/'):
            return self.output({'error':'not_found'},404)
        # Never expose server configuration, directories or files outside the public app.
        decoded = unquote(parsed.path)
        if any(segment.startswith('.') for segment in decoded.split('/')) or decoded.startswith('/server/'):
            return self.output({'error':'not_found'},404)
        target=Path(self.translate_path(parsed.path)).resolve()
        if APP not in target.parents and target!=APP:
            return self.output({'error':'not_found'},404)
        if target.is_dir() and parsed.path!='/':
            return self.output({'error':'not_found'},404)
        return super().do_GET()

    def do_POST(self):
        self.output({'error':'read_only_api'},405)

    def do_OPTIONS(self):
        self.send_response(204);self.cors();self.send_header('Access-Control-Allow-Methods','GET, OPTIONS');self.end_headers()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--serve',action='store_true');parser.add_argument('--refresh',action='store_true')
    parser.add_argument('--export',metavar='PATH',help='Prepare a public summary JSON for review; does not publish to GitHub')
    parser.add_argument('--host',default=os.environ.get('RECON_HOST','127.0.0.1'))
    parser.add_argument('--port',type=int,default=int(os.environ.get('PORT','8787')))
    parser.add_argument('--db',default=os.environ.get('RECON_DB_PATH',str(DEFAULT_DB)))
    args=parser.parse_args();service=Service(APP,args.db)
    if args.refresh:
        print(json.dumps(service.refresh(),ensure_ascii=False))
    if args.export:
        snapshot=service.conditions();snapshot['mode']='reviewed_snapshot'
        destination=Path(args.export).resolve();destination.parent.mkdir(parents=True,exist_ok=True)
        staging=destination.with_suffix(destination.suffix+'.tmp')
        staging.write_text(json.dumps(snapshot,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        staging.replace(destination)
        print('Summary JSON prepared for review; no publishing performed.')
    if args.serve:
        stop=threading.Event()
        interval=int(os.environ.get('RECON_UPDATE_INTERVAL_SECONDS','0'))
        if interval:
            if interval<21600: parser.error('Background interval must be at least six hours')
            def worker():
                while not stop.is_set():
                    try: service.refresh()
                    except Exception: pass
                    stop.wait(interval)
            threading.Thread(target=worker,daemon=True).start()
        server=ThreadingHTTPServer((args.host,args.port),partial(Handler,service=service))
        print(f'Recon server ready on port {args.port}; AI configured: {service.ai.configured}',flush=True)
        try: server.serve_forever()
        except KeyboardInterrupt: pass
        finally: stop.set();server.server_close()
    elif not args.refresh and not args.export:
        parser.error('Choose --serve, --refresh or --export PATH')

if __name__=='__main__':
    main()
