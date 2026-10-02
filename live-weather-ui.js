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
  let place=api.places[0], current=null, loading=false, serial=0, selectedDay=0, region='Нижневартовск', lastRequest=0;
  const time=(epoch,includeDate=false)=>new Intl.DateTimeFormat('ru-RU',{timeZone:place.timezone,...(includeDate ? {day:'2-digit',month:'2-digit'} : {}),hour:'2-digit',minute:'2-digit'}).format(new Date(epoch*1000));
  const dayKey=epoch=>new Intl.DateTimeFormat('en-CA',{timeZone:place.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(epoch*1000));
  function daily() {
    if(!current?.data) return [];
    return [0,1,2].map(i=>current.data.daily.find(d=>dayKey(d.time)===dayKey(Date.now()/1000+i*86400)));
  }
  function controls(mobile=false) {
    const choices=mobile ? api.places : api.places.filter(p=>p.region===region);
    return `<div class="lw-controls"><label>Погода: <select data-weather-place aria-label="Место для погоды">${choices.map(p=>`<option value="${p.id}" ${p.id===place.id ? 'selected' : ''}>${e(p.name)}</option>`).join('')}</select></label><button type="button" data-weather-refresh ${loading ? 'disabled' : ''}>${loading ? 'Обновление…' : 'Обновить'}</button></div>`;
  }
  function status() {
    if(!current?.data) return loading ? 'Получаем погоду…' : 'Погода сейчас недоступна';
    if(Date.now()-current.data.time*1000 > api.freshFor) return 'Устаревшие данные';
    if(current.error) return 'Сохранённые данные · обновить не удалось';
    return loading ? 'Обновляем погоду…' : 'Актуальные условия';
  }
  function provenance() {
    const d=current?.data;
    return `<div class="lw-source" aria-live="polite"><span class="lw-state">${status()}</span>${d ? `<span>На ${time(d.time,true)} · получено ${time(current.fetchedAt/1000,true)} · местное время</span>` : loading ? '' : '<span>Попробуйте обновить позже</span>'}<span>Центр города · модель погоды · <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> / <a href="https://open-meteo.com/en/licence" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></span></div>`;
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
      home.querySelector('.h1').textContent=place.name;
      home.querySelector('.h2').textContent=new Intl.DateTimeFormat('ru-RU',{timeZone:place.timezone,weekday:'long',day:'numeric',month:'long'}).format(new Date());
      let c=home.querySelector('.lw-mobile-controls');
      if(!c) {c=document.createElement('div');c.className='lw-mobile-controls';home.querySelector('.weather-big').before(c);}
      c.innerHTML=controls(true);
      home.querySelector('.weather-big').innerHTML=`<div class="icon" aria-hidden="true">${d ? symbol(d.code,d.day) : '☁️'}</div><div><div class="temp">${temp}</div><div class="desc">${e(desc)}${d?.feels != null ? `<small>Ощущается как ${degrees(d.feels)}</small>` : ''}</div></div>`;
      home.querySelector('.metrics').innerHTML=metrics.map(([label,value,title])=>`<div class="metric" title="${e(title)}"><div class="k">${label}</div><div class="v">${e(value)}</div></div>`).join('');
      let source=home.querySelector('.lw-mobile-source');
      if(!source) {source=document.createElement('div');source.className='lw-mobile-source';home.querySelector('.metrics').after(source);}
      source.innerHTML=provenance()+`<div class="lw-mobile-days">${!stale ? daily().map((day,i)=>day ? `<div><small>${['Сегодня','Завтра','Послезавтра'][i]}</small><strong>${degrees(day.min)}…${degrees(day.max)}</strong></div>` : '').join('') : ''}</div>`;
      const mini=document.querySelector('.miniweather');
      if(mini) {mini.querySelector('.t').textContent=temp;mini.querySelector('.s').textContent=stale ? 'Устарело' : place.name;}
    }
    const host=document.querySelector('.ds-today');
    if(host) {
      let c=host.querySelector('.lw-desktop-controls');
      if(!c) {c=document.createElement('div');c.className='lw-desktop-controls';host.querySelector('.ds-weather').before(c);}
      c.innerHTML=controls();
      host.querySelector('.ds-weather').innerHTML=`<span class="lw-icon" aria-hidden="true">${d ? symbol(d.code,d.day) : '☁️'}</span><span><strong>${temp}</strong><small>${e(desc)}${d?.feels != null ? ' · ощущается '+degrees(d.feels) : ''}</small></span>`;
      host.querySelectorAll('.ds-metric').forEach((metric,i)=>{metric.title=metrics[i][2];metric.querySelector('strong').textContent=metrics[i][1];});
      let source=host.querySelector('.lw-desktop-source');
      if(!source) {source=document.createElement('div');source.className='lw-desktop-source';host.querySelector('.ds-metrics').after(source);}
      source.innerHTML=provenance();
      const top=document.querySelector('.ds-top-weather');
      if(top) top.innerHTML=`<span class="lw-top-icon" aria-hidden="true">${d ? symbol(d.code,d.day) : '☁️'}</span><span><strong>${temp}</strong><small>${stale ? 'Устарело · '+time(d.time,true) : e(place.name)}${d?.feels != null ? '<br>ощущается '+degrees(d.feels) : ''}</small></span>`;
      const clock=document.getElementById('desktopClock'), today=daily()[0];
      if(clock && today?.sunrise && today?.sunset && !stale) clock.innerHTML=`<span title="Восход солнца">☀ ↑ ${time(today.sunrise)}</span><span title="Заход солнца">☀ ↓ ${time(today.sunset)}</span>`;
      const note=document.querySelector('.ds-forecast-note');if(note) note.innerHTML=forecastText();
    }
  }
  async function load(id,force=false) {
    const next=api.places.find(p=>p.id===id);if(!next) return;
    const changed=place.id!==id;place=next;region=place.region;
    if(changed) current=null;
    const own=++serial;loading=true;lastRequest=Date.now();render();
    const result=await api.get(id,{force});
    if(own!==serial) return;
    current=result;loading=false;render();
  }
  function setRegion(nextRegion) {
    region=nextRegion;
    const next=api.places.find(p=>p.region===region);
    if(!next) return;
    if(place.region!==region) load(next.id);
    else render();
  }
  document.addEventListener('click',event=>{if(event.target.closest('[data-weather-refresh]')) load(place.id,true);});
  document.addEventListener('change',event=>{if(event.target.matches('[data-weather-place]')) {
    const next=api.places.find(p=>p.id===event.target.value);
    if(!next) return;
    load(next.id);
    window.dispatchEvent(new CustomEvent('rybalka-weather-region-selected',{detail:{region:next.region}}));
  }});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden) load(place.id);});
  window.LiveWeatherUI=Object.freeze({setRegion,showDay(day){selectedDay=day;render();},place:()=>place,refreshView:render});
  load(place.id);
  // Only an open, visible home page may refresh at the 30 minute cadence.
  setInterval(()=>{
    if(document.activeElement?.matches('[data-weather-place]')) return;
    render();
    if(!document.hidden && document.querySelector('#screen-home.active') && !loading && Date.now()-lastRequest>=api.cacheFor) load(place.id);
  },60000);
})();
