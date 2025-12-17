-- Merge Aubrey Thompson duplicates
-- Keep the LCR record (with church_id) and merge the manually created one into it

BEGIN;

-- IDs for reference
-- Manually created (to be deleted): c55555e3-7186-4cc6-9096-2eb41882288c
-- LCR official (to keep): 40884bad-b36c-42ec-81d1-f29379cb5f4d

-- First, update any calling_assignments from the duplicate to point to the official record
UPDATE calling_assignments
SET member_id = '40884bad-b36c-42ec-81d1-f29379cb5f4d'
WHERE member_id = 'c55555e3-7186-4cc6-9096-2eb41882288c';

-- Now we'll have duplicate calling assignments. Let's find and deactivate duplicates,
-- keeping the one with the earliest assigned_date or the one with more data
WITH ranked_assignments AS (
  SELECT
    id,
    calling_id,
    member_id,
    assigned_date,
    sustained_date,
    set_apart_date,
    ROW_NUMBER() OVER (
      PARTITION BY calling_id, member_id
      ORDER BY
        COALESCE(assigned_date, '2999-12-31') ASC,
        COALESCE(sustained_date, '2999-12-31') DESC,
        COALESCE(set_apart_date, '2999-12-31') DESC
    ) as rn
  FROM calling_assignments
  WHERE member_id = '40884bad-b36c-42ec-81d1-f29379cb5f4d'
    AND is_active = true
)
UPDATE calling_assignments ca
SET is_active = false
FROM ranked_assignments ra
WHERE ca.id = ra.id
  AND ra.rn > 1;

-- Update any calling_changes references
UPDATE calling_changes
SET current_member_id = '40884bad-b36c-42ec-81d1-f29379cb5f4d'
WHERE current_member_id = 'c55555e3-7186-4cc6-9096-2eb41882288c';

UPDATE calling_changes
SET new_member_id = '40884bad-b36c-42ec-81d1-f29379cb5f4d'
WHERE new_member_id = 'c55555e3-7186-4cc6-9096-2eb41882288c';

-- Update any calling_considerations references
UPDATE calling_considerations
SET member_id = '40884bad-b36c-42ec-81d1-f29379cb5f4d'
WHERE member_id = 'c55555e3-7186-4cc6-9096-2eb41882288c';

-- Update any tasks references
UPDATE tasks
SET member_id = '40884bad-b36c-42ec-81d1-f29379cb5f4d'
WHERE member_id = 'c55555e3-7186-4cc6-9096-2eb41882288c';

-- Update any member_calling_needs references
UPDATE member_calling_needs
SET member_id = '40884bad-b36c-42ec-81d1-f29379cb5f4d'
WHERE member_id = 'c55555e3-7186-4cc6-9096-2eb41882288c';

-- Finally, delete the duplicate member record
DELETE FROM members
WHERE id = 'c55555e3-7186-4cc6-9096-2eb41882288c';

-- Verify the result
SELECT
  m.id,
  m.church_id,
  m.first_name,
  m.last_name,
  c.title as calling,
  o.name as organization,
  ca.assigned_date,
  ca.is_active
FROM members m
LEFT JOIN calling_assignments ca ON m.id = ca.member_id
LEFT JOIN callings c ON ca.calling_id = c.id
LEFT JOIN organizations o ON c.organization_id = o.id
WHERE m.last_name ILIKE '%thompson%' AND m.first_name ILIKE '%aubrey%'
ORDER BY ca.is_active DESC, ca.assigned_date;

COMMIT;
