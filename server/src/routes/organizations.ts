import express from 'express';
import pool from '../db/connection';
import { Organization } from '../types';

const router = express.Router();

// Get all organizations in hierarchical order
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM organizations ORDER BY level, display_order`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

// Get organization by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM organizations WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching organization:', error);
    res.status(500).json({ error: 'Failed to fetch organization' });
  }
});

// Create organization
router.post('/', async (req, res) => {
  try {
    const org: Partial<Organization> = req.body;
    const result = await pool.query(
      `INSERT INTO organizations (name, parent_org_id, level, display_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [org.name, org.parent_org_id, org.level ?? 0, org.display_order ?? 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating organization:', error);
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

export default router;
