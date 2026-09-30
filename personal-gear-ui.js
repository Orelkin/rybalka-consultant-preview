/* Личный комплект и справочник моделей. Личные данные не отправляются в сеть. */
(function (global) {
  'use strict';
  const instances = new WeakMap();
  const mounted = new Set();
  let searchInstalled = false;
  const categories = {
    spinning: 'Спиннинги', feeder: 'Фидеры', trolling: 'Троллинг',
    surf: 'Сюрф', bolo: 'Болонские', other: 'Другие снасти'
  };
  const styles = `
  .pg-app{--pg-text:#edf6ff;--pg-muted:#9fb7cc;--pg-line:#16435f;--pg-accent:#63caff;--pg-panel:#081c2c;color:var(--pg-text);font:inherit;overflow-wrap:anywhere}
  .pg-app *{box-sizing:border-box}.pg-app [hidden]{display:none!important}
  .pg-app button,.pg-app input,.pg-app textarea{font:inherit}.pg-app button{cursor:pointer}
  .pg-app button:disabled{opacity:.5;cursor:default}.pg-app button:focus-visible,.pg-app input:focus-visible,.pg-app textarea:focus-visible,.pg-app a:focus-visible,.pg-app summary:focus-visible{outline:2px solid #7ad6ff;outline-offset:3px}
  .pg-app h3,.pg-app h4,.pg-app p{margin:0}.pg-app p{line-height:1.6}
  .pg-top{position:relative;border:1px solid #1e5674;border-radius:20px;padding:21px;background:radial-gradient(ellipse at 100% 0,rgba(40,160,211,.17),transparent 58%),linear-gradient(140deg,#0b2a3e,#061923);overflow:hidden;margin-bottom:14px}
  .pg-top:after{content:'';position:absolute;right:-45px;top:15px;width:240px;height:240px;border:1px solid rgba(99,202,255,.1);border-radius:50%;pointer-events:none}
  .pg-eyebrow{font-size:10px;font-weight:850;letter-spacing:.16em;text-transform:uppercase;color:#68c9f7;margin-bottom:8px}
  .pg-top h3{font-size:25px;font-weight:900;letter-spacing:-.025em}.pg-top p{max-width:510px;margin-top:8px;font-size:13px;color:#aec6d5}
  .pg-metrics{display:flex;flex-wrap:wrap;gap:19px;margin-top:19px}.pg-metric{border-left:2px solid #259acf;padding-left:11px}.pg-metric strong{font-size:21px;display:block;line-height:1.2}.pg-metric span{font-size:10px;color:#9db9cb;display:block;margin-top:4px}
  .pg-toolbar{display:flex;flex-wrap:wrap;gap:9px;align-items:center;margin-bottom:13px}.pg-views{display:flex;gap:4px;padding:4px;background:#051722;border:1px solid #143d54;border-radius:13px;flex-wrap:wrap}
  .pg-button{min-height:39px;border:1px solid #22516d;color:#d3e7f2;background:#0b2c40;border-radius:10px;padding:9px 13px;font-size:12px;font-weight:750;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:7px;line-height:1.3}
  .pg-button:hover{background:#103c55;border-color:#3486ab}.pg-button.pg-primary{background:linear-gradient(135deg,#1689c9,#0961a0);border-color:#249ce0;color:#fff}.pg-button.pg-quiet{background:#081b28;color:#a3c0d1}.pg-button.pg-active{color:#ddf6ff;border-color:#317fa3;background:#123c55;box-shadow:inset 0 0 0 1px rgba(75,185,245,.1)}
  .pg-views .pg-button{border-color:transparent;background:transparent;min-height:35px;padding:8px 12px}.pg-views .pg-active{background:#133a50;border-color:#205c78}
  .pg-search{display:block;flex:1;min-width:150px}.pg-search input{width:100%;min-height:43px;border:1px solid #20536e;background:#041722;color:#e9f6ff;border-radius:12px;padding:10px 13px;font-size:14px}.pg-search input::placeholder{color:#7f9fb2}
  .pg-actions{display:flex;flex-wrap:wrap;gap:7px}.pg-filters{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 15px}.pg-chip{border:1px solid #17455d;border-radius:999px;padding:7px 11px;font-size:11px;color:#9ab9cc;background:#081c2b}.pg-chip.pg-active{color:#7bd4ff;border-color:#2680ac;background:#0e3349}.pg-chip:hover{border-color:#2b7c9e}
  .pg-section-line{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 11px}.pg-section-line h4{font-size:13px;font-weight:850}.pg-count{font-size:11px;color:#8eb2c8}.pg-hint{font-size:12px;color:var(--pg-muted);margin-bottom:13px!important}
  .pg-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.pg-tile{border:1px solid #16445f;border-radius:17px;background:linear-gradient(145deg,#0b2538,#061822);padding:15px;min-width:0;text-align:left;color:var(--pg-text);display:flex;flex-direction:column;align-items:stretch;gap:11px;min-height:190px;transition:border-color .15s,transform .15s}.pg-tile:hover{border-color:#3594bb;transform:translateY(-2px)}
  .pg-tile-top{display:flex;justify-content:space-between;align-items:center;gap:10px}.pg-kind{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#75c4ee;font-weight:850}.pg-symbol{color:#5abfec;width:36px;height:29px;flex:none}.pg-symbol svg{width:100%;height:100%}.pg-tile h4{font-size:16px;font-weight:900;line-height:1.3;letter-spacing:-.01em}
  .pg-mini-specs{display:flex;gap:13px;flex-wrap:wrap}.pg-mini-spec{font-size:13px;font-weight:850}.pg-mini-spec span{display:block;font-size:9px;font-weight:500;color:#809fb3;margin-bottom:3px}.pg-tile-summary{font-size:11px;line-height:1.5;color:#a7c1d2}.pg-tile-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:auto;padding-top:10px;border-top:1px solid #123b52;font-size:10px;color:#77c9f4}.pg-tile-status{color:#91acbc}.pg-tile-status.pg-setup{color:#85d3b4}
  .pg-empty{border:1px dashed #246382;border-radius:18px;padding:25px;background:#061b29;text-align:center;grid-column:1/-1}.pg-empty h4{font-size:18px;margin-bottom:10px}.pg-empty p{font-size:13px;color:#a2c0d2;max-width:440px;margin:0 auto 16px}
  .pg-status{font-size:12px;color:#92d5f3;line-height:1.5;margin:9px 0 14px;min-height:1.5em}.pg-status.pg-error{color:#ffb8ac}
  .pg-transfer{border:1px solid #256081;border-radius:14px;padding:15px;margin-bottom:14px;background:#0b2c40}.pg-transfer p{font-size:12px;color:#b4d1e3;margin-bottom:11px}.pg-transfer textarea{display:block;width:100%;min-height:90px;resize:vertical;border:1px solid #2a6281;background:#061d2b;color:#bcd5e4;border-radius:10px;padding:10px;font-size:12px;margin:10px 0}.pg-transfer label{font-size:11px;color:#9bbccc}
  .pg-paste{margin:0 0 14px;color:#91b3c8;font-size:11px}.pg-paste summary{cursor:pointer;line-height:1.5}.pg-paste .pg-transfer{margin:10px 0 0}.pg-paste textarea{font-size:13px}
  .pg-detail{border:1px solid #1c5674;border-radius:20px;background:linear-gradient(155deg,#092437,#051620);overflow:hidden}.pg-detail-head{padding:21px;background:radial-gradient(ellipse at 100% 0,rgba(50,176,225,.19),transparent 55%);border-bottom:1px solid #18445d}.pg-detail-meta{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:15px}.pg-detail-head h3{font-size:26px;font-weight:900;line-height:1.2;letter-spacing:-.025em}.pg-detail-head p{color:#aac4d6;font-size:12px;margin-top:10px}.pg-detail-values{display:flex;flex-wrap:wrap;gap:18px;margin-top:20px}.pg-detail-value{border-left:1px solid #236381;padding-left:12px}.pg-detail-value span{font-size:10px;display:block;color:#7fa7bf;margin-bottom:4px}.pg-detail-value strong{font-size:20px;font-weight:850}
  .pg-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;padding:10px;border-bottom:1px solid #16445d;background:#061a28}.pg-tab{min-width:0;border:1px solid transparent;background:transparent;color:#91b3c9;border-radius:9px;font-size:11px;font-weight:800;min-height:40px;padding:8px 4px}.pg-tab.pg-active{background:#11384f;border-color:#226488;color:#81d4ff}.pg-tab:hover{color:#d4f0ff}
  .pg-pane{padding:19px}.pg-pane h4{font-size:15px;font-weight:900;margin:0 0 12px}.pg-pane p{color:#afc7d7;font-size:13px;margin:10px 0;white-space:pre-line}.pg-spec-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.pg-spec{border:1px solid #143e56;border-radius:12px;padding:12px;background:#082033}.pg-spec-label{color:#87a9bf;font-size:10px}.pg-spec-value{font-size:14px;font-weight:850;margin:5px 0 7px}.pg-evidence{color:#9db8c7;font-size:9px}.pg-evidence.pg-verified{color:#80d5b2}.pg-evidence.pg-candidate{color:#d4bd7d}
  .pg-note{border:1px solid #4b4934;border-radius:12px;padding:12px;background:rgba(68,51,18,.27);color:#cfbf91;font-size:11px;line-height:1.6;margin-top:13px}.pg-practice-label{display:inline-block;font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#7bc7ee;margin-bottom:9px}.pg-application{border-left:2px solid #2886ae;padding-left:14px}.pg-application p{margin:0 0 12px}.pg-field{display:block;color:#b7d1e2;font-size:11px;margin:13px 0}.pg-field input,.pg-field textarea{display:block;width:100%;margin-top:7px;border:1px solid #245e7b;border-radius:10px;background:#041722;color:#edf7ff;padding:11px 12px;font-size:16px;min-width:0}.pg-field textarea{resize:vertical;min-height:115px;line-height:1.5}.pg-field input::placeholder,.pg-field textarea::placeholder{color:#698da4}.pg-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 12px}.pg-form-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:17px}.pg-form-caption{font-size:11px;color:#91adbf}
  .pg-source{border:1px solid #19465e;border-radius:12px;padding:13px;margin:9px 0;background:#082135}.pg-source a{color:#79d0ff;text-decoration:none;font-size:12px;font-weight:800}.pg-source a:hover{text-decoration:underline}.pg-source strong{font-size:12px}.pg-source p{font-size:11px;margin:7px 0 0}.pg-legacy{margin-top:22px;border-top:1px solid #1a4961;padding-top:16px}.pg-legacy summary{cursor:pointer;color:#bad9ea;font-size:13px;font-weight:800;line-height:1.5}.pg-legacy-intro{font-size:11px;color:#88a7ba;margin:10px 0 13px!important}.pg-legacy-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.pg-legacy-item{padding:13px;border:1px solid #153d54;border-radius:13px;background:#071c2a}.pg-legacy-item h4{font-size:13px;margin:0 0 6px}.pg-legacy-item .pg-kind{font-size:9px}.pg-legacy-item p{font-size:11px;color:#9dbacc;margin-top:8px}
  @media(max-width:600px){.pg-grid{grid-template-columns:1fr}.pg-tile{min-height:175px}.pg-top,.pg-detail-head{padding:18px}.pg-detail-head h3{font-size:23px}.pg-toolbar{align-items:stretch}.pg-views{width:100%}.pg-views .pg-button{flex:1}.pg-search{flex-basis:100%}.pg-actions{width:100%}.pg-toolbar>.pg-actions .pg-button{flex:1}.pg-spec-list,.pg-form-grid,.pg-legacy-grid{grid-template-columns:1fr}.pg-pane{padding:16px}.pg-tabs{gap:2px;padding:7px}.pg-tab{font-size:10px}.pg-detail-values{gap:15px}.pg-detail-value strong{font-size:18px}}
  .pg-tab{overflow-wrap:normal;word-break:normal}
  @media(max-width:420px){.pg-tabs{grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.pg-tab{min-height:44px}}
  @media(prefers-reduced-motion:reduce){.pg-tile{transition:none}.pg-tile:hover{transform:none}}
  `;
  function element(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }
  function button(text, action, cls = '') {
    const node = element('button', `pg-button ${cls}`.trim(), text);
    node.type = 'button';
    if (action) node.addEventListener('click', action);
    return node;
  }
  function safeURL(value) {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch (_) { return null; }
  }
  function catalogue() {
    const pack = global.GEAR_CATALOG_V1;
    return Array.isArray(pack) ? pack : (Array.isArray(pack?.models) ? pack.models : []);
  }
  function symbol() {
    const node = element('span', 'pg-symbol');
    node.setAttribute('aria-hidden', 'true');
    // Decorative illustration of a rod; it does not represent any manufacturer's model.
    node.innerHTML = '<svg viewBox="0 0 46 34" fill="none"><path d="M5 28 40 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="m4 28 8-5" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="m14 23 1 5m9-12 1 5m9-12 1 4m6-7 1 3" stroke="currentColor" stroke-width="1"/><path d="M41 7c3 6 3 13 0 20" stroke="currentColor" stroke-opacity=".35" stroke-width=".8"/><circle cx="12" cy="28" r="3" stroke="currentColor" stroke-width="1.2"/></svg>';
    return node;
  }
  function statusLabel(status) {
    if (['verified', 'confirmed', 'manufacturer', 'manufacturer_verified', 'official'].includes(status)) return ['Проверено по модели', 'pg-verified'];
    if (['candidate', 'candidate_match', 'generation_unconfirmed', 'tentative', 'needs_matching'].includes(status)) return ['Версия требует уточнения', 'pg-candidate'];
    if (['editorial_interpretation', 'interpretation'].includes(status)) return ['Практическая оценка', 'pg-candidate'];
    return ['Паспорт комплекта', ''];
  }
  function flattenedSpecs(model) {
    return [...(Array.isArray(model?.specs) ? model.specs : []),
      ...(Array.isArray(model?.verified_additions) ? model.verified_additions : []),
      ...(Array.isArray(model?.candidate_additions) ? model.candidate_additions : [])];
  }
  function mainSpecs(model) {
    const specs = flattenedSpecs(model);
    return [specs.find(s => /^Длина$/i.test(s.label)), specs.find(s => /тест|wurfgew|c\.w\./i.test(s.label) && !/вершин/i.test(s.label))].filter(Boolean);
  }
  function escapeHTML(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }
  function installSearch() {
    if (searchInstalled || typeof global.globalSearchAll !== 'function') return;
    const inherited = global.globalSearchAll;
    global.globalSearchAll = function (value) {
      const query = String(value || '').trim().toLocaleLowerCase('ru');
      const personal = [];
      if (query) {
        for (const screen of mounted) for (const record of screen.records) {
          if (record.archived) continue;
          const searchable = `${record.name} ${record.notes} ${record.setup?.reel || ''} ${record.setup?.line || ''} ${record.setup?.leader || ''}`;
          if (!searchable.toLocaleLowerCase('ru').includes(query)) continue;
          const model = screen.modelFor(record);
          personal.push({ type: 'Мои снасти', title: escapeHTML(record.name), text: escapeHTML(model?.summary || categories[record.category] || 'Личный комплект'),
            action: () => { if (typeof global.go === 'function') global.go('gear'); screen.detailTab = 'passport'; screen.openDetail(record, model?.id); } });
        }
      }
      return [...personal, ...inherited(value)].slice(0, 30);
    };
    searchInstalled = true;
  }

  class GearScreen {
    constructor(host, options) {
      this.host = host; this.options = options; this.records = []; this.models = catalogue();
      this.view = 'mine'; this.category = 'all'; this.query = ''; this.selected = null;
      this.detailTab = 'passport'; this.pendingImport = null; this.exportUrl = null; this.available = false;
      this.build();
      global.addEventListener('rybalka-personal-data-changed', () => this.onDataChanged());
    }
    build() {
      this.host.replaceChildren();
      this.root = element('div', 'pg-app');
      const style = element('style'); style.textContent = styles; this.root.append(style);
      this.overview = element('div', 'pg-overview');
      this.banner = element('div', 'pg-top');
      this.banner.append(element('div', 'pg-eyebrow', 'Снасти · личный арсенал'), element('h3', '', 'Всё для вашей рыбалки'),
        element('p', '', 'Паспорт удилища, его возможности и ваш рабочий комплект — в одной карточке.'));
      this.metrics = element('div', 'pg-metrics'); this.banner.append(this.metrics); this.overview.append(this.banner);
      const toolbar = element('div', 'pg-toolbar');
      this.views = element('div', 'pg-views'); this.views.setAttribute('aria-label', 'Список снастей');
      this.viewButtons = {};
      for (const [id, title] of [['mine', 'Мои снасти'], ['catalogue', 'Модели'], ['archive', 'Архив']]) {
        const node = button(title, () => { this.view = id; this.category = 'all'; this.drawList(); });
        node.setAttribute('aria-pressed', 'false'); this.viewButtons[id] = node; this.views.append(node);
      }
      toolbar.append(this.views);
      const searchLabel = element('label', 'pg-search');
      this.search = element('input'); this.search.type = 'search'; this.search.placeholder = 'Найти удилище';
      this.search.setAttribute('aria-label', 'Поиск снасти по названию');
      this.search.addEventListener('input', () => { this.query = this.search.value.trim().toLocaleLowerCase('ru'); this.drawList(); });
      searchLabel.append(this.search); toolbar.append(searchLabel);
      const actions = element('div', 'pg-actions');
      this.importButton = button('Загрузить комплект', () => this.input.click(), 'pg-quiet');
      this.exportButton = button('Сохранить копию', () => this.exportBackup(), 'pg-quiet');
      actions.append(this.importButton, this.exportButton); toolbar.append(actions);
      this.overview.append(toolbar);
      this.status = element('p', 'pg-status'); this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite'); this.overview.append(this.status);
      this.input = element('input'); this.input.type = 'file'; this.input.accept = '.json,application/json'; this.input.hidden = true;
      this.input.addEventListener('change', () => this.readImport()); this.overview.append(this.input);
      this.pasteDetails = element('details', 'pg-paste');
      this.pasteDetails.append(element('summary', '', 'Вставить сохранённые данные'));
      const pastePanel = element('div', 'pg-transfer');
      pastePanel.append(element('p', '', 'Вставьте содержимое сохранённого комплекта или резервной копии. Сначала проверим данные и покажем состав.'));
      this.pasteText = element('textarea'); this.pasteText.setAttribute('aria-label', 'Текст сохранённых данных');
      this.pasteText.placeholder = 'Содержимое сохранённых данных'; this.pasteText.spellcheck = false;
      this.pasteButton = button('Проверить данные', () => this.readPastedImport(), 'pg-quiet');
      pastePanel.append(this.pasteText, this.pasteButton); this.pasteDetails.append(pastePanel); this.overview.append(this.pasteDetails);
      this.importPanel = element('div', 'pg-transfer'); this.importPanel.hidden = true;
      this.importText = element('p'); this.importConfirm = button('Добавить снасти', () => this.applyImport(), 'pg-primary');
      const importActions = element('div', 'pg-actions'); importActions.append(this.importConfirm,
        button('Отмена', () => { this.pendingImport = null; this.importPanel.hidden = true; }));
      this.importPanel.append(this.importText, importActions); this.overview.append(this.importPanel);
      this.exportPanel = element('div', 'pg-transfer'); this.exportPanel.hidden = true;
      this.exportDescription = element('p'); this.download = element('a', 'pg-button pg-primary', 'Скачать копию');
      const exportActions = element('div', 'pg-actions'); exportActions.append(this.download, button('Скопировать', () => this.copyBackup()),
        button('Закрыть', () => { this.exportPanel.hidden = true; }));
      this.exportText = element('textarea'); this.exportText.readOnly = true; this.exportText.setAttribute('aria-label', 'Содержимое резервной копии');
      this.exportPanel.append(this.exportDescription, exportActions, element('p', '', 'Если скачивание недоступно, скопируйте текст ниже и сохраните его в файл с расширением .json.'), this.exportText);
      this.overview.append(this.exportPanel);
      this.filters = element('div', 'pg-filters'); this.filters.setAttribute('aria-label', 'Тип удилища'); this.overview.append(this.filters);
      const line = element('div', 'pg-section-line'); this.listTitle = element('h4'); this.listCount = element('span', 'pg-count');
      line.append(this.listTitle, this.listCount); this.overview.append(line);
      this.listHint = element('p', 'pg-hint'); this.overview.append(this.listHint);
      this.grid = element('div', 'pg-grid'); this.overview.append(this.grid);
      this.legacy = element('details', 'pg-legacy'); this.overview.append(this.legacy); this.drawLegacy();
      this.detail = element('div', 'pg-detail'); this.detail.hidden = true;
      this.root.append(this.overview, this.detail); this.host.append(this.root);
      this.drawList();
    }
    message(text, error = false) {
      this.status.textContent = text; this.status.classList.toggle('pg-error', error);
      if (this.detailStatus) { this.detailStatus.textContent = text; this.detailStatus.classList.toggle('pg-error', error); }
    }
    async refresh() {
      this.models = catalogue();
      try {
        await global.PersonalGear.ready();
        this.records = await global.PersonalGear.list({ includeArchived: true }); this.available = true;
      } catch (_) {
        this.available = false;
        this.message('Личные снасти недоступны. Разрешите браузеру сохранять данные для приложения и откройте раздел ещё раз.', true);
      }
      this.importButton.disabled = !this.available; this.exportButton.disabled = !this.available; this.pasteButton.disabled = !this.available;
      this.drawList();
      if (this.selected) {
        const record = this.selected.record ? this.records.find(r => r.id === this.selected.record.id) : null;
        if (this.selected.record && !record) this.closeDetail();
        else this.openDetail(record, this.selected.modelId, false);
      }
      return this;
    }
    async onDataChanged() {
      try {
        this.exportPanel.hidden = true;
        if (this.exportUrl) { URL.revokeObjectURL(this.exportUrl); this.exportUrl = null; }
        const next = await global.PersonalGear.list({ includeArchived: true });
        if (JSON.stringify(next) === JSON.stringify(this.records)) return;
        this.records = next; this.drawList();
        // A diary save must not rebuild an open form and erase unsaved setup edits.
        if (!this.selected || this.pane?.querySelector('form')) return;
        const record = this.selected.record ? this.records.find(r => r.id === this.selected.record.id) : null;
        if (this.selected.record && !record) this.closeDetail();
        else this.openDetail(record, this.selected.modelId, false);
      } catch (_) { /* Explicit reads and writes display their own storage errors. */ }
    }
    modelFor(record) { return this.models.find(m => m.id === record?.modelId) || null; }
    drawList() {
      const active = this.records.filter(r => !r.archived), archived = this.records.filter(r => r.archived);
      this.metrics.replaceChildren();
      for (const [value, label] of [[active.length, 'удилищ в арсенале'], [active.filter(r => r.setup?.reel && r.setup?.line).length, 'комплектов с катушкой и леской']]) {
        const metric = element('div', 'pg-metric'); metric.append(element('strong', '', value), element('span', '', label)); this.metrics.append(metric);
      }
      for (const [id, node] of Object.entries(this.viewButtons)) {
        node.classList.toggle('pg-active', this.view === id); node.setAttribute('aria-pressed', String(this.view === id));
      }
      this.viewButtons.archive.textContent = `Архив${archived.length ? ` · ${archived.length}` : ''}`;
      const all = this.view === 'catalogue' ? this.models.map(m => ({ model: m, record: null })) :
        (this.view === 'archive' ? archived : active).map(r => ({ record: r, model: this.modelFor(r) }));
      this.filters.replaceChildren();
      const used = [...new Set(all.map(item => item.model?.category || item.record?.category || 'other'))];
      for (const id of ['all', ...Object.keys(categories).filter(id => used.includes(id)), ...used.filter(id => !categories[id])]) {
        const chip = button(id === 'all' ? 'Все' : (categories[id] || 'Другие снасти'), () => { this.category = id; this.drawList(); }, 'pg-chip');
        chip.classList.toggle('pg-active', this.category === id); chip.setAttribute('aria-pressed', String(this.category === id)); this.filters.append(chip);
      }
      const visible = all.filter(({ model, record }) => (this.category === 'all' || (model?.category || record?.category || 'other') === this.category) &&
        (!this.query || `${record?.name || model?.name || ''} ${model?.summary || ''}`.toLocaleLowerCase('ru').includes(this.query)));
      this.listTitle.textContent = this.view === 'catalogue' ? 'Справочник удилищ' : (this.view === 'archive' ? 'Снасти в архиве' : 'Мой комплект');
      this.listCount.textContent = `${visible.length} из ${all.length}`;
      this.listHint.textContent = this.view === 'catalogue' ? 'Откройте модель, чтобы изучить паспорт или добавить своё удилище.' :
        (this.view === 'archive' ? 'Снасти из архива можно вернуть в комплект.' : 'Катушка, леска и заметки сохраняются вместе с личным дневником в резервной копии.');
      this.grid.replaceChildren();
      if (!visible.length) {
        const empty = element('div', 'pg-empty');
        const noFilter = !this.query && this.category === 'all';
        empty.append(element('h4', '', noFilter && this.view === 'mine' ? 'Соберите свой арсенал' : noFilter && this.view === 'archive' ? 'Архив пуст' : 'Ничего не найдено'));
        empty.append(element('p', '', noFilter && this.view === 'mine' ? 'Загрузите сохранённый комплект или выберите удилище в справочнике. После добавления можно заполнить катушку, леску и заметки.' :
          noFilter && this.view === 'archive' ? 'Здесь будут снасти, которые вы временно уберёте из комплекта.' : 'Измените название в поиске или выберите другой тип удилища.'));
        if (noFilter && this.view === 'mine') empty.append(button('Добавить из справочника', () => { this.view = 'catalogue'; this.drawList(); }, 'pg-primary'));
        this.grid.append(empty);
      }
      for (const item of visible) this.grid.append(this.tile(item));
    }
    tile({ model, record }) {
      const tile = button('', () => this.openDetail(record, model?.id), 'pg-tile');
      const top = element('div', 'pg-tile-top'); top.append(element('span', 'pg-kind', model?.categoryLabel || categories[record?.category] || 'Удилище'), symbol()); tile.append(top);
      tile.append(element('h4', '', record?.name || model?.name || 'Удилище'));
      const specs = element('div', 'pg-mini-specs');
      for (const spec of mainSpecs(model)) { const part = element('div', 'pg-mini-spec'); part.append(element('span', '', spec.label), document.createTextNode(spec.value)); specs.append(part); }
      if (specs.childNodes.length) tile.append(specs);
      if (model?.summary) tile.append(element('div', 'pg-tile-summary', model.summary));
      const foot = element('div', 'pg-tile-foot');
      const hasSetup = !!(record?.setup?.reel && record?.setup?.line);
      const owned = this.records.some(r => r.modelId === model?.id && !r.archived);
      foot.append(element('span', `pg-tile-status${hasSetup ? ' pg-setup' : ''}`, record ? hasSetup ? 'Комплект заполнен' : record.archived ? 'В архиве' : 'Дополнить комплект' : owned ? 'Есть в арсенале' : 'Модель'), element('span', '', 'Карточка →'));
      tile.append(foot); return tile;
    }
    drawLegacy() {
      const legacy = Array.isArray(this.options.legacy) ? this.options.legacy : [];
      this.legacy.hidden = !legacy.length; this.legacy.replaceChildren();
      if (!legacy.length) return;
      this.legacy.append(element('summary', '', `Остальной комплект · ${legacy.length}`), element('p', 'pg-legacy-intro', 'Сохранённые записи о катушках и снаряжении. Подробные паспорта ещё предстоит уточнить.'));
      const grid = element('div', 'pg-legacy-grid');
      for (const item of legacy) {
        const card = element('article', 'pg-legacy-item'); card.append(element('h4', '', item.name || 'Снаряжение'));
        if (item.kind) card.append(element('div', 'pg-kind', item.kind));
        if (item.spec) card.append(element('p', '', item.spec)); if (item.use) card.append(element('p', '', item.use)); grid.append(card);
      }
      this.legacy.append(grid);
    }
    openDetail(record, modelId, moveFocus = true) {
      const model = this.models.find(m => m.id === modelId) || this.modelFor(record);
      this.selected = { record, modelId: model?.id || record?.modelId || '' };
      this.overview.hidden = true; this.detail.hidden = false; this.detail.replaceChildren();
      const head = element('div', 'pg-detail-head'); const meta = element('div', 'pg-detail-meta');
      this.backButton = button('← К снастям', () => this.closeDetail(), 'pg-quiet');
      meta.append(this.backButton, element('span', 'pg-kind', model?.categoryLabel || categories[record?.category] || 'Удилище')); head.append(meta);
      head.append(element('h3', '', record?.name || model?.name || 'Удилище'));
      if (model?.summary) head.append(element('p', '', model.summary));
      const values = element('div', 'pg-detail-values');
      for (const spec of mainSpecs(model)) { const part = element('div', 'pg-detail-value'); part.append(element('span', '', spec.label), element('strong', '', spec.value)); values.append(part); }
      head.append(values); this.detail.append(head);
      const tabs = element('div', 'pg-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Карточка удилища'); this.tabs = {};
      for (const [id, label] of [['passport', 'Паспорт'], ['application', 'На рыбалке'], ['setup', 'Мой комплект'], ['sources', 'Источники']]) {
        const tab = element('button', 'pg-tab', label); tab.type = 'button'; tab.id = `pg-tab-${id}`; tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-controls', 'pg-detail-pane'); tab.addEventListener('click', () => this.showTab(id));
        tab.addEventListener('keydown', event => {
          const ids = Object.keys(this.tabs); let next;
          if (event.key === 'ArrowRight') next = ids[(ids.indexOf(id) + 1) % ids.length];
          else if (event.key === 'ArrowLeft') next = ids[(ids.indexOf(id) + ids.length - 1) % ids.length];
          else if (event.key === 'Home') next = ids[0]; else if (event.key === 'End') next = ids[ids.length - 1];
          if (next) { event.preventDefault(); this.showTab(next); this.tabs[next].focus(); }
        });
        this.tabs[id] = tab; tabs.append(tab);
      }
      this.detail.append(tabs); this.pane = element('div', 'pg-pane'); this.pane.id = 'pg-detail-pane'; this.pane.setAttribute('role', 'tabpanel');
      this.detail.append(this.pane); this.detailStatus = element('p', 'pg-status'); this.detailStatus.setAttribute('role', 'status'); this.detailStatus.style.margin = '0 19px 15px'; this.detail.append(this.detailStatus);
      this.showTab(this.detailTab); if (moveFocus) { this.backButton.focus(); this.detail.scrollIntoView({ block: 'start', behavior: 'auto' }); }
    }
    closeDetail() {
      this.selected = null; this.detailStatus = null; this.detail.hidden = true; this.overview.hidden = false; this.drawList(); this.search.focus();
    }
    showTab(id) {
      this.detailTab = id;
      for (const [key, tab] of Object.entries(this.tabs)) { const active = key === id; tab.classList.toggle('pg-active', active); tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; }
      this.pane.setAttribute('aria-labelledby', this.tabs[id].id); this.pane.replaceChildren();
      const record = this.selected.record; const model = this.models.find(m => m.id === this.selected.modelId);
      if (id === 'passport') this.drawPassport(model);
      else if (id === 'application') this.drawApplication(model);
      else if (id === 'setup') this.drawSetup(record, model);
      else this.drawSources(model);
    }
    drawPassport(model) {
      this.pane.append(element('h4', '', 'Характеристики удилища'));
      const list = element('div', 'pg-spec-list');
      const specs = flattenedSpecs(model);
      for (const spec of specs) {
        const row = element('div', 'pg-spec'); const [label, cls] = statusLabel(spec.status);
        row.append(element('div', 'pg-spec-label', spec.label || 'Характеристика'), element('div', 'pg-spec-value', spec.value || 'Не уточнено'), element('div', `pg-evidence ${cls}`.trim(), label)); list.append(row);
      }
      this.pane.append(list);
      if (!specs.length) this.pane.append(element('p', '', 'Паспорт модели пока не заполнен.'));
      if (model?.reviewNote || model?.review_note) this.pane.append(element('div', 'pg-note', model.reviewNote || model.review_note));
      this.pane.append(element('p', '', 'Класс лески на удилище — рекомендация для модели. Фактически установленная леска указывается во вкладке «Мой комплект».'));
    }
    drawApplication(model) {
      this.pane.append(element('h4', '', 'Как использовать'), element('span', 'pg-practice-label', 'Практическая оценка'));
      const body = element('div', 'pg-application');
      const content = model?.application || model?.practical_note?.text;
      for (const item of Array.isArray(content) ? content : content ? [content] : []) {
        if (typeof item === 'string') body.append(element('p', '', item));
        else if (item && typeof item === 'object') { if (item.title) body.append(element('h4', '', item.title)); if (item.text) body.append(element('p', '', item.text)); }
      }
      if (!body.childNodes.length) body.append(element('p', '', 'Применение уточним после проверки точного паспорта и опыта на рыбалке.'));
      this.pane.append(body);
      if (model?.category === 'feeder' || model?.category === 'surf') this.pane.append(element('div', 'pg-note', 'Для заброса учитывайте полный вес оснастки, включая кормушку и корм. Чувствительность вершинки в oz и тест заброса — разные характеристики.'));
      else this.pane.append(element('div', 'pg-note', 'Подбирайте общий вес приманки и оснастки в пределах теста. Указанный верхний тест не означает допустимый вес поднимаемой рыбы.'));
    }
    drawSetup(record, model) {
      this.pane.append(element('h4', '', 'Ваш рабочий комплект'));
      if (!record) {
        const active = this.records.find(r => r.modelId === model?.id && !r.archived);
        const archived = this.records.find(r => r.modelId === model?.id && r.archived);
        this.pane.append(element('p', '', active ? 'Это удилище уже есть в вашем арсенале. Откройте личную карточку, чтобы изменить комплект.' : archived ?
          'Это удилище есть в архиве. Его можно вернуть и продолжить заполнять комплект.' : 'Добавьте своё удилище в арсенал, чтобы сохранить катушку, леску, поводок и заметки.'));
        const action = button(active ? 'Открыть мой комплект' : archived ? 'Вернуть из архива' : 'Добавить в мои снасти', async () => {
          if (active) { this.openDetail(active, model.id); return; }
          action.disabled = true;
          try {
            let added;
            if (archived) { await global.PersonalGear.archive(archived.id, false); added = { ...archived, archived: false }; }
            else added = await global.PersonalGear.add({ modelId: model.id, name: model.name, category: model.category, setup: { reel: '', line: '', leader: '' }, notes: '' });
            await this.refresh(); this.detailTab = 'setup'; this.openDetail(this.records.find(r => r.id === added.id), model.id, false);
            this.message(archived ? 'Удилище возвращено в комплект.' : 'Удилище добавлено. Заполните свой комплект.');
          } catch (e) { this.message(e.message || 'Не удалось сохранить удилище.', true); } finally { action.disabled = false; }
        }, 'pg-primary');
        action.disabled = !this.available || !model; this.pane.append(action); return;
      }
      if (record.archived) {
        this.pane.append(element('p', '', 'Удилище в архиве. Верните его в арсенал, чтобы изменить комплект.'));
        this.pane.append(button('Вернуть в комплект', () => this.archive(record, false), 'pg-primary'));
        for (const [value, title] of [[record.setup?.reel, 'Катушка'], [record.setup?.line, 'Шнур / леска'], [record.setup?.leader, 'Поводок'], [record.notes, 'Заметки']]) {
          if (value) this.pane.append(element('h4', '', title), element('p', '', value));
        }
        return;
      }
      const form = element('form'); const grid = element('div', 'pg-form-grid'); const inputs = {};
      for (const [id, label, placeholder, limit] of [
        ['reel', 'Катушка', 'Модель и размер', 200], ['line', 'Шнур / леска', 'Модель, диаметр или PE', 200],
        ['leader', 'Поводок', 'Материал, длина, диаметр', 200]
      ]) {
        const field = element('label', 'pg-field', label); const input = element('input'); input.name = id; input.type = 'text'; input.maxLength = limit;
        input.placeholder = placeholder; input.value = record.setup?.[id] || ''; field.append(input); grid.append(field); inputs[id] = input;
      }
      form.append(grid);
      const notesLabel = element('label', 'pg-field', 'Личные заметки'); const notes = element('textarea'); notes.name = 'notes'; notes.maxLength = 6000;
      notes.placeholder = 'Как ведёт себя на забросе и проводке, удобные веса, что стоит изменить'; notes.value = record.notes || ''; notesLabel.append(notes); form.append(notesLabel);
      const actions = element('div', 'pg-form-actions'); const save = element('button', 'pg-button pg-primary', 'Сохранить комплект'); save.type = 'submit';
      const archive = button('В архив', () => this.archive(record, true), 'pg-quiet');
      actions.append(save, archive, element('span', 'pg-form-caption', 'Можно заполнить только известные поля.')); form.append(actions);
      form.addEventListener('submit', async event => {
        event.preventDefault(); save.disabled = true; archive.disabled = true;
        try {
          await global.PersonalGear.update(record.id, { setup: { reel: inputs.reel.value, line: inputs.line.value, leader: inputs.leader.value }, notes: notes.value });
          await this.refresh(); this.message('Комплект сохранён. Он войдёт в резервную копию личных данных.');
        } catch (e) { this.message(e.message || 'Не удалось сохранить комплект.', true); } finally { save.disabled = false; archive.disabled = false; }
      });
      this.pane.append(form);
    }
    async archive(record, archived) {
      try {
        await global.PersonalGear.archive(record.id, archived); this.selected = null; await this.refresh(); this.closeDetail();
        this.message(archived ? 'Удилище перенесено в архив. Его можно вернуть в комплект.' : 'Удилище возвращено в комплект.');
      } catch (e) { this.message(e.message || 'Не удалось изменить архив.', true); }
    }
    drawSources(model) {
      this.pane.append(element('h4', '', 'Проверка характеристик'));
      this.pane.append(element('p', '', 'Паспортные сведения отделены от практической оценки. Совпадение названия серии ещё не подтверждает характеристики конкретного поколения.'));
      const sources = Array.isArray(model?.sources) ? model.sources : [];
      for (const source of sources) {
        const row = element('div', 'pg-source'); const url = safeURL(source.url);
        if (url) { const link = element('a', '', `${source.title || 'Страница модели'} ↗`); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; row.append(link); }
        else row.append(element('strong', '', source.title || 'Паспорт комплекта'));
        const details = source.limits || source.limit || source.note; if (details) row.append(element('p', '', details));
        if (source.accessed || source.reviewedAt) row.append(element('p', '', `Проверка: ${source.accessed || source.reviewedAt}`)); this.pane.append(row);
      }
      if (!sources.length) this.pane.append(element('div', 'pg-source', 'Характеристики комплекта. Подтверждение точной модели ещё продолжается.'));
      if (model?.reviewNote || model?.review_note) this.pane.append(element('div', 'pg-note', model.reviewNote || model.review_note));
    }
    async readImport() {
      this.pendingImport = null; this.importPanel.hidden = true;
      try {
        const file = this.input.files?.[0]; if (!file) return;
        if (file.size > 8 * 1024 * 1024) throw new Error('Файл слишком большой: максимум 8 МБ.');
        this.prepareImport(await file.text());
      } catch (e) { this.message(`Загрузка не выполнена: ${e.message || 'проверьте файл копии.'}`, true); }
      finally { this.input.value = ''; }
    }
    readPastedImport() {
      this.pendingImport = null; this.importPanel.hidden = true;
      try { this.prepareImport(this.pasteText.value); }
      catch (e) { this.message(`Загрузка не выполнена: ${e.message || 'проверьте сохранённые данные.'}`, true); }
    }
    prepareImport(text) {
      if (new TextEncoder().encode(text).byteLength > 8 * 1024 * 1024) throw new Error('Данные слишком большие: максимум 8 МБ.');
      if (!text.trim()) throw new Error('Вставьте сохранённые данные.');
      let payload;
      try { payload = JSON.parse(text); } catch (_) { throw new Error('Не удалось прочитать данные. Скопируйте сохранённое содержимое целиком.'); }
      if (payload?.format === 'rybalka-personal-gear') {
        const validated = global.PersonalGear.validateManifest(payload);
        this.pendingImport = { kind: 'gear', payload };
        const count = validated.count ?? validated.gear?.length ?? validated.records?.length ?? payload.gear.length;
        this.importText.textContent = `Комплект проверен: ${count} снастей. Новые снасти будут добавлены. Уже сохранённые комплекты, заметки и архив останутся без изменений.`;
        this.importConfirm.textContent = 'Добавить снасти';
      } else {
        const validated = global.PersonalStore.validateImport(payload);
        this.pendingImport = { kind: 'backup', payload };
        this.importText.textContent = `Копия проверена: ${validated.count} записей дневника и ${validated.gearCount || 0} снастей. Новые записи будут добавлены, более новые версии обновят совпадающие записи. При конфликте сохранится запись этого браузера.`;
        this.importConfirm.textContent = 'Восстановить копию';
      }
      this.importPanel.hidden = false; this.message('Проверьте состав и нажмите кнопку, чтобы загрузить данные.');
    }
    async applyImport() {
      if (!this.pendingImport) return;
      const pending = this.pendingImport; this.importConfirm.disabled = true;
      try {
        const result = pending.kind === 'gear' ? await global.PersonalGear.importManifest(pending.payload) : await global.PersonalStore.importBackup(pending.payload);
        this.pendingImport = null; this.importPanel.hidden = true; this.view = 'mine'; this.category = 'all'; this.query = ''; this.search.value = '';
        this.pasteText.value = ''; this.pasteDetails.open = false;
        await this.refresh();
        const summary = pending.kind === 'gear' ? result : result.gear;
        if (pending.kind === 'gear') this.message(`Комплект загружен: добавлено ${summary?.added || 0} снастей, без изменений ${summary?.unchanged || 0}, конфликтов ${summary?.conflicts || 0}. Уже сохранённые снасти оставлены без изменений.`);
        else {
          const unchanged = (result.unchanged || 0) + (summary?.unchanged || 0), conflicts = (result.conflicts || 0) + (summary?.conflicts || 0);
          this.message(`Копия восстановлена: добавлено ${result.added || 0} записей дневника и ${summary?.added || 0} снастей, обновлено ${result.updated || 0} записей дневника и ${summary?.updated || 0} снастей. Без изменений ${unchanged}, конфликтов ${conflicts}. При конфликте сохранены записи этого браузера.`);
        }
      } catch (e) { this.message(`Загрузка не выполнена: ${e.message || 'не удалось сохранить данные.'}`, true); }
      finally { this.importConfirm.disabled = false; }
    }
    async exportBackup() {
      try {
        const backup = await global.PersonalStore.exportBackup(); const text = JSON.stringify(backup);
        if (this.exportUrl) URL.revokeObjectURL(this.exportUrl);
        this.exportUrl = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
        this.download.href = this.exportUrl; this.download.download = `rybalka-personal-data-${new Date().toISOString().slice(0, 10)}.json`;
        this.exportText.value = text; this.exportDescription.textContent = `В копии ${backup.data.diary.length} записей дневника и ${(backup.data.gear || []).length} снастей, включая архив. Сохраните её вместе с проектом.`;
        this.exportPanel.hidden = false; this.message('Копия подготовлена. Скачайте файл или сохраните его содержимое.');
      } catch (e) { this.message(e.message || 'Не удалось подготовить копию.', true); }
    }
    async copyBackup() {
      try {
        await Promise.race([navigator.clipboard.writeText(this.exportText.value), new Promise((_, reject) => setTimeout(() => reject(new Error('Копирование не подтверждено.')), 1500))]);
        this.message('Содержимое копии скопировано. Сохраните его в файл с расширением .json.');
      } catch (_) { this.exportText.focus(); this.exportText.select(); this.message('Автоматическое копирование недоступно. Скопируйте выделенный текст вручную.', true); }
    }
  }
  global.PersonalGearUI = Object.freeze({
    async render(hostOrId = 'gearList', options = {}) {
      const host = typeof hostOrId === 'string' ? document.getElementById(hostOrId) : hostOrId;
      if (!host) return null;
      let instance = instances.get(host);
      if (!instance) { instance = new GearScreen(host, options); instances.set(host, instance); mounted.add(instance); }
      else { instance.options = options; instance.drawLegacy(); }
      installSearch();
      return instance.refresh();
    }
  });
})(window);
