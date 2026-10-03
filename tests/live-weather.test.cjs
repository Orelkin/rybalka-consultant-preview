/* Run with Node; exercises units, clocks, failures and isolation, without network. */
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const script=readFileSync(join(__dirname,'../live-weather.js'),'utf8');
const start=Date.parse('2026-10-03T00:10:00Z');
const fixture={latitude:60.94,longitude:76.56,timezone:'Asia/Yekaterinburg',
  current_units:{time:'unixtime',temperature_2m:'°C',apparent_temperature:'°C',wind_speed_10m:'m/s',wind_direction_10m:'°',pressure_msl:'hPa',precipitation:'mm'},
  current:{time:start/1000-600,temperature_2m:0,apparent_temperature:-2,is_day:0,weather_code:3,wind_speed_10m:2.62,wind_direction_10m:42,pressure_msl:1016.9,precipitation:0},
  daily_units:{time:'unixtime',temperature_2m_min:'°C',temperature_2m_max:'°C',sunrise:'unixtime',sunset:'unixtime'},
  daily:{time:[start/1000-5*3600-600],temperature_2m_min:[-1],temperature_2m_max:[9],sunrise:[start/1000+3000],sunset:[start/1000+40000],weather_code:[3]}};
const copy=value=>JSON.parse(JSON.stringify(value));
function harness({stored={},fetcher=async()=>({ok:true,json:async()=>copy(fixture)}),brokenStorage=false,instantTimeout=false}={}) {
  let now=start,calls=0;
  const values=new Map(Object.entries(stored));values.set('rybalka.personal.diary','preserved');
  class Clock extends Date {static now(){return now;}}
  const context={Date:Clock,URLSearchParams,AbortController,window:{},
    setTimeout:instantTimeout ? fn=>{queueMicrotask(fn);return 1;} : setTimeout,clearTimeout:instantTimeout ? ()=>{} : clearTimeout,
    localStorage:{getItem:k=>{if(brokenStorage) throw Error('blocked');return values.get(k)||null;},setItem:(k,v)=>{if(brokenStorage) throw Error('blocked');values.set(k,v);}},
    fetch:(url,options)=>{calls++;return fetcher(url,options);}};
  vm.runInNewContext(script,context);
  return {api:context.window.LiveWeather,values,advance:ms=>{now+=ms;},calls:()=>calls};
}
(async()=>{
  const checks=[];
  async function check(name,fn){await fn();checks.push(name);}
  await check('zero temperature, fractional m/s, epochs and no personal data in request',async()=>{
    const h=harness({fetcher:async(url,options)=>{const u=new URL(url);assert.equal(u.origin,'https://api.open-meteo.com');assert.equal(u.searchParams.get('wind_speed_unit'),'ms');assert.equal(u.searchParams.get('timeformat'),'unixtime');assert.equal(u.searchParams.get('latitude'),'60.9344');assert.equal(options.credentials,'omit');return {ok:true,json:async()=>copy(fixture)};}});
    const r=await h.api.get('nizhnevartovsk');assert.equal(r.data.temperature,0);assert.equal(r.data.wind,2.62);assert.equal(r.data.time,fixture.current.time);assert.equal(r.error,null);assert.equal(h.values.get('rybalka.personal.diary'),'preserved');
  });
  await check('reject wrong units, place, timezone and future timestamp',()=>{
    const h=harness(),p=h.api.places[0];
    for(const change of [r=>r.current_units.wind_speed_10m='km/h',r=>r.longitude=48,r=>r.timezone='Europe/Moscow',r=>r.current.time=start/1000+3600]) {
      const r=copy(fixture);change(r);assert.throws(()=>h.api.normalize(r,p,start));
    }
  });
  await check('missing optional readings stay null',()=>{
    const h=harness(),r=copy(fixture);r.current.wind_speed_10m=null;r.current.pressure_msl=null;r.current.apparent_temperature=null;
    const d=h.api.normalize(r,h.api.places[0],start);assert.equal(d.wind,null);assert.equal(d.pressure,null);assert.equal(d.feels,null);
  });
  await check('deduplicate concurrent loads and reuse 30 minute cache',async()=>{
    const h=harness(),a=h.api.get('nizhnevartovsk'),b=h.api.get('nizhnevartovsk');assert.equal(a,b);await a;await h.api.get('nizhnevartovsk');assert.equal(h.calls(),1);
  });
  await check('provider failure preserves dated cache then marks it stale',async()=>{
    const entry={raw:fixture,fetchedAt:start};
    const h=harness({stored:{'rybalka.weather.v1':JSON.stringify({nizhnevartovsk:entry})},fetcher:async()=>{throw Error('offline');}});
    h.advance(35*60e3);let r=await h.api.get('nizhnevartovsk');assert.equal(r.error,'unavailable');assert.equal(r.data.temperature,0);assert.equal(r.stale,false);
    h.advance(2*3600e3);r=await h.api.get('nizhnevartovsk');assert.equal(r.stale,true);
    h.advance(24*3600e3);r=await h.api.get('nizhnevartovsk');assert.equal(r.data,null);
  });
  await check('old network response cannot be presented as fresh',async()=>{
    const raw=copy(fixture);raw.current.time-=3*3600;
    const h=harness({fetcher:async()=>({ok:true,json:async()=>raw})});const r=await h.api.get('nizhnevartovsk');assert.equal(r.data,null);assert.equal(r.error,'unavailable');
  });
  await check('corrupt storage, blocked storage and HTTP 429 degrade gracefully',async()=>{
    for(const opts of [{stored:{'rybalka.weather.v1':'{broken'}},{brokenStorage:true}]) {const h=harness(opts);assert.ok((await h.api.get('nizhnevartovsk')).data);}
    const h=harness({fetcher:async()=>({ok:false,status:429})});assert.equal((await h.api.get('nizhnevartovsk')).data,null);
  });
  await check('timeout aborts request and returns unavailable without hanging',async()=>{
    const h=harness({instantTimeout:true,fetcher:(url,opts)=>new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>{const error=Error('timeout');error.name='AbortError';reject(error);}))});
    const r=await h.api.get('nizhnevartovsk');assert.equal(r.error,'timeout');assert.equal(r.data,null);
  });
  await check('throttle rapid failures and release synchronously failed requests',async()=>{
    const h=harness({fetcher:()=>{throw Error('offline');}});await h.api.get('nizhnevartovsk');await h.api.get('nizhnevartovsk',{force:true});assert.equal(h.calls(),1);h.advance(31000);await h.api.get('nizhnevartovsk',{force:true});assert.equal(h.calls(),2);
  });
  await check('unknown place cannot issue a request',async()=>{
    const h=harness();await assert.rejects(h.api.get('private-point'));assert.equal(h.calls(),0);assert.equal(h.api.places.length,7);
  });
  await check('live device weather uses actual zone and never persists private coordinates',async()=>{
    const raw=copy(fixture);raw.timezone='Europe/Moscow';raw.latitude=55.72;raw.longitude=37.52;
    const h=harness({fetcher:async()=>({ok:true,json:async()=>raw})});
    const r=await h.api.getPoint({id:'device',private:true,latitude:55.72,longitude:37.52,timezone:'auto'});
    assert.equal(r.data.timezone,'Europe/Moscow');assert.ok(r.data);
    assert.deepEqual(JSON.parse(h.values.get('rybalka.weather.v1')),{});
    await assert.rejects(h.api.getPoint({id:'device',private:true,latitude:200,longitude:37,timezone:'auto'}));
  });
  console.log(JSON.stringify({passed:checks.length,checks},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
