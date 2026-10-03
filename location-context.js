/* Device position is ephemeral. A remembered choice never stores coordinates. */
(() => {
  'use strict';
  const KEY='rybalka.location-choice.v1';
  const regions=Object.freeze({
    'RU-MOW':{name:'Москва',code:'77',scene:'assets/regions/moscow-v1.webp',crest:'assets/regions/moscow-crest.svg',savedRegion:'Подмосковье'},
    'RU-MOS':{name:'Московская область',code:'50',scene:'assets/regions/moscow-oblast-v1.webp',crest:'assets/regions/moscow-oblast-crest.svg',savedRegion:'Подмосковье'},
    'RU-KHM':{name:'Ханты-Мансийский АО — Югра',code:'86',scene:'assets/desktop/lakeshore-hero.webp',savedRegion:'Нижневартовск'},
    'RU-AST':{name:'Астраханская область',code:'30',scene:'assets/regions/astrakhan-v1.webp',savedRegion:'Астраханская область'},
    'RU-DA':{name:'Дагестан',code:'05',scene:'assets/regions/dagestan-v1.webp',savedRegion:'Дагестан'}
  });
  let state={mode:'unset',status:'idle',name:'Моё местоположение',regionName:'',regionId:'',point:null,error:''};
  let serial=0, controller=null, lastAttempt=0, preference={mode:'unset'};
  const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
  const clean=v=>typeof v==='string'?v.replace(/[\u0000-\u001f]/g,'').trim().slice(0,120):'';
  function emit(){window.dispatchEvent(new CustomEvent('rybalka-location-changed',{detail:snapshot()}));}
  function snapshot(){return {...state,point:state.point?{...state.point}:null,art:regions[state.regionId]||null};}
  function remember(choice){preference=choice;try{localStorage.setItem(KEY,JSON.stringify(choice));}catch{}}
  function manual(id){
    const place=window.LiveWeather?.places.find(p=>p.id===id);if(!place)return;
    ++serial;controller?.abort();remember({mode:'manual',id});
    state={mode:'manual',status:'ready',name:place.name,regionName:regions[place.regionId]?.name||place.region,
      regionId:place.regionId||'',point:{...place},error:''};emit();
  }
  function normalizePosition(position,now=Date.now()){
    const c=position?.coords;
    if(!c||!finite(c.latitude,-90,90)||!finite(c.longitude,-180,180)||!finite(c.accuracy,0,1e6)||
       !finite(position.timestamp,now-120000,now+15000))throw new Error('invalid_position');
    return {latitude:c.latitude,longitude:c.longitude,accuracy:c.accuracy,timestamp:position.timestamp};
  }
  function locality(raw,point){
    if(!raw||!finite(raw.latitude,point.latitude-.01,point.latitude+.01)||
      !finite(raw.longitude,point.longitude-.01,point.longitude+.01)||/ip/i.test(raw.lookupSource||''))throw new Error('invalid_locality');
    const regionId=clean(raw.principalSubdivisionCode), regionName=clean(raw.principalSubdivision);
    return {name:clean(raw.locality)||clean(raw.city)||'Моё местоположение',regionId,regionName};
  }
  async function locate({explicit=true}={}){
    if(!navigator.geolocation){state={...state,status:'error',error:'Определение места недоступно. Можно выбрать место вручную.'};emit();return;}
    if(explicit)remember({mode:'device'});
    if(preference.mode!=='device')return;
    const own=++serial;controller?.abort();lastAttempt=Date.now();
    state=state.mode==='device'?{...state,status:'locating',error:''}:
      {mode:'device',status:'locating',name:'Моё местоположение',regionName:'',regionId:'',point:null,error:''};emit();
    try{
      const pos=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:20000,maximumAge:60000}));
      if(own!==serial)return;
      const point=normalizePosition(pos);
      state={mode:'device',status:'naming',name:'Моё местоположение',regionName:'',regionId:'',point,error:''};emit();
      controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
      try{
        // This free endpoint permits only live device coordinates; no server, stored or manual lookup.
        const query=new URLSearchParams({latitude:point.latitude,longitude:point.longitude,localityLanguage:'ru'});
        const response=await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?'+query,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
        if(!response.ok)throw new Error('name_unavailable');
        const named=locality(await response.json(),point);if(own!==serial)return;
        state={...state,...named,status:'ready'};
      }catch{
        if(own!==serial)return;
        state={...state,status:'ready',error:'Координаты определены; название места пока недоступно.'};
      }finally{clearTimeout(timer);}
      emit();
    }catch(error){
      if(own!==serial)return;
      state={...state,status:'error',error:error.code===1?'Доступ к местоположению закрыт. Разрешите его в браузере или выберите место вручную.':
        'Не удалось получить свежие координаты. Попробуйте ещё раз на открытом месте.'};emit();
    }
  }
  function weatherPoint(){
    if(!state.point)return null;
    if(state.mode==='manual')return {...state.point};
    if(Date.now()-state.point.timestamp>20*60e3)return null;
    return {id:'device',name:state.name,region:state.regionName,regionId:state.regionId,timezone:'auto',private:true,
      latitude:Math.round(state.point.latitude*1000)/1000,longitude:Math.round(state.point.longitude*1000)/1000};
  }
  async function resume(){
    if(preference.mode!=='device'||document.hidden||Date.now()-lastAttempt<60000)return;
    try{const permission=await navigator.permissions?.query({name:'geolocation'});
      if(permission?.state==='denied'){state={...state,status:'error',error:'Доступ к местоположению закрыт в браузере.'};emit();return;}
      if(permission?.state==='granted'||(!permission&&preference.mode==='device'))await locate({explicit:false});
    }catch{/* An explicit button remains available if the permission API cannot answer. */}
  }
  window.LocationContext=Object.freeze({regions,snapshot,manual,locate,weatherPoint,normalizePosition,locality});
  try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');
    if(saved?.mode==='device')preference={mode:'device'};
    else if(saved?.mode==='manual'&&typeof saved.id==='string')manual(saved.id);
  }catch{}
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)resume();});
  setInterval(()=>{if(!document.hidden&&document.querySelector('#screen-home.active')&&Date.now()-lastAttempt>=5*60e3)resume();},60000);
  Promise.resolve().then(resume);
})();
