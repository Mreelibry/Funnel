'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeShipment, shipmentTotals, defaultTitle, humanDate } = require('../server/model');
const { buildLayout } = require('../server/layout');
const { buildRequests } = require('../server/sheets');

const sample = () => ({
  date: '2026-09-17',
  fulfillment: 'Азамат ФФ',
  brands: [
    {
      name: 'Heavenly style',
      owner: 'ИП Эмиров Б.',
      models: [
        {
          name: 'Вилка однотон',
          sizes: ['XS', 'S', 'M', 'L'],
          colors: [
            { name: 'Белый', article: 'вилка белый', qty: { XS: 15, S: 15, M: 15, L: 15 } },
            { name: 'Красный', qty: { XS: 12, S: 15, M: 15, L: 12 } },
          ],
        },
        { name: 'Бетман', kind: 'return', sizes: ['XS', 'S'], colors: [{ name: 'Черный', qty: { XS: 1, S: '2', L: 5 } }] },
      ],
    },
  ],
});

test('заголовок и дата в формате таблицы', () => {
  assert.equal(defaultTitle('2026-10-06', 'Новый фф'), 'От 6 октября (Новый фф)');
  assert.equal(humanDate('2026-10-06'), '6 окт. 2026г.');
});

test('нормализация: дефолтный заголовок, чистка количеств по размерам', () => {
  const s = normalizeShipment(sample());
  assert.equal(s.title, 'От 17 сентября (Азамат ФФ)');
  assert.equal(s.status, 'draft');
  const ret = s.brands[0].models[1];
  assert.equal(ret.kind, 'return');
  assert.deepEqual(ret.colors[0].qty, { XS: 1, S: 2 }); // L нет в размерах модели
  assert.deepEqual(shipmentTotals(s), { shipped: 114, returned: 3, total: 117 });
});

test('нормализация: ошибки валидации', () => {
  assert.throws(() => normalizeShipment({ brands: [] }), /дату/);
  assert.throws(() => normalizeShipment({ date: '2026-01-01', brands: [{ name: '' }] }), /бренда/);
  assert.throws(() => normalizeShipment({ date: '2026-01-01', brands: [{ name: 'A', models: [{}] }] }), /модели/);
});

test('лист повторяет структуру бухгалтерской таблицы', () => {
  const { rows } = buildLayout(normalizeShipment(sample()));
  const text = rows.map((r) => r.map((c) => (c ? c.value : '')).join(' | '));
  assert.ok(text.includes('Heavenly style — ИП Эмиров Б.'));
  assert.ok(text.includes('ОТГРУЗКА: Вилка однотон'));
  assert.ok(text.includes('Размер | Белый\nАрт.вилка белый | Красный'));
  assert.ok(text.includes('XS | 15 | 12'));
  assert.ok(text.includes('Общ: | 60 | 54'));
  assert.ok(text.includes('Общ.кол-во: | 114'));
  assert.ok(text.includes('ВОЗВРАТЫ: Бетман'));
  assert.ok(text.includes('Возвраты (Итого): | 3'));
});

test('запросы к Sheets API собираются без ошибок', () => {
  const reqs = buildRequests(42, 'Тест', normalizeShipment(sample()));
  assert.equal(reqs[0].updateSheetProperties.properties.title, 'Тест');
  const write = reqs.find((r) => r.updateCells && r.updateCells.rows);
  assert.ok(write.updateCells.rows.length > 10);
  assert.ok(reqs.some((r) => r.mergeCells));
});
