const express = require('express');
const db      = require('../services/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/unit-economics — список товаров текущего менеджера (все для админа)
router.get('/', authenticate, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await db.query(
        `SELECT ue.*, m.name as manager_name
         FROM unit_economics ue
         JOIN managers m ON m.id = ue.manager_id
         ORDER BY ue.created_at DESC`
      );
    } else {
      const mgrId = req.user.manager_id;
      if (!mgrId) return res.json([]);
      result = await db.query(
        `SELECT * FROM unit_economics WHERE manager_id = $1 ORDER BY created_at DESC`,
        [mgrId]
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/unit-economics — создать товар
router.post('/', authenticate, async (req, res) => {
  const mgrId = req.user.role === 'admin' ? req.body.manager_id : req.user.manager_id;
  if (!mgrId) return res.status(400).json({ error: 'Нет привязки к менеджеру' });

  const {
    name, currency_rate, purchase_price, batch_qty,
    length_cm, width_cm, height_cm,
    commission_pct, price_before_spp, buyout_pct,
    ad_spend_pct, loc_index, sales_dist_index,
    tax_system, tax_rate, spp,
    acceptance_cost, storage_cost, warehouse_coeff, extra_expenses,
  } = req.body;

  try {
    const result = await db.query(
      `INSERT INTO unit_economics (
        manager_id, name, currency_rate, purchase_price, batch_qty,
        length_cm, width_cm, height_cm,
        commission_pct, price_before_spp, buyout_pct,
        ad_spend_pct, loc_index, sales_dist_index,
        tax_system, tax_rate, spp,
        acceptance_cost, storage_cost, warehouse_coeff, extra_expenses
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      RETURNING *`,
      [
        mgrId, name || 'Новый товар',
        currency_rate || 1, purchase_price || 0, batch_qty || 1,
        length_cm || 0, width_cm || 0, height_cm || 0,
        commission_pct || 0, price_before_spp || 0, buyout_pct ?? 100,
        ad_spend_pct || 0, loc_index || 1, sales_dist_index || 0,
        tax_system || 'Не считать налог', tax_rate || 0,
        (spp != null && spp !== '') ? spp : null,
        acceptance_cost || 0, storage_cost || 0, warehouse_coeff || 1, extra_expenses || 0,
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/unit-economics/:id — обновить товар
router.put('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const {
    name, currency_rate, purchase_price, batch_qty,
    length_cm, width_cm, height_cm,
    commission_pct, price_before_spp, buyout_pct,
    ad_spend_pct, loc_index, sales_dist_index,
    tax_system, tax_rate, spp,
    acceptance_cost, storage_cost, warehouse_coeff, extra_expenses,
  } = req.body;

  try {
    const check = await db.query('SELECT manager_id FROM unit_economics WHERE id = $1', [id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Не найдено' });
    if (req.user.role !== 'admin' && check.rows[0].manager_id !== req.user.manager_id) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }

    const result = await db.query(
      `UPDATE unit_economics SET
        name=$1, currency_rate=$2, purchase_price=$3, batch_qty=$4,
        length_cm=$5, width_cm=$6, height_cm=$7,
        commission_pct=$8, price_before_spp=$9, buyout_pct=$10,
        ad_spend_pct=$11, loc_index=$12, sales_dist_index=$13,
        tax_system=$14, tax_rate=$15, spp=$16,
        acceptance_cost=$17, storage_cost=$18, warehouse_coeff=$19, extra_expenses=$20,
        updated_at=NOW()
      WHERE id=$21 RETURNING *`,
      [
        name, currency_rate, purchase_price, batch_qty,
        length_cm, width_cm, height_cm,
        commission_pct, price_before_spp, buyout_pct,
        ad_spend_pct, loc_index, sales_dist_index,
        tax_system, tax_rate,
        (spp != null && spp !== '') ? spp : null,
        acceptance_cost, storage_cost, warehouse_coeff, extra_expenses,
        id,
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/unit-economics/:id
router.delete('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const check = await db.query('SELECT manager_id FROM unit_economics WHERE id = $1', [id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Не найдено' });
    if (req.user.role !== 'admin' && check.rows[0].manager_id !== req.user.manager_id) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    await db.query('DELETE FROM unit_economics WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
