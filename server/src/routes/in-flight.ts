import express from 'express';
import pool from '../db/connection';

const router = express.Router();

/**
 * GET /api/in-flight/needs-set-apart
 * Returns active calling assignments where set_apart_date IS NULL
 * These are people who have been sustained but still need to be set apart
 * Filtered to last 60 days by default
 */
router.get('/needs-set-apart', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 60;

    const result = await pool.query(`
      SELECT
        ca.id as assignment_id,
        ca.sustained_date,
        ca.assigned_date,
        c.id as calling_id,
        c.title as calling_title,
        o.name as organization_name,
        m.id as member_id,
        m.church_id as member_church_id,
        m.first_name,
        m.last_name,
        m.photo_url,
        m.phone,
        m.email,
        cc.id as calling_change_id,
        cc.status as calling_change_status,
        cc.source as calling_change_source
      FROM calling_assignments ca
      JOIN callings c ON ca.calling_id = c.id
      JOIN organizations o ON c.organization_id = o.id
      JOIN members m ON ca.member_id = m.id
      LEFT JOIN calling_changes cc ON (
        cc.calling_org_name = o.name
        AND cc.calling_title = c.title
        AND cc.new_member_church_id = m.church_id
        AND cc.status != 'completed'
      )
      WHERE ca.is_active = true
        AND ca.set_apart_date IS NULL
        AND ca.sustained_date IS NOT NULL
        AND ca.sustained_date >= CURRENT_DATE - INTERVAL '${days} days'
        AND cc.id IS NULL
      ORDER BY ca.sustained_date DESC, o.display_order, c.display_order
    `, []);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching needs-set-apart:', error);
    res.status(500).json({ error: 'Failed to fetch needs-set-apart list' });
  }
});

/**
 * GET /api/in-flight/recent-releases
 * Returns recently detected releases from the last sync
 * These are people who were released in MemberTools but we had no record of
 */
router.get('/recent-releases', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        cc.id,
        cc.calling_id,
        cc.calling_org_name as organization_name,
        cc.calling_title,
        cc.current_member_id as member_id,
        cc.current_member_church_id as member_church_id,
        cm.first_name,
        cm.last_name,
        cm.photo_url,
        cc.status,
        cc.source,
        cc.detected_at,
        cc.created_date
      FROM calling_changes cc
      LEFT JOIN members cm ON cc.current_member_id = cm.id
      WHERE cc.source = 'auto_detected'
        AND cc.new_member_id IS NULL
        AND cc.current_member_id IS NOT NULL
        AND cc.status = 'in_flight'
      ORDER BY cc.detected_at DESC
      LIMIT 50
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching recent releases:', error);
    res.status(500).json({ error: 'Failed to fetch recent releases' });
  }
});

/**
 * GET /api/in-flight/count
 * Returns the count of in-flight items (for nav badge)
 */
router.get('/count', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 60;

    // Count needs-set-apart (last 60 days, excluding those with existing calling changes)
    const needsSetApartResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM calling_assignments ca
      JOIN callings c ON ca.calling_id = c.id
      JOIN organizations o ON c.organization_id = o.id
      JOIN members m ON ca.member_id = m.id
      LEFT JOIN calling_changes cc ON (
        cc.calling_org_name = o.name
        AND cc.calling_title = c.title
        AND cc.new_member_church_id = m.church_id
        AND cc.status != 'completed'
      )
      WHERE ca.is_active = true
        AND ca.set_apart_date IS NULL
        AND ca.sustained_date IS NOT NULL
        AND ca.sustained_date >= CURRENT_DATE - INTERVAL '${days} days'
        AND cc.id IS NULL
    `, []);

    // Count in-flight calling changes
    const inFlightResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM calling_changes
      WHERE status = 'in_flight'
    `);

    res.json({
      needs_set_apart: parseInt(needsSetApartResult.rows[0].count),
      in_flight_changes: parseInt(inFlightResult.rows[0].count),
      total: parseInt(needsSetApartResult.rows[0].count) + parseInt(inFlightResult.rows[0].count)
    });
  } catch (error) {
    console.error('Error fetching in-flight count:', error);
    res.status(500).json({ error: 'Failed to fetch in-flight count' });
  }
});

/**
 * GET /api/in-flight/summary
 * Returns a summary of in-flight items grouped by type
 */
