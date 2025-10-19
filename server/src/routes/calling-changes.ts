import express from 'express';
import pool from '../db/connection';
import { CallingChange, CallingConsideration } from '../types';

const router = express.Router();

// Get all calling changes with full details
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;

    let query = `
      SELECT
        cc.*,
        c.title as calling_title,
        o.name as organization_name,
        cm.id as current_member_id,
        cm.first_name as current_first_name,
        cm.last_name as current_last_name,
        cm.photo_url as current_photo_url,
        nm.id as new_member_id,
        nm.first_name as new_first_name,
        nm.last_name as new_last_name,
        nm.photo_url as new_photo_url
      FROM calling_changes cc
      LEFT JOIN callings c ON cc.calling_id = c.id
      LEFT JOIN organizations o ON c.organization_id = o.id
      LEFT JOIN members cm ON cc.current_member_id = cm.id
      LEFT JOIN members nm ON cc.new_member_id = nm.id
    `;

    const params: any[] = [];
    if (status) {
      query += ' WHERE cc.status = $1';
      params.push(status);
    }

    query += ' ORDER BY cc.priority DESC, cc.created_date DESC';

    const result = await pool.query(query, params);

    // Get considerations and tasks for each calling change
    const changesWithDetails = await Promise.all(
      result.rows.map(async (change) => {
        const considerations = await pool.query(
          `SELECT
            cc.*,
            m.first_name,
            m.last_name,
            m.photo_url,
            m.phone,
            m.email
           FROM calling_considerations cc
           LEFT JOIN members m ON cc.member_id = m.id
           WHERE cc.calling_change_id = $1
           ORDER BY cc.consideration_order`,
          [change.id]
        );

        const tasks = await pool.query(
          `SELECT t.*, m.first_name, m.last_name
           FROM tasks t
           LEFT JOIN members m ON t.member_id = m.id
           WHERE t.calling_change_id = $1
           ORDER BY t.created_at`,
          [change.id]
        );

        return {
          ...change,
          considerations: considerations.rows,
          tasks: tasks.rows,
        };
      })
    );

    res.json(changesWithDetails);
  } catch (error) {
    console.error('Error fetching calling changes:', error);
    res.status(500).json({ error: 'Failed to fetch calling changes' });
  }
});

// Get calling change by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT
        cc.*,
        c.title as calling_title,
        o.name as organization_name,
        cm.id as current_member_id,
        cm.first_name as current_first_name,
        cm.last_name as current_last_name,
        nm.id as new_member_id,
        nm.first_name as new_first_name,
        nm.last_name as new_last_name
      FROM calling_changes cc
      LEFT JOIN callings c ON cc.calling_id = c.id
      LEFT JOIN organizations o ON c.organization_id = o.id
      LEFT JOIN members cm ON cc.current_member_id = cm.id
      LEFT JOIN members nm ON cc.new_member_id = nm.id
      WHERE cc.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Calling change not found' });
    }

    // Get considerations
    const considerations = await pool.query(
      `SELECT
        cc.*,
        m.first_name,
        m.last_name,
        m.photo_url
       FROM calling_considerations cc
       LEFT JOIN members m ON cc.member_id = m.id
       WHERE cc.calling_change_id = $1
       ORDER BY cc.consideration_order`,
      [id]
    );

    // Get tasks
    const tasks = await pool.query(
      `SELECT * FROM tasks WHERE calling_change_id = $1 ORDER BY created_at`,
      [id]
    );

    res.json({
      ...result.rows[0],
      considerations: considerations.rows,
      tasks: tasks.rows,
    });
  } catch (error) {
    console.error('Error fetching calling change:', error);
    res.status(500).json({ error: 'Failed to fetch calling change' });
  }
});

