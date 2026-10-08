'use strict';

// Превращает отправку в «картинку» листа: строки ячеек + объединения.
// Формат повторяет то, как бухгалтер ведёт таблицу «Отправки»:
// бренд → дата → модель → таблица «Размер × Цвет» → Общ: → Общ.кол-во.

const { humanDate, colorTotal, modelTotal, brandTotal, shipmentTotals } = require('./model');

const KIND_LABEL = { shipment: 'ОТГРУЗКА', return: 'ВОЗВРАТЫ' };

function buildLayout(s) {
  const rows = [];
  const merges = [];
  const maxColors = Math.max(1, ...s.brands.flatMap((b) => b.models.map((m) => m.colors.length)));
  const width = Math.max(4, maxColors + 1);

  const push = (cells = []) => rows.push(cells);
  const blank = () => push([]);
  const fullRow = (value, style) => {
    merges.push({ row: rows.length, col: 0, rows: 1, cols: width });
    push([{ value, style }]);
  };

  const sub = [humanDate(s.date), s.fulfillment].filter(Boolean).join(' · ');
  fullRow(`${s.title}`, 'title');
  fullRow(sub, 'subtitle');
  if (s.comment) fullRow(s.comment, 'comment');
  blank();

  for (const b of s.brands) {
    fullRow([b.name, b.owner].filter(Boolean).join(' — '), 'brand');
    push([{ value: `Дата: ${humanDate(s.date)}`, style: 'date' }]);
    blank();

    for (const m of b.models) {
      const cols = Math.max(1, m.colors.length);
      merges.push({ row: rows.length, col: 0, rows: 1, cols: cols + 1 });
      push([{ value: `${KIND_LABEL[m.kind]}: ${m.name}`, style: m.kind === 'return' ? 'modelReturn' : 'model' }]);

      push([
        { value: 'Размер', style: 'head' },
        ...m.colors.map((c) => ({
          value: c.article ? `${c.name}\nАрт.${c.article}` : c.name,
          style: 'head',
        })),
      ]);
      for (const size of m.sizes) {
        push([
          { value: size, style: 'size' },
          ...m.colors.map((c) => ({ value: c.qty[size] || null, style: 'qty' })),
        ]);
      }
      push([
        { value: 'Общ:', style: 'sumLabel' },
        ...m.colors.map((c) => ({ value: colorTotal(c), style: 'sum' })),
      ]);
      push([
        { value: 'Общ.кол-во:', style: 'totalLabel' },
        { value: modelTotal(m), style: 'total' },
      ]);
      blank();
    }

    const shipped = brandTotal(b, 'shipment');
    const returned = brandTotal(b, 'return');
    if (b.models.length > 1 || (shipped && returned)) {
      if (shipped) push([{ value: 'Общ.кол-во (Итого):', style: 'grandLabel' }, { value: shipped, style: 'grand' }]);
      if (returned) push([{ value: 'Возвраты (Итого):', style: 'grandLabel' }, { value: returned, style: 'grand' }]);
    }
    blank();
    blank();
  }

  const t = shipmentTotals(s);
  if (s.brands.length > 1) {
    push([{ value: 'ИТОГО ПО ОТПРАВКЕ:', style: 'finalLabel' }, { value: t.shipped, style: 'final' }]);
    if (t.returned) push([{ value: 'ИТОГО ВОЗВРАТОВ:', style: 'finalLabel' }, { value: t.returned, style: 'final' }]);
  }

  return { rows, merges, width };
}

module.exports = { buildLayout };