router.get('/summary', async (req, res) => {
  try {
    // Get new assignments (needs set apart)
    const newAssignmentsResult = await pool.query(`
      SELECT
        cc.id,
        cc.calling_title,
        cc.calling_org_name as organization_name,
        nm.first_name as new_first_name,
        nm.last_name as new_last_name,
        cc.detected_at
      FROM calling_changes cc
      LEFT JOIN members nm ON cc.new_member_id = nm.id
      WHERE cc.source = 'auto_detected'
        AND cc.status = 'in_flight'
        AND cc.new_member_id IS NOT NULL
      ORDER BY cc.detected_at DESC
      LIMIT 10
    `);

    // Get releases
    const releasesResult = await pool.query(`
      SELECT
        cc.id,
        cc.calling_title,
        cc.calling_org_name as organization_name,
        cm.first_name as current_first_name,
        cm.last_name as current_last_name,
        cc.detected_at
      FROM calling_changes cc
      LEFT JOIN members cm ON cc.current_member_id = cm.id
      WHERE cc.source = 'auto_detected'
        AND cc.status = 'in_flight'
        AND cc.new_member_id IS NULL
        AND cc.current_member_id IS NOT NULL
      ORDER BY cc.detected_at DESC
      LIMIT 10
    `);

    res.json({
      new_assignments: newAssignmentsResult.rows,
      releases: releasesResult.rows
    });
  } catch (error) {
    console.error('Error fetching in-flight summary:', error);
    res.status(500).json({ error: 'Failed to fetch in-flight summary' });
  }
});

/**
 * POST /api/in-flight/mark-set-apart/:assignmentId
 * Marks a calling assignment as set apart (sets set_apart_date to today)
 */
router.post('/mark-set-apart/:assignmentId', async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { date } = req.body;

    const setApartDate = date || new Date().toISOString().split('T')[0];

    const result = await pool.query(`
      UPDATE calling_assignments
      SET set_apart_date = $1
      WHERE id = $2
      RETURNING *
    `, [setApartDate, assignmentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error marking set apart:', error);
    res.status(500).json({ error: 'Failed to mark as set apart' });
  }
});

/**
 * POST /api/in-flight/create-task/:assignmentId
 * Creates a calling change with a set_apart task for an assignment
 */
router.post('/create-task/:assignmentId', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { assignmentId } = req.params;

    // Get assignment details
    const assignment = await client.query(`
      SELECT
        ca.id,
        ca.member_id,
        c.id as calling_id,
        c.title as calling_title,
        o.name as org_name,
        m.church_id as member_church_id
      FROM calling_assignments ca
      JOIN callings c ON ca.calling_id = c.id
      JOIN organizations o ON c.organization_id = o.id
      JOIN members m ON ca.member_id = m.id
      WHERE ca.id = $1
    `, [assignmentId]);

    if (assignment.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const { calling_id, calling_title, org_name, member_id, member_church_id } = assignment.rows[0];

    // Check if a calling change already exists for this
    const existing = await client.query(`
      SELECT id FROM calling_changes
      WHERE calling_org_name = $1
        AND calling_title = $2
        AND new_member_church_id = $3
        AND status != 'completed'
    `, [org_name, calling_title, member_church_id]);

    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'A calling change already exists for this assignment',
        calling_change_id: existing.rows[0].id
      });
    }

    // Create calling change
    const callingChange = await client.query(`
      INSERT INTO calling_changes (
        calling_id, calling_org_name, calling_title,
        new_member_id, new_member_church_id,
        status, source, detected_at, created_date
      ) VALUES ($1, $2, $3, $4, $5, 'in_flight', 'auto_detected', CURRENT_TIMESTAMP, CURRENT_DATE)
      RETURNING id
    `, [calling_id, org_name, calling_title, member_id, member_church_id]);

    const callingChangeId = callingChange.rows[0].id;

    // Create set_apart task
    await client.query(`
      INSERT INTO tasks (
        calling_change_id, task_type, member_id, member_church_id, status
      ) VALUES ($1, 'set_apart', $2, $3, 'pending')
    `, [callingChangeId, member_id, member_church_id]);

    // Create record_set_apart task
    await client.query(`
      INSERT INTO tasks (
        calling_change_id, task_type, member_id, member_church_id, status
      ) VALUES ($1, 'record_set_apart', $2, $3, 'pending')
    `, [callingChangeId, member_id, member_church_id]);

    await client.query('COMMIT');

    res.json({
      success: true,
      calling_change_id: callingChangeId,
      message: 'Task created successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  } finally {
    client.release();
  }
});

export default router;
