-- Cleanup duplicate calling assignments
-- Keep the most specific/complete record for each member+calling combination

BEGIN;

-- Create a temporary table to identify which records to keep
WITH ranked_assignments AS (
  SELECT
    ca.id,
    ca.member_id,
    c.title,
    ca.calling_id,
    o.name as org_name,
    ca.assigned_date,
    ca.sustained_date,
    ca.set_apart_date,
    -- Ranking criteria:
    -- 1. Prefer records with assigned_date over null
    -- 2. Prefer records with sustained_date over null
    -- 3. Prefer records with set_apart_date over null
    -- 4. Prefer earlier assigned_date
    -- 5. For same calling title, prefer child org over parent org (avoid "Other Callings", "Aaronic Priesthood Quorums", etc.)
    ROW_NUMBER() OVER (
      PARTITION BY ca.member_id, c.title
      ORDER BY
        -- Deprioritize generic organization names
        CASE
          WHEN o.name IN ('Other Callings', 'Aaronic Priesthood Quorums', 'Young Women',
                          'Relief Society', 'Primary', 'Activities', 'Music',
                          'Elders Quorum', 'Sunday School') THEN 1
          ELSE 0
        END,
        -- Prefer records with dates
        CASE WHEN ca.assigned_date IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN ca.sustained_date IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN ca.set_apart_date IS NOT NULL THEN 0 ELSE 1 END,
        -- Prefer earlier dates
        COALESCE(ca.assigned_date, '2999-12-31') ASC,
        -- Use ID as final tiebreaker for deterministic results
        ca.id
    ) as rank
  FROM calling_assignments ca
  JOIN callings c ON ca.calling_id = c.id
  LEFT JOIN organizations o ON c.organization_id = o.id
  WHERE ca.is_active = true
)
-- Deactivate duplicate assignments (keep only rank 1)
UPDATE calling_assignments
SET is_active = false
FROM ranked_assignments
WHERE calling_assignments.id = ranked_assignments.id
  AND ranked_assignments.rank > 1;

-- Show summary of what was deactivated
SELECT
  m.first_name || ' ' || m.last_name as member_name,
  c.title as calling,
  COUNT(*) as duplicates_removed
FROM calling_assignments ca
JOIN members m ON ca.member_id = m.id
JOIN callings c ON ca.calling_id = c.id
WHERE ca.is_active = false
  AND ca.updated_at > NOW() - INTERVAL '1 minute'
GROUP BY m.id, m.first_name, m.last_name, c.title
HAVING COUNT(*) > 0
ORDER BY duplicates_removed DESC, member_name;

COMMIT;
