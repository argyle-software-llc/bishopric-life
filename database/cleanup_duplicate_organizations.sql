-- Clean up duplicate organizations by merging them
-- Keep the organization with the most callings for each name

BEGIN;

-- For each duplicate organization name, update all callings to point to the one we're keeping
WITH ranked_orgs AS (
  SELECT
    o.id,
    o.name,
    COUNT(c.id) as calling_count,
    ROW_NUMBER() OVER (PARTITION BY o.name ORDER BY COUNT(c.id) DESC, o.created_at ASC) as rn
  FROM organizations o
  LEFT JOIN callings c ON c.organization_id = o.id
  GROUP BY o.id, o.name, o.created_at
),
orgs_to_keep AS (
  SELECT id, name
  FROM ranked_orgs
  WHERE rn = 1
),
orgs_to_delete AS (
  SELECT id, name
  FROM ranked_orgs
  WHERE rn > 1
)
UPDATE callings
SET organization_id = (
  SELECT otk.id
  FROM orgs_to_delete otd
  JOIN orgs_to_keep otk ON otd.name = otk.name
  WHERE otd.id = callings.organization_id
)
WHERE organization_id IN (SELECT id FROM orgs_to_delete);

-- Delete duplicate organizations
WITH ranked_orgs AS (
  SELECT
    o.id,
    o.name,
    COUNT(c.id) as calling_count,
    ROW_NUMBER() OVER (PARTITION BY o.name ORDER BY COUNT(c.id) DESC, o.created_at ASC) as rn
  FROM organizations o
  LEFT JOIN callings c ON c.organization_id = o.id
  GROUP BY o.id, o.name, o.created_at
)
DELETE FROM organizations
WHERE id IN (
  SELECT id
  FROM ranked_orgs
  WHERE rn > 1
);

-- Show summary of cleanup
SELECT
  'Organizations cleaned up' as status,
  (SELECT COUNT(DISTINCT name) FROM organizations) as unique_org_names,
  (SELECT COUNT(*) FROM organizations) as total_org_records;

COMMIT;
