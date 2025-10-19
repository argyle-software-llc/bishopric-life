import express from 'express';
import pool from '../db/connection';
import { Member } from '../types';

const router = express.Router();

// Get all members
router.get('/', async (req, res) => {
  try {
    const membersResult = await pool.query(
      `SELECT m.*, h.household_name, h.address
       FROM members m
       LEFT JOIN households h ON m.household_id = h.id
       ORDER BY m.last_name, m.first_name`
    );

    // Get callings for each member
    const membersWithCallings = await Promise.all(
      membersResult.rows.map(async (member) => {
        const callingsResult = await pool.query(
          `SELECT c.id, c.title, o.name as organization_name,
                  ca.assigned_date, ca.sustained_date
           FROM calling_assignments ca
           JOIN callings c ON ca.calling_id = c.id
           LEFT JOIN organizations o ON c.organization_id = o.id
           WHERE ca.member_id = $1 AND ca.is_active = true
           ORDER BY ca.assigned_date DESC`,
          [member.id]
        );
        return {
          ...member,
          callings: callingsResult.rows,
        };
      })
    );

    res.json(membersWithCallings);
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// Get member by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT m.*, h.household_name, h.address
       FROM members m
       LEFT JOIN households h ON m.household_id = h.id
       WHERE m.id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching member:', error);
    res.status(500).json({ error: 'Failed to fetch member' });
  }
});

// Get members without callings
router.get('/needs/callings', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, mcn.status, mcn.potential_callings, mcn.notes
       FROM members m
       LEFT JOIN member_calling_needs mcn ON m.id = mcn.member_id
       WHERE m.is_active = true
       ORDER BY mcn.status, m.last_name, m.first_name`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching members needing callings:', error);
    res.status(500).json({ error: 'Failed to fetch members needing callings' });
  }
});

// Create a new member
router.post('/', async (req, res) => {
  try {
    const member: Partial<Member> = req.body;
    const result = await pool.query(
      `INSERT INTO members (
        church_id, first_name, last_name, preferred_name, photo_url,
        household_id, phone, email, age, gender, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        member.church_id,
        member.first_name,
        member.last_name,
        member.preferred_name,
        member.photo_url,
        member.household_id,
        member.phone,
        member.email,
        member.age,
        member.gender,
        member.is_active ?? true,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating member:', error);
    res.status(500).json({ error: 'Failed to create member' });
  }
});

// Update a member
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const member: Partial<Member> = req.body;
    const result = await pool.query(
      `UPDATE members SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        preferred_name = COALESCE($3, preferred_name),
        photo_url = COALESCE($4, photo_url),
        phone = COALESCE($5, phone),
        email = COALESCE($6, email),
        age = COALESCE($7, age),
        is_active = COALESCE($8, is_active)
      WHERE id = $9
      RETURNING *`,
      [
        member.first_name,
        member.last_name,
        member.preferred_name,
        member.photo_url,
        member.phone,
        member.email,
        member.age,
        member.is_active,
        id,
      ]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating member:', error);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

export default router;
