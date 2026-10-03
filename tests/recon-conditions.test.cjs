const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../recon-conditions.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/forum-conditions.json'), 'utf8'));
test('Every conclusion references actual observations from the same place', () => assert.equal(api.validate(data), data));
test('Place and target filter prevent a perch report from recommending pike', () => {
  assert.equal(api.select(data, 'Новосибирск', 'окунь').length, 1);
  assert.equal(api.select(data, 'Новосибирск', 'щука').length, 0);
  assert.equal(api.select(data, 'Рыбинское водохранилище').length, 0);
  assert.equal(api.select(data, 'Обь').length, 0);
});
test('Briefs expire by outing date, not by a new publication or review date', () => {
  const now = new Date(2026, 9, 3, 12);
  assert.equal(api.age(data, data.briefs[0], now).stale, false);
  assert.equal(api.age(data, data.briefs[0], new Date(2026, 9, 10, 12)).stale, true);
  assert.equal(api.age(data, data.briefs[0], new Date(2026, 8, 1, 12)).future, true);
});
test('Unsafe links, absent evidence and evidence from another place are rejected', () => {
  for (const mutate of [x => x.observations[0].url = 'javascript:alert(1)', x => x.briefs[0].observation_ids = ['unknown'], x => x.briefs[0].observation_ids = ['fishingsib-169079']]) {
    const changed = JSON.parse(JSON.stringify(data)); mutate(changed);
    assert.throws(() => api.validate(changed));
  }
});
