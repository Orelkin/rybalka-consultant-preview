/* Private, versioned trip snapshots. No network or location access on load. */
(function(global){
 'use strict';
 const fail=m=>{throw new Error(m);};
 function object(v,allowed){if(!v||Array.isArray(v)||typeof v!=='object')fail('Некорректные сведения о рыбалке.');for(const k of Object.keys(v))if(!allowed.includes(k))fail('Неизвестное поле сведений: '+k);}
 function text(v,max=200){if(typeof v!=='string'||v.length>max||/[\u0000-\u001f\u007f]/.test(v))fail('Некорректный текст сведений.');return v.normalize('NFC').trim();}
 function time(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)fail('Некорректное время сведений.');return v;}
 function number(v,min,max,nullable=false){if(nullable&&v===null)return null;if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail('Некорректное числовое значение сведений.');return v;}
 function coords(p){return {latitude:number(p.latitude,-90,90),longitude:number(p.longitude,-180,180)};}
 function normalize(v){
  if(v==null)return null;object(v,['version','point','weather','gear']);if(v.version!==1)fail('Версия сведений о рыбалке не поддерживается.');
  let point=null,weather=null;
  if(v.point!=null){const p=v.point;object(p,['latitude','longitude','accuracy','capturedAt','source','label']);if(!['manual','device'].includes(p.source))fail('Неизвестный источник точки.');point={...coords(p),accuracy:number(p.accuracy,0,100000,p.source==='manual'),capturedAt:time(p.capturedAt),source:p.source,label:text(p.label,160)};}
  if(v.weather!=null){const w=v.weather;object(w,['provider','capturedAt','observedAt','latitude','longitude','timezone','temperature','feels','wind','direction','pressure','code']);if(w.provider!=='Open-Meteo')fail('Неизвестный источник погоды.');const timezone=text(w.timezone,80);try{new Intl.DateTimeFormat('ru',{timeZone:timezone});}catch{fail('Неизвестный часовой пояс погоды.');}
   weather={provider:w.provider,capturedAt:time(w.capturedAt),observedAt:time(w.observedAt),...coords(w),timezone,temperature:number(w.temperature,-100,70,true),feels:number(w.feels,-120,80,true),wind:number(w.wind,0,150,true),direction:number(w.direction,0,360,true),pressure:number(w.pressure,800,1200,true),code:number(w.code,0,99,true)};
   if(!point||Math.abs(point.latitude-weather.latitude)>.002||Math.abs(point.longitude-weather.longitude)>.002)fail('Погода относится к другой точке.');
  }
  if(!Array.isArray(v.gear)||v.gear.length>20)fail('Выберите не больше 20 снастей.');const ids=new Set();
  const gear=v.gear.map(g=>{object(g,['id','modelId','name','category','setup']);const id=text(g.id,128),modelId=text(g.modelId,128);if(!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(id)||!modelId||ids.has(id))fail('Некорректная или повторная снасть.');ids.add(id);object(g.setup,['reel','line','leader']);return {id,modelId,name:text(g.name),category:text(g.category,80),setup:{reel:text(g.setup.reel),line:text(g.setup.line),leader:text(g.setup.leader)}};});
  return !point&&!weather&&!gear.length?null:{version:1,point,weather,gear};
 }
 function today(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
 function samePoint(a,b){return !!a&&!!b&&a.latitude===b.latitude&&a.longitude===b.longitude;}
 function devicePoint(state,date){if(date!==today())fail('Место устройства можно прикрепить к сегодняшней рыбалке. Для прошлого выезда выберите точку на карте.');const p=state?.point;if(state.mode!=='device'||state.status==='error'||!p||Date.now()-p.timestamp>120000||p.timestamp>Date.now()+15000)fail('Сначала обновите местоположение устройства.');return normalize({version:1,point:{...coords(p),accuracy:p.accuracy,capturedAt:new Date(p.timestamp).toISOString(),source:'device',label:state.name||''},weather:null,gear:[]}).point;}
 async function captureWeather(point,date){
  if(date!==today())fail('Сегодняшнюю погоду нельзя добавить к прошлому или будущему выезду.');if(!point)fail('Сначала прикрепите точку рыбалки.');
  const request={id:'device',latitude:Number(point.latitude.toFixed(3)),longitude:Number(point.longitude.toFixed(3)),timezone:'auto',name:'Точка рыбалки',private:true};
  const result=await global.LiveWeather.getPoint(request);const d=result?.data;
  if(!d||result.error||Date.now()-d.time*1000>global.LiveWeather.freshFor)fail('Свежую погоду получить не удалось. Сведения в записи не заменены.');
  const weather={provider:'Open-Meteo',capturedAt:new Date(result.fetchedAt).toISOString(),observedAt:new Date(d.time*1000).toISOString(),latitude:request.latitude,longitude:request.longitude,timezone:d.timezone,temperature:d.temperature,feels:d.feels,wind:d.wind,direction:d.direction,pressure:d.pressure,code:d.code};
  return normalize({version:1,point,weather,gear:[]}).weather;
 }
 global.DiaryContext=Object.freeze({normalize,today,samePoint,devicePoint,captureWeather});
})(window);
