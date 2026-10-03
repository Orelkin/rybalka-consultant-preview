const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..');
function harness({locate,fetcher,stored,permission='prompt'}={}){
 const data=new Map(Object.entries(stored||{})),listeners={},geo=[];let requests=0;
 const window={LiveWeather:{places:[{id:'moscow',name:'Москва',regionId:'RU-MOW',region:'Москва',latitude:55.75,longitude:37.61,timezone:'Europe/Moscow'},{id:'istra',name:'Истра',regionId:'RU-MOS',region:'Подмосковье',latitude:55.92,longitude:36.87,timezone:'Europe/Moscow'}]},dispatchEvent:event=>{listeners[event.type]?.(event);}};
 const context={window,Date,Intl,URLSearchParams,AbortController,CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},navigator:{geolocation:{getCurrentPosition:(ok,bad,options)=>{geo.push(options);locate?.(ok,bad);}},permissions:{query:async()=>({state:permission})}},document:{hidden:false,addEventListener:()=>{},querySelector:()=>null},localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},setTimeout,clearTimeout,setInterval:()=>{},fetch:async(...args)=>{requests++;return fetcher(...args);}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'location-context.js'),'utf8'),context);return {api:window.LocationContext,data,geo,requests:()=>requests};
}
const pos=()=>({coords:{latitude:55.734561,longitude:37.598765,accuracy:12},timestamp:Date.now()});
test('first opening does not assume home location or request access',async()=>{const h=harness();await Promise.resolve();assert.equal(h.api.snapshot().mode,'unset');assert.equal(h.api.weatherPoint(),null);assert.equal(h.geo.length,0);assert.equal(h.requests(),0);});
test('fresh GPS is used, Moscow ISO identity stays distinct, preference has no coordinates',async()=>{
 const h=harness({locate:ok=>ok(pos()),fetcher:async(url)=>{assert.equal(new URL(url).searchParams.get('latitude'),'55.734561');return {ok:true,json:async()=>({latitude:55.734561,longitude:37.598765,lookupSource:'reverseGeocoding',locality:'Хамовники',principalSubdivision:'Москва',principalSubdivisionCode:'RU-MOW'})};}});
 await h.api.locate();assert.equal(h.api.snapshot().name,'Хамовники');assert.equal(h.api.snapshot().art.code,'77');assert.equal(h.api.weatherPoint().latitude,55.735);assert.deepEqual(JSON.parse(h.data.get('rybalka.location-choice.v1')),{mode:'device'});
 h.api.manual('istra');assert.equal(h.api.snapshot().art.code,'50');assert.equal(h.api.weatherPoint().private,undefined);
});
test('permission refusal never makes manual or Moscow coordinates into GPS',async()=>{const h=harness({locate:(ok,bad)=>bad({code:1})});h.api.manual('moscow');await h.api.locate();assert.equal(h.api.snapshot().status,'error');assert.equal(h.api.weatherPoint(),null);assert.equal(h.requests(),0);});
test('stale position and IP-derived name are rejected',()=>{const h=harness();assert.throws(()=>h.api.normalizePosition({...pos(),timestamp:Date.now()-130000}));assert.throws(()=>h.api.locality({latitude:55.734561,longitude:37.598765,lookupSource:'ipGeolocation'},pos().coords));});
test('late device result cannot overwrite a later manual choice',async()=>{let success;const h=harness({locate:ok=>{success=ok;}});const task=h.api.locate();h.api.manual('istra');success(pos());await task;assert.equal(h.api.snapshot().name,'Истра');assert.equal(h.requests(),0);});
test('name outage keeps coordinates, unknown region gets no invented badge',async()=>{const h=harness({locate:ok=>ok(pos()),fetcher:async()=>{throw Error('offline');}});await h.api.locate();assert.ok(h.api.weatherPoint());assert.equal(h.api.snapshot().art,null);});
const voice={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'voice-notes-core.js'),'utf8'),voice);const extract=voice.window.VoiceNotesCore.extract;
test('voice draft preserves negative catch, exact numbers and tentative conclusion',()=>{
 const text='Место: Истринское водохранилище. Улов: щуку не поймал, было две поклёвки. Снасти: джиг 12 грамм. Условия: ветер и мутная вода. Вывод: возможно лучше вечером.';
 const d=extract(text);assert.equal(d.text,text);assert.equal(d.fish,'Щука');assert.equal(d.result,'щуку не поймал, было две поклёвки');assert.equal(d.conclusion,'возможно лучше вечером');assert.equal(d.method,'джиг 12 грамм');
});
test('spoken field labels work without punctuation and absent facts stay empty',()=>{const d=extract('место Истра улов две щуки снасти воблер условия тихо');assert.equal(d.location,'Истра');assert.equal(d.result,'две щуки');assert.equal(d.method,'воблер');assert.equal(d.conclusion,'');assert.equal(extract('Проверка звука').result,'');});
test('ambiguous unmarked utterance is retained without fabricating catch or fish',()=>{const d=extract('Сегодня пробовал новую приманку, результата пока не знаю');assert.equal(d.fish,'');assert.equal(d.result,'');assert.ok(d.method.includes('пока не знаю'));assert.throws(()=>extract('x'.repeat(5001)));});
