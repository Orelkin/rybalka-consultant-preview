/* Weather is a condition input, not a probability of catching fish. */
(() => {
  'use strict';
  const api=window.LiveWeather;
  if(!api) return;
  const e=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const codes={0:'Ясно',1:'Преимущественно ясно',2:'Переменная облачность',3:'Пасмурно',45:'Туман',48:'Изморозь и туман',51:'Слабая морось',53:'Морось',55:'Сильная морось',56:'Переохлаждённая морось',57:'Переохлаждённая морось',61:'Небольшой дождь',63:'Дождь',65:'Сильный дождь',66:'Переохлаждённый дождь',67:'Переохлаждённый дождь',71:'Небольшой снег',73:'Снег',75:'Сильный снег',77:'Снежные зёрна',80:'Небольшие ливни',81:'Ливни',82:'Сильные ливни',85:'Снежные заряды',86:'Сильные снежные заряды',95:'Гроза',96:'Гроза с градом',99:'Гроза с градом'};
  const number=(value,digits=0)=>value == null ? '—' : new Intl.NumberFormat('ru-RU',{maximumFractionDigits:digits}).format(value);
  const degrees=value=>value == null ? '—°' : (value>0 ? '+' : '')+number(value)+'°';
  const descriptions=code=>codes[code] || 'Условия не уточнены';
  const symbol=(code,day=true)=>code === 0 ? (day ? '☀️' : '🌙') : code<3 ? (day ? '⛅' : '☁️') : code<50 ? '☁️' : code<70 ? '🌧️' : code<80 || [85,86].includes(code) ? '🌨️' : code<90 ? '🌧️' : '⛈️';
  const location=window.LocationContext;
  let place=null, current=null, loading=false, serial=0, selectedDay=0, region='', lastRequest=0;
  const zone=()=>current?.data?.timezone||(place?.timezone&&place.timezone!=='auto'?place.timezone:Intl.DateTimeFormat().resolvedOptions().timeZone);
  const time=(epoch,includeDate=false)=>new Intl.DateTimeFormat('ru-RU',{timeZone:zone(),...(includeDate ? {day:'2-digit',month:'2-digit'} : {}),hour:'2-digit',minute:'2-digit'}).format(new Date(epoch*1000));
  const dayKey=epoch=>new Intl.DateTimeFormat('en-CA',{timeZone:zone(),year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(epoch*1000));
  function daily() {
    if(!current?.data) return [];
    return [0,1,2].map(i=>current.data.daily.find(d=>dayKey(d.time)===dayKey(Date.now()/1000+i*86400)));
  }
  function controls(mobile=false) {
    const state=location?.snapshot(), busy=['locating','naming'].includes(state?.status);
    return `<div class="lw-controls"><button class="lc-detect" type="button" data-location-detect ${busy?'disabled':''}>⌖ ${busy?'Определяем…':state?.mode==='device'?'Обновить моё место':'Моё местоположение'}</button><label><span class="lc-sr">Выбрать вручную</span><select data-weather-place aria-label="Выбрать место вручную"><option value="">Выбрать вручную</option>${api.places.map(p=>`<option value="${p.id}" ${state?.mode==='manual'&&p.id===place?.id?'selected':''}>${e(p.name)}</option>`).join('')}</select></label>${place?`<button type="button" data-weather-refresh ${loading?'disabled':''}>↻<span class="lc-sr">Обновить погоду</span></button>`:''}</div>`;
  }
  function status() {
    if(!current?.data) return loading ? 'Получаем погоду…' : !place?'Определите место для погоды':'Погода сейчас недоступна';
    if(Date.now()-current.data.time*1000 > api.freshFor) return 'Устаревшие данные';
    if(current.error) return 'Сохранённые данные · обновить не удалось';
    return loading ? 'Обновляем погоду…' : 'Актуальные условия';
  }
  function provenance() {
    const d=current?.data;
    return `<div class="lw-source" aria-live="polite"><span class="lw-state">${status()}</span>${d ? `<span>На ${time(d.time,true)} · получено ${time(current.fetchedAt/1000,true)} · местное время</span>` : ''}${place?`<span>${place.private?'По координатам устройства':'Центр выбранного города'} · модель погоды · <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> / <a href="https://open-meteo.com/en/licence" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></span>`:''}</div>`;
  }
  function locationInfo(){
    const s=location?.snapshot();if(!s)return '';
    const fresh=s.status!=='error'&&s.point?.timestamp&&Date.now()-s.point.timestamp<20*60e3;
    const badge=s.art?`<span class="lc-badge">${s.art.crest?`<img src="${e(s.art.crest)}" alt="Герб: ${e(s.art.name)}" width="27" height="32">`:''}<span>${e(s.art.name)}<small>Регион ${e(s.art.code)}</small></span></span>`:'';
    return `<div class="lc-caption">${badge}<span>${s.mode==='manual'?'Выбрано вручную':s.point?(fresh?'Место устройства':'Последнее определённое место'):'Разрешите доступ к местоположению'}${s.art?.scene?' · иллюстрация региона':''}</span></div>${s.error?`<p class="lc-notice" role="status">${e(s.error)}</p>`:''}<details class="lc-details"><summary>О местоположении${s.point&&s.mode==='device'?' · точность ±'+Math.round(s.point.accuracy)+' м':''}</summary>${s.point&&s.mode==='device'?`<p>Координаты: ${s.point.latitude.toFixed(5)}, ${s.point.longitude.toFixed(5)}. Определено ${time(s.point.timestamp/1000)}.</p>`:''}<p>Название города и региона определяет <a href="https://www.bigdatacloud.com/free-api/free-reverse-geocode-to-city-api" target="_blank" rel="noopener noreferrer">BigDataCloud</a> по координатам устройства. Для погоды координаты округляются и отправляются в Open-Meteo. Точное положение не публикуется и не записывается в общий кеш.</p></details>`;
  }
  function renderLocation(host,mobile){
    const s=location?.snapshot();if(!s)return;
    host.querySelector(mobile?'.h1':'h1').textContent=s.name;
    const scene=s.art?.scene||'assets/desktop/forest-lake.webp';
    if(mobile)host.style.setProperty('--hero',`url("${scene}")`);
    else host.style.setProperty('--ds-scenery',`url("${scene}")`);
    let info=host.querySelector('.lc-info');if(!info){info=document.createElement('div');info.className='lc-info';host.querySelector(mobile?'.h2':'.ds-date').after(info);}
    info.innerHTML=locationInfo();
    const label=document.getElementById('desktopRegionLabel');if(label)label.textContent=s.name;
  }
  function forecastText() {
    const ds=daily(), d=ds[selectedDay];
    return d && current?.data && Date.now()-current.data.time*1000<=api.freshFor ? `<span class="lw-daily">${['Сегодня','Завтра','Послезавтра'][selectedDay]}: ${degrees(d.min)}…${degrees(d.max)} · ${e(descriptions(d.code))}</span>Погода получена. Условия воды ещё не подключены; прогноз клёва не рассчитан.` : 'Для прогноза нужны свежие условия воды и выбранный водоём. Прогноз клёва не рассчитан.';
  }
  function render() {
    const d=current?.data, stale=d && Date.now()-d.time*1000 > api.freshFor;
    const desc=d ? descriptions(d.code) : status(), temp=degrees(d?.temperature);
    const wind=d?.direction == null ? '' : ['С','СВ','В','ЮВ','Ю','ЮЗ','З','СЗ'][Math.round(d.direction/45)%8]+' ';
    const metrics=[['Ветер',d?.wind == null ? '— м/с' : wind+number(d.wind,1)+' м/с','Ветер на высоте 10 м'],['Давление',number(d?.pressure)+' гПа','Давление, приведённое к уровню моря'],['Вода','Нет данных','Температура воды ещё не подключена'],['Уровень воды','Нет данных','Изменение уровня воды ещё не подключено']];
    const home=document.querySelector('#screen-home>.hero');
    if(home) {
      home.classList.add('lw-mobile');
      home.querySelector('.kicker').textContent='ПОГОДА ПЕРЕД ВЫЕЗДОМ';
      renderLocation(home,true);
      home.querySelector('.h2').textContent=new Intl.DateTimeFormat('ru-RU',{timeZone:zone(),weekday:'long',day:'numeric',month:'long'}).format(new Date());
      let c=home.querySelector('.lw-mobile-controls');
      if(!c) {c=document.createElement('div');c.className='lw-mobile-controls';home.querySelector('.weather-big').before(c);}
      c.innerHTML=controls(true);
      home.querySelector('.weather-big').innerHTML=`<div class="icon" aria-hidden="true">${d ? symbol(d.code,d.day) : '☁️'}</div><div><div class="temp">${temp}</div><div class="desc">${e(desc)}${d?.feels != null ? `<small>Ощущается как ${degrees(d.feels)}</small>` : ''}</div></div>`;
      home.querySelector('.metrics').innerHTML=metrics.map(([label,value,title])=>`<div class="metric" title="${e(title)}"><div class="k">${label}</div><div class="v">${e(value)}</div></div>`).join('');
      let source=home.querySelector('.lw-mobile-source');
      if(!source) {source=document.createElement('div');source.className='lw-mobile-source';home.querySelector('.metrics').after(source);}
      source.innerHTML=provenance()+`<div class="lw-mobile-days">${!stale ? daily().map((day,i)=>day ? `<div><small>${['Сегодня','Завтра','Послезавтра'][i]}</small><strong>${degrees(day.min)}…${degrees(day.max)}</strong></div>` : '').join('') : ''}</div>`;
      const mini=document.querySelector('.miniweather');
      if(mini) {mini.querySelector('.t').textContent=temp;mini.querySelector('.s').textContent=stale ? 'Устарело' : place?.name||'Моё место';}
    }
    const host=document.querySelector('.ds-today');
    if(host) {
      renderLocation(host,false);
      let c=host.querySelector('.lw-desktop-controls');
      if(!c) {c=document.createElement('div');c.className='lw-desktop-controls';host.querySelector('.ds-weather').before(c);}
      c.innerHTML=controls();
      host.querySelector('.ds-weather').innerHTML=`<span class="lw-icon" aria-hidden="true">${d ? symbol(d.code,d.day) : '☁️'}</span><span><strong>${temp}</strong><small>${e(desc)}${d?.feels != null ? ' · ощущается '+degrees(d.feels) : ''}</small></span>`;
      host.querySelectorAll('.ds-metric').forEach((metric,i)=>{metric.title=metrics[i][2];metric.querySelector('strong').textContent=metrics[i][1];});
      let source=host.querySelector('.lw-desktop-source');
      if(!source) {source=document.createElement('div');source.className='lw-desktop-source';host.querySelector('.ds-metrics').after(source);}
      source.innerHTML=provenance();
      const top=document.querySelector('.ds-top-weather');
      if(top) top.innerHTML=`<span class="lw-top-icon" aria-hidden="true">${d ? symbol(d.code,d.day) : '☁️'}</span><span><strong>${temp}</strong><small>${stale ? 'Устарело · '+time(d.time,true) : e(place?.name||'Моё место')}${d?.feels != null ? '<br>ощущается '+degrees(d.feels) : ''}</small></span>`;
      const clock=document.getElementById('desktopClock'), today=daily()[0];
      if(clock && today?.sunrise && today?.sunset && !stale) clock.innerHTML=`<span title="Восход солнца">☀ ↑ ${time(today.sunrise)}</span><span title="Заход солнца">☀ ↓ ${time(today.sunset)}</span>`;
      const note=document.querySelector('.ds-forecast-note');if(note) note.innerHTML=forecastText();
    }
  }
  async function load(next,force=false) {
    if(!next){++serial;place=null;current=null;loading=false;render();return;}
    const changed=place?.id!==next.id||place?.latitude!==next.latitude||place?.longitude!==next.longitude;place=next;region=place.region;
    if(changed) current=null;
    const own=++serial;loading=true;lastRequest=Date.now();render();
    const result=await (next.private?api.getPoint(next,{force}):api.get(next.id,{force}));
    if(own!==serial) return;
    current=result;loading=false;render();
  }
  function setRegion(nextRegion) {
    // Region browse and personal refresh must not silently overwrite device location.
    render();
  }
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-location-detect]'))location?.locate();
    if(event.target.closest('[data-weather-refresh]')&&place)load(place,true);
  });
  document.addEventListener('change',event=>{if(event.target.matches('[data-weather-place]')) {
    const next=api.places.find(p=>p.id===event.target.value);
    if(!next) return;
    location?.manual(next.id);
  }});
  let pointKey='';
  function syncLocation(){
    const next=location?.weatherPoint(), key=next?[next.id,next.latitude,next.longitude].join(':'):'';
    if(key!==pointKey){pointKey=key;load(next);}else {if(next)place=next;render();}
  }
  window.addEventListener('rybalka-location-changed',syncLocation);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){syncLocation();if(place)load(place);}});
  window.LiveWeatherUI=Object.freeze({setRegion,showDay(day){selectedDay=day;render();},place:()=>({...place,timezone:zone()}),refreshView:render});
  syncLocation();render();
  // Only an open, visible home page may refresh at the 30 minute cadence.
  setInterval(()=>{
    if(document.activeElement?.matches('[data-weather-place]')) return;
    syncLocation();
    if(place&&!document.hidden && document.querySelector('#screen-home.active') && !loading && Date.now()-lastRequest>=api.cacheFor) load(place);
  },60000);
})();
