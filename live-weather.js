/* Public town centres only. This cache is independent of the personal diary. */
(() => {
  'use strict';
  const places = Object.freeze([
    {id:'nizhnevartovsk',name:'Нижневартовск',region:'Нижневартовск',latitude:60.9344,longitude:76.5531,timezone:'Asia/Yekaterinburg'},
    {id:'izluchinsk',name:'Излучинск',region:'Нижневартовск',latitude:60.97944,longitude:76.92421,timezone:'Asia/Yekaterinburg'},
    {id:'astrakhan',name:'Астрахань',region:'Астраханская область',latitude:46.34968,longitude:48.04076,timezone:'Europe/Astrakhan'},
    {id:'makhachkala',name:'Махачкала',region:'Дагестан',latitude:42.97782,longitude:47.50027,timezone:'Europe/Moscow'},
    {id:'shcherbinka',name:'Щербинка',region:'Подмосковье',latitude:55.49972,longitude:37.55972,timezone:'Europe/Moscow'}
  ].map(Object.freeze));
  const CACHE_KEY = 'rybalka.weather.v1', TTL = 30*60e3, FRESH = 2*3600e3, MAX_AGE = 24*3600e3;
  const cache = new Map(), pending = new Map(), attempts = new Map();
  const number = (value,min,max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
  function requestURL(place) {
    const params = new URLSearchParams({latitude:place.latitude,longitude:place.longitude,
      current:'temperature_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl,precipitation',
      daily:'sunrise,sunset,temperature_2m_min,temperature_2m_max,weather_code',forecast_days:'3',
      timezone:place.timezone,wind_speed_unit:'ms',temperature_unit:'celsius',precipitation_unit:'mm',timeformat:'unixtime'});
    return 'https://api.open-meteo.com/v1/forecast?' + params;
  }
  function normalize(raw,place,now=Date.now()) {
    const c = raw?.current, units = raw?.current_units;
    if(!c || !units || raw.timezone !== place.timezone || units.time !== 'unixtime' ||
       number(raw.latitude,place.latitude-.2,place.latitude+.2) === null ||
       number(raw.longitude,place.longitude-.2,place.longitude+.2) === null) throw new Error('format');
    const time = number(c.time,1,1e11), temperature = number(c.temperature_2m,-100,70);
    if(time === null || temperature === null || units.temperature_2m !== '°C' || time*1000 > now+15*60e3 || now-time*1000 > MAX_AGE) throw new Error('time_or_temperature');
    for(const [key,unit] of [['apparent_temperature','°C'],['wind_speed_10m','m/s'],['wind_direction_10m','°'],['pressure_msl','hPa'],['precipitation','mm']]) {
      if(c[key] != null && units[key] !== unit) throw new Error('units');
    }
    const d=raw.daily, du=raw.daily_units;
    const daily = [];
    if(d && du?.time === 'unixtime' && du.temperature_2m_min === '°C' && du.temperature_2m_max === '°C') {
      (Array.isArray(d.time) ? d.time.slice(0,3) : []).forEach((value,i) => {
        const epoch=number(value,1,1e11), min=number(d.temperature_2m_min?.[i],-100,70), max=number(d.temperature_2m_max?.[i],-100,70);
        if(epoch !== null && min !== null && max !== null && min<=max) daily.push({time:epoch,min,max,
          sunrise:du.sunrise === 'unixtime' ? number(d.sunrise?.[i],1,1e11) : null,
          sunset:du.sunset === 'unixtime' ? number(d.sunset?.[i],1,1e11) : null,
          code:number(d.weather_code?.[i],0,99)});
      });
    }
    return {time,temperature,feels:number(c.apparent_temperature,-120,100),day:c.is_day === 1,
      code:number(c.weather_code,0,99),wind:number(c.wind_speed_10m,0,150),direction:number(c.wind_direction_10m,0,360),
      pressure:number(c.pressure_msl,800,1200),precipitation:number(c.precipitation,0,1000),daily};
  }
  function usable(entry,place,now) {
    if(!entry || number(entry.fetchedAt,1,now+15*60e3) === null || now-entry.fetchedAt > MAX_AGE) return null;
    try { return {...entry,data:normalize(entry.raw,place,now)}; } catch {return null;}
  }
  function restore() {
    try {
      const text=localStorage.getItem(CACHE_KEY);
      if(!text || text.length>100000) return;
      const stored=JSON.parse(text);
      for(const place of places) {const entry=usable(stored[place.id],place,Date.now());if(entry) cache.set(place.id,entry);}
    } catch { /* Weather remains usable when storage is blocked. */ }
  }
  function persist() {
    try {localStorage.setItem(CACHE_KEY,JSON.stringify(Object.fromEntries([...cache].map(([id,e])=>[id,{raw:e.raw,fetchedAt:e.fetchedAt}]))));} catch {}
  }
  function result(entry,place,fromCache,error=null) {
    return {place,data:entry?.data || null,fetchedAt:entry?.fetchedAt || null,fromCache,error,
      stale:!!entry && Date.now()-entry.data.time*1000 > FRESH,source:'Open-Meteo',url:requestURL(place)};
  }
  function get(id,{force=false}={}) {
    const place=places.find(p=>p.id === id);
    if(!place) return Promise.reject(new Error('unknown_place'));
    if(pending.has(id)) return pending.get(id);
    const now=Date.now(), entry=usable(cache.get(id),place,now);
    if(entry && !force && now-entry.fetchedAt < TTL && now-entry.data.time*1000 <= FRESH) return Promise.resolve(result(entry,place,true));
    if(now-(attempts.get(id) || 0)<30000) return Promise.resolve(result(entry,place,true,'retry_later'));
    attempts.set(id,now);
    const task=(async()=> {
      const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),12000);
      try {
        const response=await fetch(requestURL(place),{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
        if(!response.ok) throw new Error('http_'+response.status);
        const raw=await response.json(), fetchedAt=Date.now(), data=normalize(raw,place,fetchedAt);
        if(fetchedAt-data.time*1000 > FRESH) throw new Error('outdated_response');
        const next={raw,data,fetchedAt};cache.set(id,next);persist();
        return result(next,place,false);
      } catch(e) {return result(usable(cache.get(id),place,Date.now()),place,true,e.name === 'AbortError' ? 'timeout' : 'unavailable');}
      finally {clearTimeout(timer);}
    })().finally(()=>pending.delete(id));
    pending.set(id,task);return task;
  }
  restore();
  window.LiveWeather = Object.freeze({places,get,normalize,requestURL,freshFor:FRESH,cacheFor:TTL});
})();