// Create a new calling change
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const callingChange: Partial<CallingChange> = req.body;
    const result = await client.query(
      `INSERT INTO calling_changes (
        calling_id, current_member_id, status, priority, assigned_to_bishopric_member
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [
        callingChange.calling_id,
        callingChange.current_member_id,
        callingChange.status ?? 'in_progress',
        callingChange.priority ?? 0,
        callingChange.assigned_to_bishopric_member,
      ]
    );

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating calling change:', error);
    res.status(500).json({ error: 'Failed to create calling change' });
  } finally {
    client.release();
  }
});

// Update a calling change
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const callingChange: Partial<CallingChange> = req.body;
    const result = await pool.query(
      `UPDATE calling_changes SET
        new_member_id = COALESCE($1, new_member_id),
        status = COALESCE($2, status),
        priority = COALESCE($3, priority),
        assigned_to_bishopric_member = COALESCE($4, assigned_to_bishopric_member),
        completed_date = COALESCE($5, completed_date)
      WHERE id = $6
      RETURNING *`,
      [
        callingChange.new_member_id,
        callingChange.status,
        callingChange.priority,
        callingChange.assigned_to_bishopric_member,
        callingChange.completed_date,
        id,
      ]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Calling change not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating calling change:', error);
    res.status(500).json({ error: 'Failed to update calling change' });
  }
});

// Add a consideration to a calling change
router.post('/:id/considerations', async (req, res) => {
  try {
    const { id } = req.params;
    const consideration: Partial<CallingConsideration> = req.body;
    const result = await pool.query(
      `INSERT INTO calling_considerations (
        calling_change_id, member_id, is_selected_for_prayer, notes, consideration_order
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [
        id,
        consideration.member_id,
        consideration.is_selected_for_prayer ?? false,
        consideration.notes,
        consideration.consideration_order ?? 0,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding consideration:', error);
    res.status(500).json({ error: 'Failed to add consideration' });
  }
});

// Remove a consideration
router.delete('/:id/considerations/:considerationId', async (req, res) => {
  try {
    const { considerationId } = req.params;
    await pool.query('DELETE FROM calling_considerations WHERE id = $1', [considerationId]);
    res.status(204).send();
  } catch (error) {
    console.error('Error removing consideration:', error);
    res.status(500).json({ error: 'Failed to remove consideration' });
  }
});

// Mark consideration for prayer
router.put('/:id/considerations/:considerationId/select', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id, considerationId } = req.params;

    // Unmark all other considerations for this calling change
    await client.query(
      'UPDATE calling_considerations SET is_selected_for_prayer = false WHERE calling_change_id = $1',
      [id]
    );

    // Mark the selected one
    const result = await client.query(
      'UPDATE calling_considerations SET is_selected_for_prayer = true WHERE id = $1 RETURNING *',
      [considerationId]
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error selecting consideration:', error);
    res.status(500).json({ error: 'Failed to select consideration' });
  } finally {
    client.release();
  }
});

// Approve selection and create tasks
router.post('/:id/approve', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;

    // Get the calling change details
    const callingChange = await client.query(
      `SELECT cc.*, c.title as calling_title
       FROM calling_changes cc
       LEFT JOIN callings c ON cc.calling_id = c.id
       WHERE cc.id = $1`,
      [id]
    );

    if (callingChange.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Calling change not found' });
    }

    // Get the consideration marked for prayer
    const consideration = await client.query(
      `SELECT * FROM calling_considerations
       WHERE calling_change_id = $1 AND is_selected_for_prayer = true`,
      [id]
    );

    if (consideration.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No person selected for prayer' });
    }

    const selectedMemberId = consideration.rows[0].member_id;
    const currentMemberId = callingChange.rows[0].current_member_id;
    const assignedTo = callingChange.rows[0].assigned_to_bishopric_member;

    // Update the calling change with the new member and status
    await client.query(
      `UPDATE calling_changes SET new_member_id = $1, status = 'approved' WHERE id = $2`,
      [selectedMemberId, id]
    );

    // Create tasks based on whether there's a current member
    const tasksToCreate = [];

    if (currentMemberId) {
      // If there's someone currently in the calling, we need to release them
      tasksToCreate.push({
        type: 'release_current',
        member_id: currentMemberId,
        description: 'Release current member',
      });
      tasksToCreate.push({
        type: 'extend_calling',
        member_id: selectedMemberId,
        description: 'Extend calling to new member',
      });
      tasksToCreate.push({
        type: 'sustain_new',
        member_id: selectedMemberId,
        description: 'Sustain new member',
      });
      tasksToCreate.push({
        type: 'release_sustained',
        member_id: currentMemberId,
        description: 'Release and sustain current member',
      });
    } else {
      // If calling is vacant, no need to release anyone
      tasksToCreate.push({
        type: 'extend_calling',
        member_id: selectedMemberId,
        description: 'Extend calling to new member',
      });
      tasksToCreate.push({
        type: 'sustain_new',
        member_id: selectedMemberId,
        description: 'Sustain new member',
      });
    }

    // Always add set apart and record tasks
    tasksToCreate.push({
      type: 'set_apart',
      member_id: selectedMemberId,
      description: 'Set apart new member',
    });
    tasksToCreate.push({
      type: 'record_in_tools',
      member_id: selectedMemberId,
      description: 'Record calling change in LCR',
    });

    // Insert all tasks
    for (const task of tasksToCreate) {
      await client.query(
        `INSERT INTO tasks (calling_change_id, task_type, member_id, assigned_to, status)
         VALUES ($1, $2, $3, $4, 'pending')`,
        [id, task.type, task.member_id, assignedTo]
      );
    }

    await client.query('COMMIT');

    // Fetch and return the updated calling change with tasks
    const updatedChange = await pool.query(
      `SELECT
        cc.*,
        c.title as calling_title,
        o.name as organization_name,
        cm.id as current_member_id,
        cm.first_name as current_first_name,
        cm.last_name as current_last_name,
        nm.id as new_member_id,
        nm.first_name as new_first_name,
        nm.last_name as new_last_name
      FROM calling_changes cc
      LEFT JOIN callings c ON cc.calling_id = c.id
      LEFT JOIN organizations o ON c.organization_id = o.id
      LEFT JOIN members cm ON cc.current_member_id = cm.id
      LEFT JOIN members nm ON cc.new_member_id = nm.id
      WHERE cc.id = $1`,
      [id]
    );

    const tasks = await pool.query(
      `SELECT t.*, m.first_name, m.last_name
       FROM tasks t
       LEFT JOIN members m ON t.member_id = m.id
       WHERE t.calling_change_id = $1
       ORDER BY t.created_at`,
      [id]
    );

    res.json({
      ...updatedChange.rows[0],
      tasks: tasks.rows,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error approving selection:', error);
    res.status(500).json({ error: 'Failed to approve selection' });
  } finally {
    client.release();
  }
});

