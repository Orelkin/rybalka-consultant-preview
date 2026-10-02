/* Desktop presentation reuses the canonical router and data; it owns no records. */
(() => {
  'use strict';
  if (document.getElementById('desktop-dashboard')) return;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paths = {
    home:'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
    pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM9 10a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
    map:'m3 5 6-2 6 3 6-2v16l-6 2-6-3-6 2ZM9 3v16M15 6v16',
    where:'m3 18 6-12 5 5 4-8 3 6M3 21h18M9 6l1 8',
    diary:'M5 3h13v18H5ZM3 6h4M3 10h4M3 14h4M3 18h4M10 8h5M10 12h5M10 16h3',
    water:'m3 11 5-5 4 4 4-6 5 7M3 16q3-3 6 0t6 0t6 0M3 21q3-3 6 0t6 0t6 0',
    fish:'M3 12q8-10 16 0-8 10-16 0ZM19 12l3-4v8ZM3 12l-2-3v6M14 10h.01',
    methods:'m3 21 9-18 9 18M12 10v6M12 20h.01',
    gear:'m4 20 14-16M4 20l4 1 3-3M14 8l2 2M17 5l2 2',
    lure:'M9 3v11a5 5 0 0 0 10 0v-3M9 3l-3 3M6 17a4 4 0 0 1-4-4 4 4 0 0 1 4-4h3',
    research:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM15 15l7 7M7 10h6M10 7v6',
    car:'m3 10 3-6h12l3 6M3 10h18v9H3ZM5 19v2M19 19v2M6 14h2M16 14h2',
    book:'M12 5q-5-4-10-1v16q5-3 10 1 5-4 10-1V4q-5-3-10 1ZM12 5v16',
    stats:'M4 21V11h4v10M10 21V6h4v15M16 21V2h4v19',
    settings:'m9 3-1 3-3 1-2 3 2 2-1 3 2 3 3-1 3 2 3-2 3 1 2-3-1-3 2-2-2-3-3-1-1-3ZM9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
    search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM15 15l6 6',
    cloud:'M7 19a5 5 0 0 1-1-10 7 7 0 0 1 13 1 4.5 4.5 0 0 1-1 9ZM6 4l1-2M2 7l-2-1M11 3V1',
    clock:'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20ZM12 6v6l4 2',
    wind:'M3 8h12a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M3 16h7a3 3 0 1 1-3 3',
    temp:'M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0ZM12 8v9M18 6h3M18 10h2',
    plus:'M12 4v16M4 12h16',
    calendar:'M4 5h16v16H4ZM8 2v6M16 2v6M4 10h16M8 14h.01M12 14h.01M16 14h.01'
  };
  const icon = name => `<svg class="ds-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.fish}"/></svg>`;
  const routes = [
    ['home','Главная','home'],['map','Карта','pin'],['research','Куда ехать','where'],['diary','Дневник','diary'],
    ['waters','Водоёмы','water'],['fish','Рыбы','fish'],['methods','Методы ловли','methods'],['gear','Снасти','fish'],
    ['lures','Приманки','lure'],['researchbase','Исследования','research'],['trips','Поездки из Щербинки','car'],
    ['knowledge','База знаний','book'],['desktopstats','Статистика','stats'],['desktopsettings','Настройки','settings']
  ];
  const regions = Object.entries(REGION_DETAIL);
  const scenes = {sunset:'assets/desktop/lakeshore-hero.webp',lake:'assets/desktop/forest-lake.webp'};
  let region = regions.find(([name]) => name.startsWith('Нижневартовск'))?.[0] || regions[0][0];
  let selectedDay = 0;
  let lastPrimary = 'home';
  const regionLabel = () => region.startsWith('Нижневартовск') ? 'Нижневартовск / Излучинск' : region;
  const image = (src, alt = '') => `<img src="${escape(src)}" alt="${escape(alt)}" decoding="async" loading="lazy">`;
  const scenic = () => scenes.sunset;
  const short = (value, limit = 92) => { const s = String(value || ''); return s.length > limit ? s.slice(0, limit - 1) + '…' : s; };
  const routeButton = (route, label, name) => `<button type="button" data-desktop-route="${route}">${icon(name)}<span>${label}</span></button>`;
  const panelHead = (title, route, label = 'Все →') => `<div class="ds-panel-head"><h2>${title}</h2>${route ? `<button class="ds-link" type="button" data-desktop-route="${route}">${label}</button>` : ''}</div>`;
  let personalRecords = null;
  const records = () => personalRecords || (Array.isArray(window.PERSONAL_DIARY_RECORDS) ? window.PERSONAL_DIARY_RECORDS : []);
  const knowledge = () => window.FISH_KNOWLEDGE_V1 || {cards:[],sources:[]};
  const totals = () => [
    [DATA.fishCatalog.length,'Видов рыб'],[(knowledge().cards || []).length,'Подробных карточек'],
    [(knowledge().sources || []).length,'Источников'],[DATA.diary.length,'Сохранённых выездов']
  ];
  const stats = () => `<div class="ds-stats">${totals().map(([n,label]) => `<div class="ds-stat"><strong>${n}</strong><small>${label}</small></div>`).join('')}</div>`;
  const dateRank = value => {
    const text = String(value || '');
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso) return Number(iso[1] + iso[2] + iso[3]);
    const full = [...text.matchAll(/(\d{2})\.(\d{2})\.(\d{4})/g)].pop();
    if(full) return Number(full[3] + full[2] + full[1]);
    const month = text.match(/(\d{2})\.(\d{4})/);
    return month ? Number(month[2] + month[1] + '00') : 0;
  };

  const sidebar = document.createElement('aside');
  sidebar.className = 'desktop-only ds-sidebar';
  sidebar.setAttribute('aria-label','Главная навигация');
  sidebar.innerHTML = `<button class="ds-brand" type="button" data-desktop-route="home">${image(DATA.assets.iconBrand)}<span><strong>РЫБАЛКА</strong><small>КОНСУЛЬТАНТ</small></span></button>
    <nav class="ds-nav">${routes.map(([route,label,name]) => routeButton(route,label,name)).join('')}</nav>
    <section class="ds-regions"><h2>МОИ РЕГИОНЫ</h2>${regions.map(([name],index) => `<button class="ds-region" type="button" data-desktop-region="${escape(name)}" aria-pressed="${name === region}">${image(index % 2 ? scenes.sunset : scenes.lake)}<span>${escape(name)}</span></button>`).join('')}
    <button class="ds-region-more" type="button" data-desktop-route="research">${icon('plus')}Исследовать регион</button></section>`;
  document.body.appendChild(sidebar);

  const header = document.createElement('header');
  header.className = 'desktop-only ds-topbar';
  header.innerHTML = `<form class="ds-search" role="search">${icon('search')}<input id="desktopGlobalSearch" type="search" aria-label="Поиск по приложению" placeholder="Поиск по водоёмам, точкам, видам рыб, приманкам…"></form>
    <button class="ds-top-region" type="button" data-desktop-region-detail>${icon('pin')}<span><strong id="desktopRegionLabel"></strong><small id="desktopDate"></small></span></button>
    <div class="ds-top-weather">${icon('cloud')}<span><strong>—°</strong><small>Нет свежих данных</small></span></div><time class="ds-top-time" id="desktopClock"></time>`;
  document.body.appendChild(header);
  header.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    const query = header.querySelector('input').value.trim();
    if(query) renderGlobalSearch(query);
  });

  const dashboard = document.createElement('div');
  dashboard.id = 'desktop-dashboard';
  dashboard.className = 'desktop-only';
  document.getElementById('screen-home').appendChild(dashboard);
  const dateText = () => new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:window.LiveWeatherUI?.place().timezone || 'Asia/Yekaterinburg'}).format(new Date());
  function renderDate() {
    document.getElementById('desktopDate').textContent = dateText();
    const homeDate=dashboard.querySelector('.ds-date');if(homeDate) homeDate.textContent=dateText();
    const zone=window.LiveWeatherUI?.place().timezone || 'Asia/Yekaterinburg';
    document.getElementById('desktopClock').textContent = new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:zone}).format(new Date());
    window.LiveWeatherUI?.refreshView();
  }
  function renderForecast() {
    const host = dashboard.querySelector('.ds-fish-list');
    if(!host) return;
    host.innerHTML = [['Щука','Esox lucius'],['Судак','Sander lucioperca'],['Окунь','Perca fluviatilis']].map(([name,taxon]) => `<button class="ds-fish-row" type="button" data-desktop-fish="${name}">${image(window.FishMedia?.src({taxon}) || DATA.assets['fish_' + name],name)}<span><span class="ds-fish-heading">${name}<span aria-label="Прогноз не рассчитан">—</span></span><span class="ds-empty-bars" aria-hidden="true">${'<i></i>'.repeat(10)}</span><small>Открыть поведение и способы ловли</small></span></button>`).join('');
    dashboard.querySelectorAll('[data-desktop-day]').forEach(button => button.setAttribute('aria-pressed',String(Number(button.dataset.desktopDay) === selectedDay)));
    dashboard.querySelector('.ds-forecast-note').textContent = ['Сегодня','На завтра','На послезавтра'][selectedDay] + ': свежие условия не получены. Численный прогноз не рассчитан.';
    window.LiveWeatherUI?.showDay(selectedDay);
  }
  function renderDashboard() {
    document.getElementById('desktopRegionLabel').textContent = regionLabel();
    sidebar.querySelectorAll('[data-desktop-region]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.desktopRegion === region)));
    const waters = relatedWaterbodies(region).slice(0,4);
    const recent = [...records().map(record => ({record,personal:true})),...DATA.diary.map((record,index) => ({record,index}))].sort((a,b) => dateRank(b.record.date) - dateRank(a.record.date)).slice(0,4);
    const diaryRows = recent.map(({record:r,personal,index}) => `<button class="ds-record" type="button" ${personal ? 'data-desktop-route="diary"' : `data-desktop-diary="${index}"`}>${image(personal ? scenes.lake : index % 2 ? scenes.lake : scenes.sunset)}<span><span class="ds-record-title">${escape(r.date || 'Дата не указана')}</span><small>${escape(short(personal ? r.location || 'Моя рыбалка' : r.place,45))}<br>${escape(short(r.result || r.conclusion || 'Результат не записан',90))}</small><span class="ds-status">${escape(personal ? 'Личная запись' : r.time || 'Время не зафиксировано')}</span></span><span class="ds-arrow">›</span></button>`);
    const shortcuts = [
      ['research','КУДА ЕХАТЬ','Места и условия','where',scenes.lake,'#ff657d'],
      ['map','КАРТА','Мои точки и водоёмы','map',scenes.lake,'#63e2c4'],
      ['diary','ДОБАВИТЬ РЫБАЛКУ','Быстрая запись','diary',scenes.sunset,'#91e8db'],
      ['waters','ВОДОЁМЫ','Реки, озёра, карьеры','water',scenes.lake,'#4bbaff'],
      ['gear','СНАСТИ И ПРИМАНКИ','Мой арсенал','fish',scenes.sunset,'#9ed6fb'],
      ['researchbase','ПОСЛЕДНИЕ ВЫВОДЫ','Знания и исследования','stats',scenes.lake,'#52c9ff']
    ];
    dashboard.innerHTML = `<div class="ds-overview">
      <section class="ds-panel ds-today" style="--ds-scenery:url('${escape(scenic())}')"><div class="ds-kicker">СЕГОДНЯ</div><h1>${escape(regionLabel())}</h1><div class="ds-date">${escape(dateText())}</div>
      <div class="ds-weather">${icon('cloud')}<span><strong>—°</strong><small>Погода ожидает обновления</small></span></div><button class="ds-conditions-link" type="button" data-desktop-route="research">Проверить условия перед выездом →</button>
      <div class="ds-metrics">${[['wind','Ветер','— м/с'],['clock','Давление','— гПа'],['temp','Вода','— °C'],['water','Уровень воды','— см']].map(([name,label,value]) => `<div class="ds-metric">${icon(name)}<div><span>${label}</span><strong>${value}</strong></div></div>`).join('')}</div></section>
      <section class="ds-panel ds-forecast">${panelHead('Прогноз активности рыбы')}<div class="ds-days">${['Сегодня','Завтра','Послезавтра'].map((label,index) => `<button type="button" data-desktop-day="${index}" aria-pressed="${index === selectedDay}">${label}</button>`).join('')}</div><div class="ds-fish-list"></div><div class="ds-forecast-note"></div></section>
      <section class="ds-panel ds-time-panel">${panelHead('Лучшее время клёва')}<div class="ds-time-chart" aria-label="Почасовой прогноз пока отсутствует">${icon('clock')}</div><div class="ds-hours"><span>00</span><span>04</span><span>08</span><span>12</span><span>16</span><span>20</span><span>24</span></div><div class="ds-time-window">${icon('fish')}<span><small>Рекомендуемое окно</small><strong>Не рассчитано</strong></span></div><div class="ds-time-note">Для расчёта нужны свежие условия и выбранный водоём.</div></section>
      </div><div class="ds-shortcuts">${shortcuts.map(([route,label,sub,name,src,accent]) => `<button class="ds-shortcut" style="--ds-accent:${accent}" type="button" data-desktop-route="${route}" ${label === 'ДОБАВИТЬ РЫБАЛКУ' ? 'data-desktop-new-diary' : ''}>${image(src)}${icon(name)}<strong>${label}</strong><small>${sub}</small><span class="ds-arrow">›</span></button>`).join('')}</div>
      <div class="ds-lower"><section class="ds-panel ds-points">${panelHead(`Ближайшие точки <small>(${escape(regionLabel())})</small>`,'waters','Все точки →')}<div class="ds-rows">${waters.map((w,index) => `<button class="ds-record" type="button" data-desktop-water="${index}">${image(scenes.lake)}<span><span class="ds-record-title"><span class="ds-dot"></span>${escape(w.name)}</span><small>${escape(short((w.facts || []).slice(0,2).join(' '),110))}</small><span class="ds-status">${escape(short(w.status,70))}</span></span><span class="ds-arrow">›</span></button>`).join('') || '<p class="ds-empty">Точки региона ещё не добавлены. Откройте разведку, чтобы выбрать водоём.</p>'}</div></section>
      <section class="ds-panel ds-diary">${panelHead('Последние рыбалки','diary','Все записи →')}<div class="ds-rows">${diaryRows.join('')}</div></section>
      <section class="ds-panel ds-trip">${panelHead('Планы поездок','trips','Все планы →')}<div class="ds-rows">${DATA.trips.slice(0,3).map((t,index) => `<button class="ds-record" type="button" data-desktop-trip="${index}">${image(index === 1 ? scenes.sunset : scenes.lake)}<span><span class="ds-record-title">${escape(t.title)}</span><small>${escape(t.target)}<br>Срок не выбран</small><span class="ds-status">${escape(t.status)}</span></span></button>`).join('')}</div></section></div>
      <div class="ds-footer"><section class="ds-panel">${panelHead('Быстрые ссылки')}<div class="ds-footer-links">${[['research','Погода и вода','cloud'],['waters','Уровни рек','water'],['map','Карта и точки','map'],['research','Правила и доступ','diary']].map(([route,label,name]) => routeButton(route,label,name)).join('')}</div></section>
      <section class="ds-panel">${panelHead('Полезные материалы')}<div class="ds-footer-links">${[['knowledge','База знаний','book'],['researchbase','Исследования','research'],['fish','Сезонные советы','calendar'],['fish','Рыбы и поведение','fish']].map(([route,label,name]) => routeButton(route,label,name)).join('')}</div></section>
      <section class="ds-panel">${panelHead('Моя статистика','desktopstats','Подробнее →')}${stats()}</section></div>`;
    dashboard._waters = waters;
    renderForecast();
    renderStatsPage();
    window.LiveWeatherUI?.setRegion(region);
    renderDate();
  }
  function addPage(id,content) {
    const page = document.createElement('section'); page.id = 'screen-' + id; page.className = 'screen'; page.innerHTML = content;
    document.getElementById('app').appendChild(page);
    return page;
  }
  const statsPage = addPage('desktopstats','');
  function renderStatsPage() {
    statsPage.innerHTML = `<h1 class="ds-page-heading">Статистика</h1><div class="ds-page-grid"><section class="ds-panel"><h2>Дневник</h2><strong class="ds-big-number">${DATA.diary.length}</strong><p>Сохранённых выездов в истории. Неполные отчёты сохраняются; по ним не рассчитывается успешность.</p><p>Личных записей на этом устройстве: ${records().length}.</p><button type="button" data-desktop-route="diary">Открыть дневник</button></section><section class="ds-panel"><h2>Каталог рыб</h2><strong class="ds-big-number">${DATA.fishCatalog.length}</strong><p>${(knowledge().cards || []).length} подробных карточки со связанными источниками. Остальные виды постепенно дополняются.</p><button type="button" data-desktop-route="fish">Открыть каталог</button></section><section class="ds-panel"><h2>База знаний</h2><strong class="ds-big-number">${(knowledge().sources || []).length}</strong><p>Источников в подробных карточках. Исследования и личные наблюдения имеют отдельное основание.</p><button type="button" data-desktop-route="knowledge">Открыть базу знаний</button></section></div>`;
  }
  addPage('desktopsettings',`<h1 class="ds-page-heading">Настройки</h1><div class="ds-page-grid"><section class="ds-panel"><h2>Резервная копия</h2><p>Сохраните дневник и личные снасти в файл. Импорт сначала проверяет содержимое и показывает изменения.</p><button type="button" data-desktop-route="diary">Дневник и резервная копия</button></section><section class="ds-panel"><h2>Мой арсенал</h2><p>Личные снасти, их параметры и подходящие способы применения.</p><button type="button" data-desktop-route="gear">Открыть снасти</button></section><section class="ds-panel"><h2>Регионы и условия</h2><p>Выберите регион в левом меню. Погода и вода показываются только при наличии свежих данных.</p><button type="button" data-desktop-route="research">Проверить условия</button></section></div>`);
  function syncNavigation() {
    const active = document.querySelector('.screen.active')?.id.replace('screen-','') || 'home';
    const mapped = ['fishgroup','fishprofile'].includes(active) ? 'fish' : active;
    if(routes.some(([route]) => route === mapped)) lastPrimary = mapped;
    sidebar.querySelectorAll('.ds-nav [data-desktop-route]').forEach(button => {
      if(button.dataset.desktopRoute === lastPrimary) button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-desktop-route],[data-desktop-region],[data-desktop-region-detail],[data-desktop-day],[data-desktop-fish],[data-desktop-water],[data-desktop-diary],[data-desktop-trip]');
    if(!button) return;
    event.preventDefault();
    if(button.hasAttribute('data-desktop-region')) {region = button.dataset.desktopRegion; renderDashboard(); go('home');}
    else if(button.hasAttribute('data-desktop-region-detail')) openRegion(region);
    else if(button.hasAttribute('data-desktop-day')) {selectedDay = Number(button.dataset.desktopDay); renderForecast();}
    else if(button.hasAttribute('data-desktop-fish')) openFish(button.dataset.desktopFish,'home');
    else if(button.hasAttribute('data-desktop-water')) openWaterbodyDetail(dashboard._waters[Number(button.dataset.desktopWater)],'home');
    else if(button.hasAttribute('data-desktop-diary')) openDiaryEntry(Number(button.dataset.desktopDiary),'home');
    else if(button.hasAttribute('data-desktop-trip')) openTrip(Number(button.dataset.desktopTrip),'home');
    else {go(button.dataset.desktopRoute); if(button.hasAttribute('data-desktop-new-diary')) requestAnimationFrame(() => document.querySelector('#personalDiary [data-action="new"]')?.click());}
    syncNavigation();
  });
  const observer = new MutationObserver(syncNavigation);
  document.querySelectorAll('.screen').forEach(screen => observer.observe(screen,{attributes:true,attributeFilter:['class']}));
  function refreshPersonal() {
    if(window.PersonalStore) Promise.resolve().then(() => window.PersonalStore.list()).then(items => {
      personalRecords = items.filter(item => !item.archived); renderDashboard();
    }).catch(() => {});
  }
  window.addEventListener('rybalka-personal-data-changed', refreshPersonal);
  window.addEventListener('rybalka-weather-region-selected',event=>{
    if(event.detail?.region && region!==event.detail.region) {region=event.detail.region;renderDashboard();}
  });
  // The store can finish opening after this classic script, without any writes.
  refreshPersonal();
  renderDashboard();
  syncNavigation();
  document.body.classList.add('desktop-shell-ready');
  setInterval(renderDate,60000);
})();
