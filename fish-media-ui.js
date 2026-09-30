/* The catalogue is the only runtime source of fish image paths and credits. */
(function (global) {
  'use strict';

  const PLACEHOLDER = 'assets/fish/placeholder.svg';
  const IMAGE_SELECTOR = 'img[data-fish-media-key]';
  const FRAME_SELECTOR = '.fish25-target,.fish25-group-photo,.fish25-species-img,.fp25-hero,.fp25-look,.fish-thumb,.target-mini,.fish-card-v22 .fc-img,.fp-hero,.fp-photo-row';
  const bound = new WeakSet();
  const failedImages = new WeakMap();
  const diagnostics = new Map();
  let indexedPack = null;
  let indexedImages = null;
  let byName = new Map();
  let byId = new Map();
  let byTaxon = new Map();

  function text(value) { return typeof value === 'string' ? value.trim() : ''; }
  function key(value) { return text(value).normalize('NFKC').toLocaleLowerCase('ru').replace(/\s+/g, ' '); }
  function escape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  }
  function localPath(value) {
    const path = text(value);
    // No absolute URLs, credentials, query strings, traversal, or encoded paths.
    if (!/^assets\/fish\/[A-Za-z0-9][A-Za-z0-9_./-]*\.(?:svg|png|jpe?g|webp|avif)$/i.test(path)) return '';
    if (path.split('/').some(part => part === '.' || part === '..' || !part)) return '';
    return path;
  }
  function externalLink(value) {
    try {
      const url = new URL(text(value));
      return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : '';
    } catch (_) { return ''; }
  }
  function ensureIndex() {
    const pack = global.FISH_MEDIA_V1;
    const images = pack && pack.version === 1 && Array.isArray(pack.images) ? pack.images : [];
    if (indexedPack === pack && indexedImages === images) return;
    indexedPack = pack;
    indexedImages = images;
    byName = new Map(); byId = new Map(); byTaxon = new Map();
    for (const entry of images) {
      if (!entry || typeof entry !== 'object') continue;
      const nameKey = key(entry.catalog_name);
      const taxonKey = key(entry.taxon);
      if (nameKey && !byName.has(nameKey)) byName.set(nameKey, entry);
      if (text(entry.id) && !byId.has(text(entry.id))) byId.set(text(entry.id), entry);
      if (taxonKey) {
        // A taxon shared by several catalogue records must not choose one at random.
        byTaxon.set(taxonKey, byTaxon.has(taxonKey) ? null : entry);
      }
    }
  }
  function entryFor(fish) {
    ensureIndex();
    if (typeof fish === 'string') return byName.get(key(fish)) || byId.get(text(fish)) || null;
    if (!fish || typeof fish !== 'object') return null;
    const name = text(fish.catalog_name) || text(fish.name);
    if (name) return byName.get(key(name)) || null;
    const id = text(fish.id);
    if (id && byId.has(id)) return byId.get(id);
    const taxon = key(fish.taxon || fish.image_taxon || fish.scientific_name);
    return taxon ? byTaxon.get(taxon) || null : null;
  }
  function nameFor(fish, entry) {
    return text(entry && entry.catalog_name) || (typeof fish === 'string' ? text(fish) : text(fish && (fish.name || fish.catalog_name))) || 'Рыба';
  }
  function stateFor(entry) {
    const path = localPath(entry && entry.path);
    if (!entry || entry.status === 'pending' || entry.kind === 'placeholder' || !path || path === PLACEHOLDER) return 'missing';
    return entry.status === 'verified_visual' ? 'verified_visual' : 'saved_needs_visual_review';
  }
  function src(fish) {
    const entry = entryFor(fish);
    return stateFor(entry) === 'missing' ? PLACEHOLDER : localPath(entry.thumbnail && entry.thumbnail.path) || localPath(entry.path);
  }
  function attrs(fish) {
    const entry = entryFor(fish);
    const name = nameFor(fish, entry);
    // The existing renderers add their own escaped alt; hydration also sets it as text.
    return `src="${escape(src(fish))}" data-fish-media-key="${escape(text(entry && entry.catalog_name) || name)}" data-fish-media-name="${escape(name)}" loading="lazy" decoding="async"`;
  }
  function within(root, selector) {
    if (!root) return [];
    const result = root.querySelectorAll ? Array.from(root.querySelectorAll(selector)) : [];
    if (root.matches && root.matches(selector)) result.unshift(root);
    return result;
  }
  function diagnostic(entry, name, reason) {
    const id = text(entry && entry.id) || name;
    const diagnosticKey = id + ':' + reason;
    if (diagnostics.has(diagnosticKey)) return;
    const detail = Object.freeze({id, catalog_name: name, reason});
    diagnostics.set(diagnosticKey, detail);
    if (reason === 'file_unavailable' && typeof global.CustomEvent === 'function') {
      global.dispatchEvent(new CustomEvent('fish-media-error', {detail}));
    }
  }
  function imageState(img, entry) {
    return failedImages.has(img) ? 'file_unavailable' : stateFor(entry);
  }
  function decorateImage(img) {
    const entry = entryFor(img.dataset.fishMediaKey);
    const state = imageState(img, entry);
    const frame = img.closest(FRAME_SELECTOR);
    img.dataset.fishMediaStatus = state;
    img.dataset.fishMediaKind = text(entry && entry.kind) || 'placeholder';
    if (frame) {
      frame.dataset.fishMediaStatus = state;
      frame.dataset.fishMediaKind = img.dataset.fishMediaKind;
      frame.dataset.fishMediaLoading = String(!(img.complete && img.naturalWidth > 0));
      const imagePath = state === 'file_unavailable' || state === 'missing' ? PLACEHOLDER : localPath(img.getAttribute('src')) || src(entry);
      // localPath only permits a static, ASCII path, so this cannot inject CSS or fetch an external image.
      frame.style.setProperty('--fish-photo', `url("${imagePath}")`);
      frame.classList.add(frame.className.indexOf('fp25-') !== -1 ? 'fp25-media-frame' : 'fish25-media-frame');
    }
  }
  function replaceCredit(root) {
    const hosts = within(root, '[data-current-fish-source]');
    for (const host of hosts) {
      const slot = host.querySelector('[data-image-credit]');
      if (!slot) continue;
      const holder = document.createElement('div');
      holder.innerHTML = credit(host.dataset.currentFishSource);
      slot.replaceWith(holder.firstElementChild);
    }
  }
  function handleError(img) {
    const entry = entryFor(img.dataset.fishMediaKey);
    const name = nameFor(img.dataset.fishMediaName, entry);
    if (failedImages.has(img)) return; // A failed placeholder must never trigger a retry loop.
    failedImages.set(img, localPath(entry && entry.path) || PLACEHOLDER);
    img.alt = `${name} — изображение недоступно`;
    img.title = 'Файл изображения недоступен. Показана нейтральная заглушка.';
    diagnostic(entry, name, 'file_unavailable');
    if (img.getAttribute('src') !== PLACEHOLDER) img.setAttribute('src', PLACEHOLDER);
    decorateImage(img);
    replaceCredit(document);
  }
  function hydrate(root) {
    root = root || document;
    for (const img of within(root, IMAGE_SELECTOR)) {
      const entry = entryFor(img.dataset.fishMediaKey);
      const name = nameFor(img.dataset.fishMediaName, entry);
      const large = !!img.closest('.fp25-hero,.fp25-look,.fp-hero,.fp-photo-row');
      const target = large && stateFor(entry) !== 'missing' ? localPath(entry.path) : src(entry || img.dataset.fishMediaKey);
      img.loading = large ? 'eager' : 'lazy';
      if (failedImages.has(img) && failedImages.get(img) !== (localPath(entry && entry.path) || PLACEHOLDER)) failedImages.delete(img);
      if (!bound.has(img)) {
        bound.add(img);
        img.removeAttribute('onerror');
        img.onerror = null;
        img.addEventListener('error', () => handleError(img));
        img.addEventListener('load', () => decorateImage(img));
      }
      const missing = stateFor(entry) === 'missing';
      img.alt = failedImages.has(img) ? `${name} — изображение недоступно` : missing ? `${name} — изображение пока не подготовлено` : name;
      if (!failedImages.has(img) && img.getAttribute('src') !== target) img.setAttribute('src', target);
      if (missing) {
        img.title = 'Для этого вида изображение пока не подготовлено.';
        diagnostic(entry, name, localPath(entry && entry.path) ? 'pending' : 'missing_or_invalid_path');
      }
      decorateImage(img);
      if (img.complete && img.naturalWidth === 0) handleError(img);
    }
    decorate(root);
  }
  function credit(fish) {
    const entry = entryFor(fish);
    const name = nameFor(fish, entry);
    const state = stateFor(entry);
    const runtimeFailure = diagnostics.has((text(entry && entry.id) || name) + ':file_unavailable');
    if (state === 'missing' || runtimeFailure) {
      return `<div class="fp25-source-credit" data-image-credit data-fish-media-credit><b>Изображение</b><span>${runtimeFailure ? 'Файл недоступен; показана нейтральная заглушка.' : 'Изображение этого вида пока не подготовлено; показана нейтральная заглушка.'}</span></div>`;
    }
    const source = entry.source && typeof entry.source === 'object' ? entry.source : {};
    const sourceUrl = externalLink(source.url);
    const licenseUrl = externalLink(source.license_url);
    const author = text(source.author);
    const license = text(source.license);
    const illustration = entry.kind === 'illustration';
    const origin = illustration ? 'Иллюстрация' : entry.kind === 'photo' ? 'Фотография' : 'Изображение';
    const parts = [author ? escape(author) : '', license ? (licenseUrl ? `<a href="${escape(licenseUrl)}" target="_blank" rel="noopener noreferrer">${escape(license)}</a>` : escape(license)) : '', sourceUrl ? `<a href="${escape(sourceUrl)}" target="_blank" rel="noopener noreferrer">Источник</a>` : ''].filter(Boolean);
    const review = state === 'verified_visual' ? 'Видовое соответствие проверено.' : 'Видовое соответствие требует визуальной проверки.';
    const note = text(entry.review_note);
    const referenceUrl = externalLink(source.reference_url);
    const reference = referenceUrl ? `<span>Фото-ориентир: ${escape(text(source.reference_author))} · ${escape(text(source.reference_license))} · <a href="${escape(referenceUrl)}" target="_blank" rel="noopener noreferrer">Источник</a></span>` : '';
    return `<div class="fp25-source-credit" data-image-credit data-fish-media-credit><b>${origin}</b>${parts.length ? `<span>${parts.join(' · ')}</span>` : ''}${reference}<span>${escape(review)}${note ? ' ' + escape(note) : ''}</span></div>`;
  }
  function decorate(root) {
    root = root || document;
    within(root, IMAGE_SELECTOR).forEach(decorateImage);
    // Source notes remain in the existing source sheet, away from card titles and species content.
    replaceCredit(root);
  }

  global.FishMedia = Object.freeze({src, attrs, hydrate, credit, decorate, diagnostics: () => Array.from(diagnostics.values())});
})(window);
