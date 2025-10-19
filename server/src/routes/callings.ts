import express from 'express';
import pool from '../db/connection';
import { Calling } from '../types';

const router = express.Router();

// Get all callings with current assignments
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        c.*,
        o.name as organization_name,
        o.parent_org_id,
        ca.id as assignment_id,
        ca.assigned_date,
        ca.sustained_date,
        ca.set_apart_date,
        ca.is_active as assignment_active,
        m.id as member_id,
        m.first_name,
        m.last_name,
        m.photo_url
       FROM callings c
       LEFT JOIN organizations o ON c.organization_id = o.id
       LEFT JOIN calling_assignments ca ON c.id = ca.calling_id AND ca.is_active = true
       LEFT JOIN members m ON ca.member_id = m.id
       ORDER BY o.display_order, c.display_order`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching callings:', error);
    res.status(500).json({ error: 'Failed to fetch callings' });
  }
});

// Get calling by ID with full details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT
        c.*,
        o.name as organization_name,
        ca.id as assignment_id,
        ca.assigned_date,
        ca.sustained_date,
        ca.set_apart_date,
        m.id as member_id,
        m.first_name,
        m.last_name,
        m.photo_url,
        m.phone,
        m.email
       FROM callings c
       LEFT JOIN organizations o ON c.organization_id = o.id
       LEFT JOIN calling_assignments ca ON c.id = ca.calling_id AND ca.is_active = true
       LEFT JOIN members m ON ca.member_id = m.id
       WHERE c.id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Calling not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching calling:', error);
    res.status(500).json({ error: 'Failed to fetch calling' });
  }
});

// Create a new calling
router.post('/', async (req, res) => {
  try {
    const calling: Partial<Calling> = req.body;
    const result = await pool.query(
      `INSERT INTO callings (
        organization_id, title, position_type, requires_setting_apart,
        display_order, parent_calling_id
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        calling.organization_id,
        calling.title,
        calling.position_type,
        calling.requires_setting_apart ?? true,
        calling.display_order ?? 0,
        calling.parent_calling_id,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating calling:', error);
    res.status(500).json({ error: 'Failed to create calling' });
  }
});

// Update a calling
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const calling: Partial<Calling> = req.body;
    const result = await pool.query(
      `UPDATE callings SET
        title = COALESCE($1, title),
        position_type = COALESCE($2, position_type),
        requires_setting_apart = COALESCE($3, requires_setting_apart),
        display_order = COALESCE($4, display_order)
      WHERE id = $5
      RETURNING *`,
      [
        calling.title,
        calling.position_type,
        calling.requires_setting_apart,
        calling.display_order,
        id,
      ]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Calling not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating calling:', error);
    res.status(500).json({ error: 'Failed to update calling' });
  }
});

export default router;
