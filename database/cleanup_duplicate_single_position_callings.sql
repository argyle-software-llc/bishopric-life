-- Clean up duplicate callings that should only have one position
-- These are positions like Bishop, First Counselor, etc. where there should only be ONE calling record
-- We keep callings with active assignments, or if none are active, we keep the oldest one
-- We merge any assignments and calling changes to the calling we're keeping

BEGIN;

-- First, identify which callings to keep and which to delete
WITH single_position_patterns AS (
  SELECT unnest(ARRAY[
    '%Bishop%',
    '%First Counselor%',
    '%Second Counselor%',
    '%President%',
    '%First Assistant%',
    '%Second Assistant%',
    '%Secretary%',
    '%Clerk%',
    '%Organist%',
    '%Chorister%',
    '%Music Director%'
  ]) as pattern
),
duplicate_callings AS (
  SELECT
    c.id,
    c.title,
    c.organization_id,
    o.name as org_name,
    EXISTS(
      SELECT 1 FROM calling_assignments ca
      WHERE ca.calling_id = c.id AND ca.is_active = true
    ) as has_active_assignment,
    ROW_NUMBER() OVER (
      PARTITION BY c.title, c.organization_id
      ORDER BY
        CASE WHEN EXISTS(
          SELECT 1 FROM calling_assignments ca
          WHERE ca.calling_id = c.id AND ca.is_active = true
        ) THEN 0 ELSE 1 END,  -- Active assignments first
        c.created_at ASC  -- Then oldest calling
    ) as rn
  FROM callings c
  LEFT JOIN organizations o ON c.organization_id = o.id
  WHERE EXISTS (
    SELECT 1
    FROM single_position_patterns spp
    WHERE c.title ILIKE spp.pattern
  )
),
callings_by_title_org AS (
  SELECT title, organization_id, COUNT(*) as count
  FROM callings
  GROUP BY title, organization_id
  HAVING COUNT(*) > 1
),
callings_to_keep AS (
  SELECT dc.id, dc.title, dc.organization_id
  FROM duplicate_callings dc
  JOIN callings_by_title_org cbto ON
    dc.title = cbto.title AND
    dc.organization_id = cbto.organization_id
  WHERE dc.rn = 1
),
callings_to_delete AS (
  SELECT dc.id, dc.title, dc.organization_id
  FROM duplicate_callings dc
  JOIN callings_by_title_org cbto ON
    dc.title = cbto.title AND
    dc.organization_id = cbto.organization_id
  WHERE dc.rn > 1
)
-- Update calling_assignments to point to the calling we're keeping
UPDATE calling_assignments
SET calling_id = (
  SELECT ctk.id
  FROM callings_to_delete ctd
  JOIN callings_to_keep ctk ON ctd.title = ctk.title AND ctd.organization_id = ctk.organization_id
  WHERE ctd.id = calling_assignments.calling_id
)
WHERE calling_id IN (SELECT id FROM callings_to_delete);

-- Update calling_changes to point to the calling we're keeping
WITH single_position_patterns AS (
  SELECT unnest(ARRAY[
    '%Bishop%',
    '%First Counselor%',
    '%Second Counselor%',
    '%President%',
    '%First Assistant%',
    '%Second Assistant%',
    '%Secretary%',
    '%Clerk%',
    '%Organist%',
    '%Chorister%',
    '%Music Director%'
  ]) as pattern
),
duplicate_callings AS (
  SELECT
    c.id,
    c.title,
    c.organization_id,
    ROW_NUMBER() OVER (
      PARTITION BY c.title, c.organization_id
      ORDER BY
        CASE WHEN EXISTS(
          SELECT 1 FROM calling_assignments ca
          WHERE ca.calling_id = c.id AND ca.is_active = true
        ) THEN 0 ELSE 1 END,  -- Active assignments first
        c.created_at ASC  -- Then oldest calling
    ) as rn
  FROM callings c
  WHERE EXISTS (
    SELECT 1
    FROM single_position_patterns spp
    WHERE c.title ILIKE spp.pattern
  )
),
callings_by_title_org AS (
  SELECT title, organization_id, COUNT(*) as count
  FROM callings
  GROUP BY title, organization_id
  HAVING COUNT(*) > 1
),
callings_to_keep AS (
  SELECT dc.id, dc.title, dc.organization_id
  FROM duplicate_callings dc
  JOIN callings_by_title_org cbto ON
    dc.title = cbto.title AND
    dc.organization_id = cbto.organization_id
  WHERE dc.rn = 1
),
callings_to_delete AS (
  SELECT dc.id, dc.title, dc.organization_id
  FROM duplicate_callings dc
  JOIN callings_by_title_org cbto ON
    dc.title = cbto.title AND
    dc.organization_id = cbto.organization_id
  WHERE dc.rn > 1
)
UPDATE calling_changes
SET calling_id = (
  SELECT ctk.id
  FROM callings_to_delete ctd
  JOIN callings_to_keep ctk ON ctd.title = ctk.title AND ctd.organization_id = ctk.organization_id
  WHERE ctd.id = calling_changes.calling_id
)
WHERE calling_id IN (SELECT id FROM callings_to_delete);

-- Now delete the duplicate callings
WITH single_position_patterns AS (
  SELECT unnest(ARRAY[
    '%Bishop%',
    '%First Counselor%',
    '%Second Counselor%',
    '%President%',
    '%First Assistant%',
    '%Second Assistant%',
    '%Secretary%',
    '%Clerk%',
    '%Organist%',
    '%Chorister%',
    '%Music Director%'
  ]) as pattern
),
duplicate_callings AS (
  SELECT
    c.id,
    c.title,
    c.organization_id,
    ROW_NUMBER() OVER (
      PARTITION BY c.title, c.organization_id
      ORDER BY
        CASE WHEN EXISTS(
          SELECT 1 FROM calling_assignments ca
          WHERE ca.calling_id = c.id AND ca.is_active = true
        ) THEN 0 ELSE 1 END,  -- Active assignments first
        c.created_at ASC  -- Then oldest calling
    ) as rn
  FROM callings c
  WHERE EXISTS (
    SELECT 1
    FROM single_position_patterns spp
    WHERE c.title ILIKE spp.pattern
  )
),
callings_by_title_org AS (
  SELECT title, organization_id, COUNT(*) as count
  FROM callings
  GROUP BY title, organization_id
  HAVING COUNT(*) > 1
),
callings_to_delete AS (
  SELECT dc.id
  FROM duplicate_callings dc
  JOIN callings_by_title_org cbto ON
    dc.title = cbto.title AND
    dc.organization_id = cbto.organization_id
  WHERE dc.rn > 1
)
DELETE FROM callings
WHERE id IN (SELECT id FROM callings_to_delete);

-- Show summary
SELECT
  'Duplicate single-position callings cleaned up' as status,
  (SELECT COUNT(*) FROM callings) as total_callings_remaining;

COMMIT;
