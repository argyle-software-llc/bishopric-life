import express from 'express';
import pool from '../db/connection';
import { Task } from '../types';

const router = express.Router();

// Get bishopric members for task assignment
router.get('/bishopric', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (m.first_name, m.last_name)
         m.first_name,
         m.last_name,
         c.title,
         CASE
           WHEN c.title ILIKE '%bishop' AND c.title NOT ILIKE '%counselor%' THEN 1
           WHEN c.title ILIKE '%first counselor%' THEN 2
           WHEN c.title ILIKE '%second counselor%' THEN 3
           ELSE 4
         END as sort_order
       FROM members m
       JOIN calling_assignments ca ON m.id = ca.member_id
       JOIN callings c ON ca.calling_id = c.id
       WHERE ca.is_active = true
         AND c.title ILIKE '%bishop%'
       ORDER BY m.first_name, m.last_name, sort_order, m.last_name`
    );

    // Add additional assignees (temporary until proper role management)
    const additionalAssignees = [
      { first_name: 'Brad', last_name: 'Chase', title: 'Ward Clerk', sort_order: 5 },
      { first_name: 'Jarom', last_name: 'Brown', title: 'Executive Secretary', sort_order: 6 },
      { first_name: 'Brian', last_name: 'Scott', title: 'Assistant Executive Secretary', sort_order: 7 },
    ];

    const allMembers = [...result.rows, ...additionalAssignees];
    res.json(allMembers);
  } catch (error) {
    console.error('Error fetching bishopric members:', error);
    res.status(500).json({ error: 'Failed to fetch bishopric members' });
  }
});

// Get all tasks
router.get('/', async (req, res) => {
  try {
    const { status, assigned_to } = req.query;
    let query = `
      SELECT
        t.*,
        m.first_name,
        m.last_name,
        cc.calling_id,
        c.title as calling_title
      FROM tasks t
      LEFT JOIN members m ON t.member_id = m.id
      LEFT JOIN calling_changes cc ON t.calling_change_id = cc.id
      LEFT JOIN callings c ON cc.calling_id = c.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND t.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (assigned_to) {
      query += ` AND t.assigned_to = $${paramIndex}`;
      params.push(assigned_to);
      paramIndex++;
    }

    query += ' ORDER BY t.due_date NULLS LAST, t.created_at';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Create a task
router.post('/', async (req, res) => {
  try {
    const task: Partial<Task> = req.body;

    // Look up church_id for the member if provided
    let memberChurchId: number | null = null;
    if (task.member_id) {
      const memberResult = await pool.query(
        'SELECT church_id FROM members WHERE id = $1',
        [task.member_id]
      );
      if (memberResult.rows.length > 0) {
        memberChurchId = memberResult.rows[0].church_id;
      }
    }

    const result = await pool.query(
      `INSERT INTO tasks (
        calling_change_id, task_type, member_id, member_church_id, assigned_to, status, due_date, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        task.calling_change_id,
        task.task_type,
        task.member_id,
        memberChurchId,
        task.assigned_to,
        task.status ?? 'pending',
        task.due_date,
        task.notes,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update a task
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const task: Partial<Task> = req.body;
    const result = await pool.query(
      `UPDATE tasks SET
        status = COALESCE($1::task_status, status),
        completed_date = COALESCE($2, completed_date),
        assigned_to = COALESCE($3, assigned_to),
        due_date = COALESCE($4, due_date),
        notes = COALESCE($5, notes)
      WHERE id = $6
      RETURNING *`,
      [task.status, task.completed_date, task.assigned_to, task.due_date, task.notes, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Mark task as completed
router.post('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE tasks SET
        status = 'completed',
        completed_date = CURRENT_DATE
      WHERE id = $1
      RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error completing task:', error);
    res.status(500).json({ error: 'Failed to complete task' });
  }
});

// Toggle task completion status
router.post('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;

    // Get current status
    const current = await pool.query('SELECT status FROM tasks WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const newStatus = current.rows[0].status === 'completed' ? 'pending' : 'completed';
    const result = await pool.query(
      `UPDATE tasks SET
        status = $1::task_status,
        completed_date = CASE WHEN $1::task_status = 'completed' THEN CURRENT_DATE ELSE NULL END
      WHERE id = $2
      RETURNING *`,
      [newStatus, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error toggling task:', error);
    res.status(500).json({ error: 'Failed to toggle task' });
  }
});

export default router;
