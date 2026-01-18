import express from 'express';
import pool from '../db/connection';

const router = express.Router();

// Get all youth interviews with member details
router.get('/youth', async (req, res) => {
  try {
    const { type } = req.query; // Optional filter by BYI or BCYI

    let query = `
      SELECT
        yi.id,
        yi.interview_type,
        yi.api_interview_type,
        yi.is_due,
        yi.last_interview_date,
        yi.notes,
        m.id as member_id,
        m.first_name,
        m.last_name,
        m.photo_url,
        m.age,
        m.gender,
        m.phone,
        m.email,
        h.household_name
      FROM youth_interviews yi
      JOIN members m ON yi.member_id = m.id
      LEFT JOIN households h ON m.household_id = h.id
      WHERE yi.is_due = true
    `;

    const params: any[] = [];

    if (type && (type === 'BYI' || type === 'BCYI')) {
      query += ` AND yi.interview_type = $1`;
      params.push(type);
    }

    query += ` ORDER BY yi.interview_type, m.last_name, m.first_name`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching youth interviews:', error);
    res.status(500).json({ error: 'Failed to fetch youth interviews' });
  }
});

// Get interview counts summary
router.get('/youth/summary', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        interview_type,
        COUNT(*) as count
      FROM youth_interviews
      WHERE is_due = true
      GROUP BY interview_type
      ORDER BY interview_type
    `);

    const summary = {
      BYI: 0,
      BCYI: 0,
      total: 0,
    };

    for (const row of result.rows) {
      if (row.interview_type === 'BYI') {
        summary.BYI = parseInt(row.count);
      } else if (row.interview_type === 'BCYI') {
        summary.BCYI = parseInt(row.count);
      }
    }
    summary.total = summary.BYI + summary.BCYI;

    res.json(summary);
  } catch (error) {
    console.error('Error fetching interview summary:', error);
    res.status(500).json({ error: 'Failed to fetch interview summary' });
  }
});

// Update interview notes
router.put('/youth/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, is_due, last_interview_date } = req.body;

    const result = await pool.query(
      `UPDATE youth_interviews
       SET notes = COALESCE($1, notes),
           is_due = COALESCE($2, is_due),
           last_interview_date = COALESCE($3, last_interview_date),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [notes, is_due, last_interview_date, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating interview:', error);
    res.status(500).json({ error: 'Failed to update interview' });
  }
});

// Mark interview as completed
router.post('/youth/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const { interview_date } = req.body;

    const result = await pool.query(
      `UPDATE youth_interviews
       SET is_due = false,
           last_interview_date = COALESCE($1, CURRENT_DATE),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [interview_date, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error completing interview:', error);
    res.status(500).json({ error: 'Failed to complete interview' });
  }
});

export default router;
