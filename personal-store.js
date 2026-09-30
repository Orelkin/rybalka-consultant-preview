/* Личный дневник на этом устройстве. Внешние запросы и исходные личные записи отсутствуют. */
(function (global) {
  'use strict';

  const DB_NAME = 'rybalka-personal-diary-v1';
  const DB_VERSION = 1;
  const STORE = 'diary';
  const FORMAT = 'rybalka-personal-backup';
  const FORMAT_VERSION = 1;
  const MAX_BACKUP_BYTES = 8 * 1024 * 1024;
  const MAX_RECORDS = 5000;
  const LIMITS = Object.freeze({ date: 10, location: 160, fish: 200, result: 1000, method: 1500, conclusion: 3000, notes: 6000 });
  const FIELDS = Object.keys(LIMITS);
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
  function text(value, field) {
    if (value === undefined) value = '';
    if (typeof value !== 'string') fail(`Поле «${field}» должно быть текстом.`);
    let normalized = value.normalize('NFC').replace(/\r\n?/g, '\n').trim();
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) fail(`В поле «${field}» есть недопустимые символы.`);
    if (['date', 'location', 'fish'].includes(field)) normalized = normalized.replace(/\s+/g, ' ');
    if (normalized.length > LIMITS[field]) fail(`Поле «${field}» слишком длинное: максимум ${LIMITS[field]} символов.`);
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
    return record;
  }
  function identifier(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)) fail('Некорректный идентификатор записи.');
    return value;
  }
  function timestamp(value, label) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) fail(`${label}: некорректное время.`);
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) fail(`${label}: некорректное время.`);
    return value;
  }
  function backupRecord(value) {
    object(value, 'Запись в копии');
    keys(value, [...FIELDS, ...META_FIELDS], 'Запись в копии');
    for (const field of [...FIELDS, ...META_FIELDS]) {
      if (!Object.prototype.hasOwnProperty.call(value, field)) fail(`В записи копии нет поля «${field}».`);
    }
    const normalized = fields(value);
    const id = identifier(value.id);
    const createdAt = timestamp(value.createdAt, 'Создание');
    const updatedAt = timestamp(value.updatedAt, 'Изменение');
    if (createdAt > updatedAt) fail('Изменение записи не может предшествовать её созданию.');
    if (typeof value.archived !== 'boolean') fail('Статус архива должен быть логическим значением.');
    const archivedAt = value.archived ? timestamp(value.archivedAt, 'Архивирование') : null;
    if (!value.archived && value.archivedAt !== null) fail('У активной записи не должно быть даты архивирования.');
    if (archivedAt && (archivedAt < createdAt || archivedAt > updatedAt)) fail('Дата архивирования не соответствует истории записи.');
    return { id, ...normalized, createdAt, updatedAt, archived: value.archived, archivedAt };
  }
  function validateImport(payload) {
    if (typeof payload === 'string') {
      if (new TextEncoder().encode(payload).byteLength > MAX_BACKUP_BYTES) fail('Файл копии превышает 8 МБ.');
      try { payload = JSON.parse(payload); } catch (_) { fail('Файл не является корректной JSON-копией.'); }
    }
    object(payload, 'Копия');
    if (payload.format === 'fishing-consultant') fail('Это копия ранней PWA. Для неё нужен отдельный проверенный перенос; текущая база не изменена.');
    keys(payload, ['format', 'version', 'exportedAt', 'data'], 'Копия');
    if (payload.format !== FORMAT || payload.version !== FORMAT_VERSION) fail('Формат или версия копии не поддерживаются.');
    const exportedAt = timestamp(payload.exportedAt, 'Экспорт');
    object(payload.data, 'Данные копии');
    keys(payload.data, ['diary'], 'Данные копии');
    if (!Array.isArray(payload.data.diary)) fail('В копии нет массива дневника.');
    if (payload.data.diary.length > MAX_RECORDS) fail(`В копии больше ${MAX_RECORDS} записей.`);
    let encoded;
    try { encoded = JSON.stringify(payload); } catch (_) { fail('Копия содержит некорректные данные.'); }
    if (new TextEncoder().encode(encoded).byteLength > MAX_BACKUP_BYTES) fail('Файл копии превышает 8 МБ.');
    const ids = new Set();
    const records = payload.data.diary.map(value => {
      const record = backupRecord(value);
      if (ids.has(record.id)) fail(`В копии повторяется идентификатор «${record.id}».`);
      ids.add(record.id);
      return record;
    });
    return { format: FORMAT, version: FORMAT_VERSION, exportedAt, count: records.length, records };
  }

  function storageError(error) {
    if (error?.name === 'QuotaExceededError') return new Error('Не хватает места для дневника. Скачайте копию данных и освободите место.');
    if (error?.name === 'SecurityError' || error?.name === 'InvalidStateError') return new Error('Хранилище браузера недоступно. Разрешите локальное хранение для приложения.');
    return new Error('Не удалось сохранить или прочитать личные данные. Перезагрузите приложение; данные не подтверждены как сохранённые.');
  }
  function getDatabase() {
    if (!global.indexedDB) return Promise.reject(new Error('Этот браузер не предоставляет локальное хранилище IndexedDB.'));
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        let request;
        let settled = false;
        function rejectOpen(error) {
          if (!settled) { settled = true; reject(error); }
        }
        try { request = global.indexedDB.open(DB_NAME, DB_VERSION); } catch (error) { rejectOpen(storageError(error)); return; }
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
        };
        request.onerror = () => rejectOpen(storageError(request.error));
        request.onblocked = () => rejectOpen(new Error('Закройте другую вкладку приложения, чтобы открыть личное хранилище.'));
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
      try { tx = db.transaction(STORE, mode); } catch (error) { reject(storageError(error)); return; }
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || storageError(tx.error));
      tx.onerror = event => { failure = failure || storageError(event?.target?.error || tx.error); };
      const stop = error => {
        failure = error;
        try { tx.abort(); } catch (_) { reject(error); }
      };
      try { work(tx.objectStore(STORE), value => { result = value; }, stop); } catch (error) { stop(error); }
    });
  }
  function newId() {
    if (typeof global.crypto?.randomUUID === 'function') return global.crypto.randomUUID();
    if (typeof global.crypto?.getRandomValues !== 'function') fail('Браузер не может создать устойчивый идентификатор записи.');
    const bytes = global.crypto.getRandomValues(new Uint8Array(16));
    return 'diary-' + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function nextTime(previous) {
    const value = new Date(Math.max(Date.now(), previous ? new Date(previous).getTime() + 1 : 0)).toISOString();
    timestamp(value, 'Изменение');
    return value;
  }
  function checkCapacity(records) {
    if (records.length > MAX_RECORDS) fail(`В дневнике может быть не больше ${MAX_RECORDS} записей, включая архив.`);
    const payload = { format: FORMAT, version: FORMAT_VERSION, exportedAt: new Date().toISOString(), data: { diary: records } };
    if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > MAX_BACKUP_BYTES) fail('Дневник превышает размер переносимой копии 8 МБ. Новые данные не сохранены.');
  }
  async function list(options = {}) {
    object(options, 'Параметры списка');
    keys(options, ['includeArchived'], 'Параметры списка');
    if (options.includeArchived !== undefined && typeof options.includeArchived !== 'boolean') fail('Параметр includeArchived должен быть логическим значением.');
    const records = await transaction('readonly', (store, done) => {
      const request = store.getAll();
      request.onsuccess = () => done(request.result);
    });
    return records.filter(record => options.includeArchived || !record.archived)
      .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  }
  async function add(value) {
    object(value, 'Запись');
    keys(value, FIELDS, 'Запись');
    const normalized = fields(value);
    const now = nextTime();
    const record = { id: newId(), ...normalized, createdAt: now, updatedAt: now, archived: false, archivedAt: null };
    return transaction('readwrite', (store, done, stop) => {
      const request = store.getAll();
      request.onsuccess = () => {
        try {
          checkCapacity([...request.result, record]);
          store.add(record);
          done(record);
        } catch (error) { stop(error); }
      };
    });
  }
  async function update(id, changes) {
    identifier(id);
    object(changes, 'Изменения');
    keys(changes, FIELDS, 'Изменения');
    return transaction('readwrite', (store, done, stop) => {
      const request = store.getAll();
      request.onsuccess = () => {
        try {
          const old = request.result.find(record => record.id === id);
          if (!old) fail('Запись не найдена.');
          const normalized = fields({ ...old, ...changes });
          const record = { ...old, ...normalized, updatedAt: nextTime(old.updatedAt) };
          checkCapacity(request.result.map(item => item.id === id ? record : item));
          store.put(record);
          done(record);
        } catch (error) { stop(error); }
      };
    });
  }
  async function archive(id, archived = true) {
    identifier(id);
    if (typeof archived !== 'boolean') fail('Статус архива должен быть логическим значением.');
    return transaction('readwrite', (store, done, stop) => {
      const request = store.getAll();
      request.onsuccess = () => {
        try {
          const old = request.result.find(record => record.id === id);
          if (!old) fail('Запись не найдена.');
          if (old.archived === archived) { done(old); return; }
          const now = nextTime(old.updatedAt);
          const record = { ...old, archived, archivedAt: archived ? now : null, updatedAt: now };
          checkCapacity(request.result.map(item => item.id === id ? record : item));
          store.put(record);
          done(record);
        } catch (error) { stop(error); }
      };
    });
  }
  async function exportBackup() {
    const records = await list({ includeArchived: true });
    const payload = { format: FORMAT, version: FORMAT_VERSION, exportedAt: new Date().toISOString(), data: { diary: records } };
    // Не создавать копию, которую собственный импорт не сможет восстановить.
    validateImport(payload);
    return payload;
  }
  async function importBackup(payload) {
    // Проверка всего файла выполняется до открытия базы и начала транзакции.
    const validated = validateImport(payload);
    return transaction('readwrite', (store, done, stop) => {
      const request = store.getAll();
      request.onsuccess = () => {
        try {
          const existing = new Map(request.result.map(record => [record.id, record]));
          const summary = { added: 0, updated: 0, unchanged: 0, conflicts: 0, total: existing.size };
          const writes = [];
          for (const incoming of validated.records) {
            const old = existing.get(incoming.id);
            if (!old) {
              existing.set(incoming.id, incoming);
              writes.push({ record: incoming, add: true });
              summary.added++;
            } else if (incoming.createdAt !== old.createdAt) {
              summary.conflicts++;
            } else if (incoming.updatedAt > old.updatedAt) {
              existing.set(incoming.id, incoming);
              writes.push({ record: incoming, add: false });
              summary.updated++;
            } else if (incoming.updatedAt === old.updatedAt && JSON.stringify(incoming) !== JSON.stringify(old)) {
              summary.conflicts++;
            } else {
              summary.unchanged++;
            }
          }
          summary.total = existing.size;
          checkCapacity([...existing.values()]);
          for (const write of writes) write.add ? store.add(write.record) : store.put(write.record);
          done(summary);
        } catch (error) { stop(error); }
      };
    });
  }

  global.PersonalStore = Object.freeze({ ready, list, add, update, archive, exportBackup, validateImport, importBackup });
})(window);