// Finalize calling change - update actual calling assignments
router.post('/:id/finalize', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;

    // Get the calling change details
    const callingChange = await client.query(
      `SELECT * FROM calling_changes WHERE id = $1`,
      [id]
    );

    if (callingChange.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Calling change not found' });
    }

    const change = callingChange.rows[0];

    // Check if there's a new member selected
    if (!change.new_member_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No new member selected for this calling' });
    }

    // Check if all tasks are completed
    const incompleteTasks = await client.query(
      `SELECT COUNT(*) as count FROM tasks
       WHERE calling_change_id = $1 AND status = 'pending'`,
      [id]
    );

    if (parseInt(incompleteTasks.rows[0].count) > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'All tasks must be completed before finalizing the calling change',
      });
    }

    // Release the current member if there is one
    if (change.current_member_id) {
      await client.query(
        `UPDATE calling_assignments
         SET is_active = false, released_date = CURRENT_DATE
         WHERE calling_id = $1 AND member_id = $2 AND is_active = true`,
        [change.calling_id, change.current_member_id]
      );
    }

    // Create new calling assignment
    await client.query(
      `INSERT INTO calling_assignments (
        calling_id, member_id, is_active, assigned_date
      ) VALUES ($1, $2, true, CURRENT_DATE)`,
      [change.calling_id, change.new_member_id]
    );

    // Mark calling change as completed
    await client.query(
      `UPDATE calling_changes
       SET status = 'completed', completed_date = CURRENT_DATE
       WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');

    // Fetch and return updated calling change
    const updated = await pool.query(
      `SELECT
        cc.*,
        c.title as calling_title,
        o.name as organization_name,
        cm.id as current_member_id,
        cm.first_name as current_first_name,
        cm.last_name as current_last_name,
        nm.id as new_member_id,
        nm.first_name as new_first_name,
        nm.last_name as new_last_name
      FROM calling_changes cc
      LEFT JOIN callings c ON cc.calling_id = c.id
      LEFT JOIN organizations o ON c.organization_id = o.id
      LEFT JOIN members cm ON cc.current_member_id = cm.id
      LEFT JOIN members nm ON cc.new_member_id = nm.id
      WHERE cc.id = $1`,
      [id]
    );

    res.json(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error finalizing calling change:', error);
    res.status(500).json({ error: 'Failed to finalize calling change' });
  } finally {
    client.release();
  }
});

export default router;
