(function(global){
 'use strict';
 const element=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
 const button=(text,fn)=>{const b=element('button',text);b.type='button';b.className='pd-button';b.addEventListener('click',fn);return b;};
 const readableTime=w=>new Intl.DateTimeFormat('ru-RU',{timeZone:w.timezone,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(w.observedAt));
 function weatherText(w){const t=v=>v===null?'нет данных':String(v).replace('.',',');return `${readableTime(w)} · воздух ${t(w.temperature)} °C · ветер ${t(w.wind)} м/с · давление ${t(w.pressure)} гПа`;}
 function showMap(point,title){
  go('map');initRealMap();
  setTimeout(()=>{if(typeof L==='undefined'||!fishingMap)return;global.DiaryContextUI.marker?.remove();const marker=L.marker([point.latitude,point.longitude]).addTo(fishingMap);const popup=element('div',title||'Точка из дневника');marker.bindPopup(popup);fishingMap.invalidateSize();fishingMap.setView([point.latitude,point.longitude],14);marker.openPopup();global.DiaryContextUI.marker=marker;},150);
 }
 function renderCard(card,context,title){
  if(!context)return;const box=element('div');box.className='dc-card';
  if(context.point){const p=context.point;box.append(element('strong','Точка рыбалки'),element('p',`${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)} · ${p.source==='device'?'с устройства, точность ±'+Math.round(p.accuracy)+' м':'выбрана вручную'}`),button('Показать на карте',()=>showMap(p,title)));}
  if(context.weather){box.append(element('strong','Погода при записи'),element('p',weatherText(context.weather)),element('small','Open-Meteo · модель погоды. Температура воды не измерена.'));}
  if(context.gear.length){box.append(element('strong','Снасти на этой рыбалке'));for(const g of context.gear){box.append(element('p',g.name));const s=g.setup;const setup=[s.reel&&'Катушка: '+s.reel,s.line&&'Леска: '+s.line,s.leader&&'Поводок: '+s.leader].filter(Boolean).join(' · ');if(setup)box.append(element('small',setup));}}
  card.append(box);
 }
 function create(form,message){
  const box=element('details');box.className='dc-panel';
  box.innerHTML='<h4>Место, условия и снасти</h4><p class="pd-muted">Прикрепите точку и сохраните условия этого выезда. Координаты войдут только в личную запись и вашу копию данных.</p><div class="dc-actions"></div><p class="dc-point" role="status"></p><div class="dc-coordinates"><label>Широта<input inputmode="decimal" data-dc="latitude" placeholder="Например, 55.90"></label><label>Долгота<input inputmode="decimal" data-dc="longitude" placeholder="Например, 36.80"></label></div><div class="dc-manual-actions"></div><div class="dc-map" hidden></div><p class="dc-privacy pd-muted">Карта загружает тайлы OpenStreetMap. Для погоды округлённые координаты отправляются в Open-Meteo. Название места в записи при этом не меняется.</p><div class="dc-weather-actions"></div><p class="dc-weather" role="status"></p><h4>Мои снасти</h4><div class="dc-gear"></div><p class="pd-muted">Сохраняется комплект на момент записи. Последующие изменения снасти не перепишут историю.</p>';
  box.prepend(element('summary','Точка на карте, погода и мои снасти'));
  form.querySelector('[type="submit"]').parentElement.before(box);
  let state=null,gear=[],map=null,marker=null,revision=0,busy=false,formDate='';
  const lat=box.querySelector('[data-dc="latitude"]'),lon=box.querySelector('[data-dc="longitude"]'),mapHost=box.querySelector('.dc-map');
  function empty(){return {version:1,point:null,weather:null,gear:[]};}
  const pointLabel=box.querySelector('.dc-point'),weatherLabel=box.querySelector('.dc-weather');
  function render(){const p=state?.point;pointLabel.textContent=p?`${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)} · ${p.source==='device'?'место устройства, точность ±'+Math.round(p.accuracy)+' м':'выбрано вручную'}`:'Точка не прикреплена';lat.value=p?.latitude??'';lon.value=p?.longitude??'';weatherLabel.textContent=state?.weather?weatherText(state.weather)+' · Open-Meteo · сохранённые условия':form.elements.date.value===DiaryContext.today()?'Погода не прикреплена':'Для другого дня сегодняшняя погода не подходит. Опишите известные условия в заметках.';weatherButton.disabled=busy||!p||form.elements.date.value!==DiaryContext.today();deviceButton.disabled=busy||form.elements.date.value!==DiaryContext.today();}
  function choose(point){revision++;state ||=empty();if(!DiaryContext.samePoint(point,state.point))state.weather=null;state.point=point;render();if(map){marker?.remove();marker=L.marker([point.latitude,point.longitude]).addTo(map);map.setView([point.latitude,point.longitude],Math.max(map.getZoom(),12));}}
  const deviceButton=button('Прикрепить моё место',async()=>{
   const own=++revision,date=form.elements.date.value;deviceButton.disabled=true;
   try{let s=global.LocationContext?.snapshot();try{DiaryContext.devicePoint(s,date);}catch{await global.LocationContext?.locate();s=global.LocationContext?.snapshot();}const p=DiaryContext.devicePoint(s,date);if(own!==revision||form.hidden||date!==form.elements.date.value)return;choose(p);message('Точка устройства прикреплена к этой записи. Проверьте точность.');}catch(e){message(e.message,true);}finally{render();}
  });
  box.querySelector('.dc-actions').append(deviceButton,button('Убрать точку',()=>{revision++;state ||=empty();state.point=null;state.weather=null;marker?.remove();marker=null;render();}));
  box.querySelector('.dc-manual-actions').append(button('Прикрепить координаты',()=>{try{if(!lat.value.trim()||!lon.value.trim())throw Error('Укажите обе координаты.');const point=DiaryContext.normalize({version:1,point:{latitude:Number(lat.value.replace(',','.')),longitude:Number(lon.value.replace(',','.')),accuracy:null,capturedAt:new Date().toISOString(),source:'manual',label:''},weather:null,gear:[]}).point;choose(point);message('Точка прикреплена. Название места укажите в поле «Место».');}catch(e){message(e.message,true);}}),button('Выбрать на карте',()=>{
   if(typeof L==='undefined'){message('Карта недоступна. Можно ввести координаты вручную.',true);return;}mapHost.hidden=false;
   if(!map){map=L.map(mapHost,{zoomControl:true});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);map.on('click',event=>choose({latitude:event.latlng.lat,longitude:event.latlng.lng,accuracy:null,capturedAt:new Date().toISOString(),source:'manual',label:''}));}
   const p=state?.point;map.setView(p?[p.latitude,p.longitude]:[55.75,37.62],p?12:5);if(p){marker?.remove();marker=L.marker([p.latitude,p.longitude]).addTo(map);}setTimeout(()=>map.invalidateSize(),50);message('Нажмите на карту в месте ловли. Это ручной выбор, не местоположение устройства.');
  }));
  const weatherButton=button('Сохранить погоду сейчас',async()=>{const own=revision,date=form.elements.date.value;busy=true;render();weatherLabel.textContent='Получаем условия…';try{const w=await DiaryContext.captureWeather(state?.point,date);if(own!==revision||form.hidden||date!==form.elements.date.value)return;state.weather=w;message('Условия сохранены для этой точки. Проверьте время наблюдения.');}catch(e){message(e.message,true);}finally{busy=false;render();}});
  box.querySelector('.dc-weather-actions').append(weatherButton,button('Убрать погоду',()=>{revision++;state ||=empty();state.weather=null;render();}));
  function renderGear(){const host=box.querySelector('.dc-gear');host.replaceChildren();const selected=new Map((state?.gear||[]).map(g=>[g.id,g]));const available=new Map(gear.map(g=>[g.id,g]));for(const [id,g] of selected)if(!available.has(id))available.set(id,g);
   if(!available.size){host.append(element('p','Список пуст. Добавьте комплект в разделе «Снасти» или загрузите копию личных данных.'));return;}
   for(const g of available.values()){const label=element('label'),input=element('input');input.type='checkbox';input.checked=selected.has(g.id);input.addEventListener('change',()=>{state ||=empty();if(input.checked){if(state.gear.length>=20){input.checked=false;message('Не больше 20 снастей на запись.',true);return;}state.gear.push({id:g.id,modelId:g.modelId,name:g.name,category:g.category,setup:{...g.setup}});}else state.gear=state.gear.filter(s=>s.id!==g.id);});label.append(input,element('span',g.name+(g.archived?' · архив':'')));host.append(label);}
  }
  async function reset(context){revision++;const own=revision;state=DiaryContext.normalize(context)||empty();formDate=form.elements.date.value;mapHost.hidden=true;marker?.remove();marker=null;render();renderGear();try{const next=await global.PersonalGear.list();if(own!==revision)return;gear=next;renderGear();}catch(e){message(e.message,true);}}
  form.elements.date.addEventListener('change',()=>{if(formDate===form.elements.date.value)return;formDate=form.elements.date.value;revision++;if(state?.weather){state.weather=null;message('Дата изменилась: погода удалена из черновика, чтобы не приписывать условия другому дню.');}if(state?.point?.source==='device'){state.point=null;message('Дата изменилась: точку устройства нужно подтвердить заново или выбрать вручную.');}render();});
  render();
  return {reset,value:()=>DiaryContext.normalize(state),invalidate:()=>{revision++;}};
 }
 global.DiaryContextUI={create,renderCard,showMap,marker:null};
})(window);
