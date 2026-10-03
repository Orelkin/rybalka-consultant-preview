/* Личные записи на этом устройстве. Внешних запросов и исходных личных списков нет. */
(function (global) {
  'use strict';

  const DB_NAME = 'rybalka-personal-diary-v1';
  const DB_VERSION = 2;
  const DIARY = 'diary';
  const GEAR = 'gear';
  const FORMAT = 'rybalka-personal-backup';
  const FORMAT_VERSION = 3;
  const GEAR_FORMAT = 'rybalka-personal-gear';
  const MAX_BACKUP_BYTES = 8 * 1024 * 1024;
  const MAX_RECORDS = 5000;
  const LIMITS = Object.freeze({ date: 10, location: 160, fish: 200, result: 1000, method: 1500, conclusion: 3000, notes: 6000 });
  const GEAR_LIMITS = Object.freeze({ name: 200, category: 80, notes: 6000, reel: 200, line: 200, leader: 200 });
  const FIELDS = Object.keys(LIMITS);
  const DIARY_FIELDS = [...FIELDS, 'context'];
  const GEAR_FIELDS = ['modelId', 'name', 'category', 'setup', 'notes'];
  const META_FIELDS = ['id', 'createdAt', 'updatedAt', 'archived', 'archivedAt'];
  let dbPromise;

  function fail(message) { throw new Error(message); }
  function object(value, label) {
    if (!value || Array.isArray(value) || Object.prototype.toString.call(value) !== '[object Object]') fail(`${label}: нужен объект.`);
  }
  function keys(value, allowed, label) {
    const unknown = Object.keys(value).find(key => !allowed.includes(key));
    if (unknown) fail(`${label}: неизвестное поле «${unknown}».`);
  }
  function requiredKeys(value, required, label) {
    object(value, label);
    for (const field of required) if (!Object.prototype.hasOwnProperty.call(value, field)) fail(`${label}: нет поля «${field}».`);
  }
  function text(value, field, limits = LIMITS) {
    if (value === undefined) value = '';
    if (typeof value !== 'string') fail(`Поле «${field}» должно быть текстом.`);
    let normalized = value.normalize('NFC').replace(/\r\n?/g, '\n').trim();
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) fail(`В поле «${field}» есть недопустимые символы.`);
    if (['date', 'location', 'fish', 'name', 'category', 'reel', 'line', 'leader'].includes(field)) normalized = normalized.replace(/\s+/g, ' ');
    if (normalized.length > limits[field]) fail(`Поле «${field}» слишком длинное: максимум ${limits[field]} символов.`);
    return normalized;
  }
  function calendarDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) fail('Укажите дату рыбалки в формате ГГГГ-ММ-ДД.');
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail('Такой календарной даты нет.');
    return value;
  }
  function fields(value) {
    object(value, 'Запись');
    const record = {};
    for (const field of FIELDS) record[field] = text(value[field], field);
    calendarDate(record.date);
    if (!record.location) fail('Укажите место рыбалки.');
    if (!record.result) fail('Укажите результат рыбалки; неизвестный улов можно так и записать.');
    record.context = global.DiaryContext.normalize(value.context);
    return record;
  }
  function identifier(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)) fail('Некорректный идентификатор записи.');
    return value;
  }
  function gearFields(value) {
    object(value, 'Снасть');
    const modelId = identifier(value.modelId);
    const name = text(value.name, 'name', GEAR_LIMITS);
    const category = text(value.category, 'category', GEAR_LIMITS);
    const notes = text(value.notes, 'notes', GEAR_LIMITS);
    if (!name) fail('Укажите название снасти.');
    if (!category) fail('Укажите категорию снасти.');
    const rawSetup = value.setup === undefined ? {} : value.setup;
    object(rawSetup, 'Комплект');
    keys(rawSetup, ['reel', 'line', 'leader'], 'Комплект');
    const setup = {};
    for (const field of ['reel', 'line', 'leader']) setup[field] = text(rawSetup[field], field, GEAR_LIMITS);
    return { modelId, name, category, setup, notes };
  }
  function timestamp(value, label) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) fail(`${label}: некорректное время.`);
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) fail(`${label}: некорректное время.`);
    return value;
  }
  function metadata(value) {
    const id = identifier(value.id);
    const createdAt = timestamp(value.createdAt, 'Создание');
    const updatedAt = timestamp(value.updatedAt, 'Изменение');
    if (createdAt > updatedAt) fail('Изменение записи не может предшествовать её созданию.');
    if (typeof value.archived !== 'boolean') fail('Статус архива должен быть логическим значением.');
    const archivedAt = value.archived ? timestamp(value.archivedAt, 'Архивирование') : null;
    if (!value.archived && value.archivedAt !== null) fail('У активной записи не должно быть даты архивирования.');
    if (archivedAt && (archivedAt < createdAt || archivedAt > updatedAt)) fail('Дата архивирования не соответствует истории записи.');
    return { id, createdAt, updatedAt, archived: value.archived, archivedAt };
  }
  function backupRecord(value, collection = DIARY) {
    const allowed = collection === GEAR ? GEAR_FIELDS : DIARY_FIELDS;
    object(value, 'Запись в копии');
    keys(value, [...allowed, ...META_FIELDS], 'Запись в копии');
    requiredKeys(value, [...(collection === GEAR ? GEAR_FIELDS : FIELDS), ...META_FIELDS], 'Запись в копии');
    if (collection === GEAR) requiredKeys(value.setup, ['reel', 'line', 'leader'], 'Комплект в копии');
    const meta = metadata(value);
    return { id: meta.id, ...(collection === GEAR ? gearFields(value) : fields(value)), ...meta };
  }
  function parsePayload(payload) {
    if (typeof payload === 'string') {
      if (new TextEncoder().encode(payload).byteLength > MAX_BACKUP_BYTES) fail('Файл копии превышает 8 МБ.');
      try { payload = JSON.parse(payload); } catch (_) { fail('Файл не является корректной JSON-копией.'); }
    }
    object(payload, 'Копия');
    let encoded;
    try { encoded = JSON.stringify(payload); } catch (_) { fail('Копия содержит некорректные данные.'); }
    if (new TextEncoder().encode(encoded).byteLength > MAX_BACKUP_BYTES) fail('Файл копии превышает 8 МБ.');
    return payload;
  }
  function validateRecords(values, collection) {
    if (!Array.isArray(values)) fail(`В копии нет массива «${collection}».`);
    if (values.length > MAX_RECORDS) fail(`В копии больше ${MAX_RECORDS} записей раздела «${collection}».`);
    const ids = new Set();
    return values.map(value => {
      const record = backupRecord(value, collection);
      if (ids.has(record.id)) fail(`В копии повторяется идентификатор «${record.id}».`);
      ids.add(record.id);
      return record;
    });
  }
  function validateImport(payload) {
    payload = parsePayload(payload);
    if (payload.format === 'fishing-consultant') fail('Это копия ранней PWA. Для неё нужен отдельный проверенный перенос; текущая база не изменена.');
    keys(payload, ['format', 'version', 'exportedAt', 'data'], 'Копия');
    if (payload.format !== FORMAT || ![1, 2, FORMAT_VERSION].includes(payload.version)) fail('Формат или версия копии не поддерживаются.');
    const exportedAt = timestamp(payload.exportedAt, 'Экспорт');
    object(payload.data, 'Данные копии');
    keys(payload.data, payload.version === 1 ? [DIARY] : [DIARY, GEAR], 'Данные копии');
    const records = validateRecords(payload.data.diary, DIARY);
    const hasGear = payload.version >= 2;
    const gearRecords = hasGear ? validateRecords(payload.data.gear, GEAR) : [];
    return { format: FORMAT, version: payload.version, exportedAt, count: records.length, records, gearCount: gearRecords.length, gearRecords, hasGear };
  }
  function validateManifest(payload) {
    payload = parsePayload(payload);
    keys(payload, ['format', 'version', 'gear'], 'Список снастей');
    if (payload.format !== GEAR_FORMAT || payload.version !== 1) fail('Формат списка снастей не поддерживается.');
    if (!Array.isArray(payload.gear)) fail('В файле нет списка снастей.');
    if (payload.gear.length > MAX_RECORDS) fail(`В списке больше ${MAX_RECORDS} снастей.`);
    const ids = new Set();
    const records = payload.gear.map(value => {
      object(value, 'Снасть в списке');
      keys(value, ['id', ...GEAR_FIELDS], 'Снасть в списке');
      const id = identifier(value.id);
      if (ids.has(id)) fail(`В списке повторяется идентификатор «${id}».`);
      ids.add(id);
      return { id, ...gearFields(value) };
    });
    return { format: GEAR_FORMAT, version: 1, count: records.length, records };
  }

  function storageError(error) {
    if (error?.name === 'QuotaExceededError') return new Error('Не хватает места для личных данных. Скачайте копию данных и освободите место.');
    if (error?.name === 'SecurityError' || error?.name === 'InvalidStateError') return new Error('Хранилище браузера недоступно. Разрешите локальное хранение для приложения.');
    return new Error('Не удалось сохранить или прочитать личные данные. Перезагрузите приложение; данные не подтверждены как сохранённые.');
  }
  function getDatabase() {
    if (!global.indexedDB) return Promise.reject(new Error('Этот браузер не предоставляет локальное хранилище IndexedDB.'));
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        let request;
        let settled = false;
        function rejectOpen(error) { if (!settled) { settled = true; reject(error); } }
        try { request = global.indexedDB.open(DB_NAME, DB_VERSION); } catch (error) { rejectOpen(storageError(error)); return; }
        request.onupgradeneeded = () => {
          const db = request.result;
          for (const name of [DIARY, GEAR]) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        };
        request.onerror = () => rejectOpen(storageError(request.error));
        request.onblocked = () => rejectOpen(new Error('Закройте другую вкладку приложения, чтобы обновить личное хранилище.'));
        request.onsuccess = () => {
          const db = request.result;
          if (settled) { db.close(); return; }
          settled = true;
          db.onversionchange = () => { db.close(); dbPromise = undefined; };
          resolve(db);
        };
      }).catch(error => { dbPromise = undefined; throw error; });
    }
    return dbPromise;
  }
  async function ready() {
    await getDatabase();
    return { storage: 'indexeddb', schemaVersion: DB_VERSION };
  }
  async function transaction(mode, work) {
    const db = await getDatabase();
    return new Promise((resolve, reject) => {
      let tx;
      let result;
      let failure;
      try { tx = db.transaction([DIARY, GEAR], mode); } catch (error) { reject(storageError(error)); return; }
      tx.oncomplete = () => {
        if (mode === 'readwrite' && typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
          try { global.dispatchEvent(new global.CustomEvent('rybalka-personal-data-changed')); } catch (_) { /* Сохранение уже завершено; событие не влияет на результат. */ }
        }
        resolve(result);
      };
      tx.onabort = () => reject(failure || storageError(tx.error));
      tx.onerror = event => { failure = failure || storageError(event?.target?.error || tx.error); };
      const stop = error => { failure = error; try { tx.abort(); } catch (_) { reject(error); } };
      const stores = { diary: tx.objectStore(DIARY), gear: tx.objectStore(GEAR) };
      const records = {};
      let remaining = 2;
      try {
        for (const name of [DIARY, GEAR]) {
          const request = stores[name].getAll();
          request.onsuccess = () => {
            records[name] = request.result;
            if (--remaining === 0) { try { work(records, stores, value => { result = value; }, stop); } catch (error) { stop(error); } }
          };
        }
      } catch (error) { stop(error); }
    });
  }
  function newId(prefix = 'diary') {
    if (typeof global.crypto?.randomUUID === 'function') return global.crypto.randomUUID();
    if (typeof global.crypto?.getRandomValues !== 'function') fail('Браузер не может создать устойчивый идентификатор записи.');
    const bytes = global.crypto.getRandomValues(new Uint8Array(16));
    return prefix + '-' + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function nextTime(previous) {
    const value = new Date(Math.max(Date.now(), previous ? new Date(previous).getTime() + 1 : 0)).toISOString();
    timestamp(value, 'Изменение');
    return value;
  }
  function checkCapacity(data) {
    for (const name of [DIARY, GEAR]) if (data[name].length > MAX_RECORDS) fail(`В разделе «${name}» может быть не больше ${MAX_RECORDS} записей, включая архив.`);
    const payload = { format: FORMAT, version: FORMAT_VERSION, exportedAt: new Date().toISOString(), data };
    if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > MAX_BACKUP_BYTES) fail('Личные данные превышают размер переносимой копии 8 МБ. Новые данные не сохранены.');
  }
  function listOptions(options) {
    object(options, 'Параметры списка');
    keys(options, ['includeArchived'], 'Параметры списка');
    if (options.includeArchived !== undefined && typeof options.includeArchived !== 'boolean') fail('Параметр includeArchived должен быть логическим значением.');
  }
  async function collectionList(collection, options = {}) {
    listOptions(options);
    const records = await transaction('readonly', (data, _stores, done) => done(data[collection]));
    return records.filter(record => options.includeArchived || !record.archived).sort(collection === DIARY
      ? (a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)
      : (a, b) => a.category.localeCompare(b.category, 'ru') || a.name.localeCompare(b.name, 'ru') || a.id.localeCompare(b.id));
  }
  async function collectionAdd(collection, value) {
    const isGear = collection === GEAR;
    object(value, isGear ? 'Снасть' : 'Запись');
    keys(value, isGear ? ['id', ...GEAR_FIELDS] : DIARY_FIELDS, isGear ? 'Снасть' : 'Запись');
    const normalized = isGear ? gearFields(value) : fields(value);
    const now = nextTime();
    const id = isGear && value.id !== undefined ? identifier(value.id) : newId(collection);
    const record = { id, ...normalized, createdAt: now, updatedAt: now, archived: false, archivedAt: null };
    return transaction('readwrite', (data, stores, done) => {
      if (data[collection].some(item => item.id === id)) fail('Запись с таким идентификатором уже существует.');
      data[collection].push(record);
      checkCapacity(data);
      stores[collection].add(record);
      done(record);
    });
  }
  async function collectionUpdate(collection, id, changes) {
    identifier(id);
    object(changes, 'Изменения');
    keys(changes, collection === GEAR ? GEAR_FIELDS : DIARY_FIELDS, 'Изменения');
    return transaction('readwrite', (data, stores, done) => {
      const old = data[collection].find(record => record.id === id);
      if (!old) fail('Запись не найдена.');
      const combined = { ...old, ...changes };
      if (collection === GEAR && changes.setup !== undefined) {
        object(changes.setup, 'Комплект');
        keys(changes.setup, ['reel', 'line', 'leader'], 'Комплект');
        combined.setup = { ...old.setup, ...changes.setup };
      }
      const normalized = collection === GEAR ? gearFields(combined) : fields(combined);
      const record = { ...old, ...normalized, updatedAt: nextTime(old.updatedAt) };
      data[collection] = data[collection].map(item => item.id === id ? record : item);
      checkCapacity(data);
      stores[collection].put(record);
      done(record);
    });
  }
  async function collectionArchive(collection, id, archived = true) {
    identifier(id);
    if (typeof archived !== 'boolean') fail('Статус архива должен быть логическим значением.');
    return transaction('readwrite', (data, stores, done) => {
      const old = data[collection].find(record => record.id === id);
      if (!old) fail('Запись не найдена.');
      if (old.archived === archived) { done(old); return; }
      const now = nextTime(old.updatedAt);
      const record = { ...old, archived, archivedAt: archived ? now : null, updatedAt: now };
      data[collection] = data[collection].map(item => item.id === id ? record : item);
      checkCapacity(data);
      stores[collection].put(record);
      done(record);
    });
  }
  async function exportBackup() {
    const data = await transaction('readonly', (records, _stores, done) => done(records));
    const payload = { format: FORMAT, version: FORMAT_VERSION, exportedAt: new Date().toISOString(), data };
    // Не создавать копию, которую собственный импорт не сможет восстановить.
    validateImport(payload);
    return payload;
  }
  function mergeRecords(existingRecords, incomingRecords) {
    // Older records have no context; this is equivalent to an empty snapshot.
    const stable = value => JSON.stringify(value, (key, item) => {
      if (key === 'context' && item === null) return undefined;
      if (item && !Array.isArray(item) && typeof item === 'object') return Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]]));
      return item;
    });
    const existing = new Map(existingRecords.map(record => [record.id, record]));
    const summary = { added: 0, updated: 0, unchanged: 0, conflicts: 0, total: existing.size };
    const writes = [];
    for (const incoming of incomingRecords) {
      const old = existing.get(incoming.id);
      if (!old) {
        existing.set(incoming.id, incoming);
        writes.push({ record: incoming, add: true });
        summary.added++;
      } else if (incoming.createdAt !== old.createdAt) summary.conflicts++;
      else if (incoming.updatedAt > old.updatedAt) {
        existing.set(incoming.id, incoming);
        writes.push({ record: incoming, add: false });
        summary.updated++;
      } else if (incoming.updatedAt === old.updatedAt && stable(incoming) !== stable(old)) summary.conflicts++;
      else summary.unchanged++;
    }
    summary.total = existing.size;
    return { records: [...existing.values()], writes, summary };
  }
  async function importBackup(payload) {
    // Обе коллекции проверяются до открытия базы. Изменения сохраняются одной транзакцией.
    const validated = validateImport(payload);
    return transaction('readwrite', (data, stores, done) => {
      const diary = mergeRecords(data.diary, validated.records);
      const gear = mergeRecords(data.gear, validated.hasGear ? validated.gearRecords : []);
      checkCapacity({ diary: diary.records, gear: gear.records });
      for (const [name, result] of [[DIARY, diary], [GEAR, gear]]) for (const write of result.writes) write.add ? stores[name].add(write.record) : stores[name].put(write.record);
      done({ ...diary.summary, gear: gear.summary });
    });
  }
  async function importManifest(payload) {
    const validated = validateManifest(payload);
    return transaction('readwrite', (data, stores, done) => {
      const existing = new Map(data.gear.map(record => [record.id, record]));
      const summary = { added: 0, updated: 0, unchanged: 0, conflicts: 0, total: existing.size };
      const additions = [];
      const now = nextTime();
      for (const incoming of validated.records) {
        const old = existing.get(incoming.id);
        // Начальный список не может заменять личные изменения или возвращать архивированные снасти.
        if (old) { old.modelId === incoming.modelId ? summary.unchanged++ : summary.conflicts++; continue; }
        const record = { ...incoming, createdAt: now, updatedAt: now, archived: false, archivedAt: null };
        existing.set(record.id, record);
        additions.push(record);
        summary.added++;
      }
      data.gear = [...existing.values()];
      checkCapacity(data);
      for (const record of additions) stores.gear.add(record);
      summary.total = existing.size;
      done(summary);
    });
  }

  global.PersonalStore = Object.freeze({ ready, list: options => collectionList(DIARY, options), add: value => collectionAdd(DIARY, value), update: (id, changes) => collectionUpdate(DIARY, id, changes), archive: (id, archived) => collectionArchive(DIARY, id, archived), exportBackup, validateImport, importBackup });
  global.PersonalGear = Object.freeze({ ready, list: options => collectionList(GEAR, options), add: value => collectionAdd(GEAR, value), update: (id, changes) => collectionUpdate(GEAR, id, changes), archive: (id, archived) => collectionArchive(GEAR, id, archived), validateManifest, importManifest, exportBackup, validateImport, importBackup });
})(window);
