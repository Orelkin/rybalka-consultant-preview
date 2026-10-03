/* Saved AI analysis of public reports; no API keys or personal data. */
(function (root) {
  'use strict';
  const allowedHosts = new Set(['www.fishingsib.ru', 'www.rusfishing.ru', 'www.fisher.spb.ru', 'www.fishing.ru']);
  const normalize = s => String(s || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^а-яa-z0-9]+/g, ' ').trim();
  const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
  const safeUrl = s => { try { const u = new URL(s); return u.protocol === 'https:' && allowedHosts.has(u.hostname) && !u.username && !u.password; } catch { return false; } };
  const strings = x => Array.isArray(x) && x.every(s => typeof s === 'string');
  function validate(data) {
    if (data?.schema_version !== 1 || data.mode !== 'reviewed_snapshot' || !validDate(data.analyzed_on) || !Array.isArray(data.observations) || !Array.isArray(data.briefs)) throw new Error('Invalid snapshot');
    const ids = new Set();
    for (const o of data.observations) {
      if (typeof o.id !== 'string' || ids.has(o.id) || !safeUrl(o.url) || !validDate(o.outing_date) || typeof o.source_title !== 'string' || typeof o.place_id !== 'string' || typeof o.place_precision !== 'string' || typeof o.outcome !== 'string' || typeof o.water_level?.summary !== 'string') throw new Error('Invalid observation');
      ids.add(o.id);
    }
    const briefIds = new Set();
    for (const b of data.briefs) {
      if (typeof b.id !== 'string' || briefIds.has(b.id) || typeof b.place_name !== 'string' || typeof b.summary !== 'string' || typeof b.confidence !== 'string' || !strings(b.aliases) || !strings(b.species) || !strings(b.reasons) || !strings(b.risks) || !strings(b.missing) || !strings(b.observation_ids) || !b.observation_ids.length || b.observation_ids.some(id => !ids.has(id)) || !Number.isInteger(b.independent_reports) || b.independent_reports < 1) throw new Error('Invalid brief');
      if (b.observation_ids.some(id => data.observations.find(o => o.id === id).place_id !== b.place_id)) throw new Error('Wrong place');
      briefIds.add(b.id);
    }
    return data;
  }
  function select(data, place, species = '') {
    const query = normalize(place), fish = normalize(species);
    return data.briefs.filter(b => (!query || b.aliases.some(a => normalize(a) === query)) && (!fish || b.species.some(s => normalize(s) === fish)));
  }
  function age(data, brief, now = new Date()) {
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const dates = brief.observation_ids.map(id => data.observations.find(o => o.id === id).outing_date);
    const oldest = Math.min(...dates.map(d => Date.parse(d + 'T00:00:00Z')));
    const days = Math.floor((today - oldest) / 86400000);
    return {days, stale: days > 3, future: days < 0, dates};
  }
  const api = {validate, select, age, normalize, safeUrl};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RybalkaRecon = api;
  if (typeof document === 'undefined') return;
  const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const formatDate = d => new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'}).format(new Date(d + 'T00:00:00Z'));
  let data, host, loading = false;
  function sources(brief) {
    return brief.observation_ids.map(id => {
      const o = data.observations.find(x => x.id === id);
      return `<li><a href="${escape(o.url)}" target="_blank" rel="noopener noreferrer">${escape(o.source_title)}</a><span>Выезд ${formatDate(o.outing_date)} · ${escape(o.place_precision)}</span><span>${escape(o.outcome)}</span><span>${escape(o.water_level.summary)}</span></li>`;
    }).join('');
  }
  function card(b) {
    const freshness = age(data, b);
    const current = !freshness.stale && !freshness.future;
    return `<article class="rc-brief"><div class="rc-brief-head"><h3>${escape(b.place_name)}</h3><span class="rc-badge">${current ? 'Недавний отчёт' : 'Архивный отчёт'}</span></div><p class="rc-meta">${escape(b.species.join(', '))} · ${escape(b.confidence)} · выезд ${freshness.dates.map(formatDate).join(', ')}</p>${current ? `<p class="rc-summary">${escape(b.summary)}</p>` : '<p class="rc-summary">Эти сведения уже не описывают условия сейчас. Для рекомендации нужен новый отчёт по этому участку.</p>'}<details><summary>На чём основан вывод</summary>${!current ? `<p>${escape(b.summary)}</p>` : ''}<h4>Что говорит в пользу места</h4><ul>${b.reasons.map(x => `<li>${escape(x)}</li>`).join('')}</ul><h4>Что может помешать</h4><ul>${b.risks.map(x => `<li>${escape(x)}</li>`).join('')}</ul><h4>Что ещё нужно уточнить</h4><p>${escape(b.missing.join(' · '))}</p><h4>Исходные наблюдения</h4><ul class="rc-sources">${sources(b)}</ul></details></article>`;
  }
  function show() {
    const output = host.querySelector('[data-rc-results]');
    if (!data) return;
    const query = host.querySelector('[data-rc-place]').value.trim();
    const species = host.querySelector('[data-rc-species]').value;
    const found = select(data, query, species);
    host.querySelector('[data-rc-status]').textContent = `Сохранённый анализ ИИ · проверено ${formatDate(data.analyzed_on)} · ${query ? 'выбранное место' : 'два места первого пилота'}`;
    if (found.length) {
      output.innerHTML = found.map(card).join('');
      return;
    }
    const knownPlace = select(data, query).length > 0;
    const isRybinsk = /рыбинск/.test(normalize(query));
    output.innerHTML = `<div class="rc-empty"><strong>${normalize(query) === 'обь' ? 'Уточните участок Оби' : knownPlace ? 'Для этой рыбы пока нет проверенного отчёта' : 'По этому месту пока нет проверенной сводки'}</strong><p>${knownPlace ? 'Отчёты о других видах не подтверждают клёв выбранной рыбы.' : 'Первые сводки собраны по Оби в Новосибирске и Умревинской протоке. Отсутствие сводки не означает плохой клёв.'}</p>${isRybinsk ? '<a href="https://www.rusfishing.ru/forum/forums/rybinskoye-vodokhranilishche.97/" target="_blank" rel="noopener noreferrer">Раздел Рыбинского водохранилища на Русфишинге</a>' : ''}</div>`;
  }
  async function load() {
    if (loading) return;
    loading = true;
    const button = host.querySelector('[data-rc-refresh]');
    button.disabled = true;
    host.querySelector('[data-rc-status]').textContent = 'Загружаем сохранённую сводку…';
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('data/forum-conditions.json', {cache: 'no-store', signal: controller.signal});
      if (!response.ok) throw new Error('Unavailable');
      data = validate(await response.json());
      show();
    } catch {
      if (data) {show(); host.querySelector('[data-rc-status]').textContent += ' · обновить не удалось';}
      else {host.querySelector('[data-rc-status]').textContent = 'Сводка сейчас недоступна'; host.querySelector('[data-rc-results]').innerHTML = '<p class="rc-empty">Попробуйте загрузить её позже.</p>';}
    } finally {clearTimeout(timeout); loading = false; button.disabled = false;}
  }
  function mount() {
    host = document.getElementById('forumConditions');
    if (!host) return;
    host.className = 'card rc-panel';
    host.innerHTML = `<div class="rc-heading"><div><span class="rc-kicker">ПЕРЕД ПОЕЗДКОЙ</span><h2>Условия на водоёме</h2><p>Короткий вывод ИИ по сообщениям с мест: что подходит вашей цели и что нужно проверить.</p></div></div><form class="rc-form"><label>Водоём или город<input data-rc-place placeholder="Например, Рыбинское водохранилище" autocomplete="off"></label><label>Целевая рыба<select data-rc-species><option value="">Любая</option><option>щука</option><option>судак</option><option>окунь</option><option>язь</option><option>лещ</option><option>карась</option></select></label><button type="submit" class="actionbtn">Посмотреть условия</button></form><div class="rc-examples"><span>Первые места:</span><button type="button" data-rc-example="Новосибирск">Обь в Новосибирске</button><button type="button" data-rc-example="Умревинская протока">Умревинская протока</button><button type="button" data-rc-example="Рыбинское водохранилище">Рыбинское водохранилище</button></div><div class="rc-provenance"><p data-rc-status role="status"></p><button type="button" data-rc-refresh>Обновить сводку</button></div><div data-rc-results class="rc-results"></div><p class="rc-footnote">Сводки подготовлены по прочитанным сообщениям. Постоянное обновление и сопоставление с погодой участка ещё подключаются.</p>`;
    host.querySelector('form').addEventListener('submit', event => {event.preventDefault(); show();});
    host.querySelector('[data-rc-species]').addEventListener('change', show);
    host.querySelector('[data-rc-refresh]').addEventListener('click', load);
    host.querySelectorAll('[data-rc-example]').forEach(button => button.addEventListener('click', () => {
      host.querySelector('[data-rc-place]').value = button.dataset.rcExample;
      host.querySelector('[data-rc-species]').value = '';
      show();
    }));
    load();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once: true});
  else mount();
})(typeof globalThis === 'undefined' ? this : globalThis);
