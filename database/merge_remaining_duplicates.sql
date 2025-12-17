-- Merge remaining referenced members that lack church_id into their corresponding
-- members with church_id, based on phone/email/name heuristics.

BEGIN;

-- Build mapping into a temp table that we can reuse across statements
CREATE TEMP TABLE _mapping AS
WITH refs AS (
  SELECT DISTINCT member_id FROM calling_assignments
  UNION SELECT new_member_id FROM calling_changes WHERE new_member_id IS NOT NULL
  UNION SELECT current_member_id FROM calling_changes WHERE current_member_id IS NOT NULL
  UNION SELECT member_id FROM member_calling_needs
  UNION SELECT member_id FROM tasks
  UNION SELECT entity_id FROM notes WHERE entity_type='member'
  UNION SELECT member_id FROM calling_considerations
),
dupes AS (
  SELECT id, lower(first_name) fn, lower(last_name) ln,
         regexp_replace(coalesce(phone,''),'[^0-9]','','g') phone,
         CASE WHEN regexp_replace(coalesce(phone,''),'[^0-9]','','g') ~ '^1[0-9]{10}$'
              THEN substr(regexp_replace(coalesce(phone,''),'[^0-9]','','g'),2)
              ELSE regexp_replace(coalesce(phone,''),'[^0-9]','','g') END AS phone10,
         lower(coalesce(email,'')) email
  FROM members
  WHERE church_id IS NULL AND id IN (SELECT member_id FROM refs)
),
keepers AS (
  SELECT id, lower(first_name) fn, lower(last_name) ln,
         regexp_replace(coalesce(phone,''),'[^0-9]','','g') phone,
         CASE WHEN regexp_replace(coalesce(phone,''),'[^0-9]','','g') ~ '^1[0-9]{10}$'
              THEN substr(regexp_replace(coalesce(phone,''),'[^0-9]','','g'),2)
              ELSE regexp_replace(coalesce(phone,''),'[^0-9]','','g') END AS phone10,
         lower(coalesce(email,'')) email
  FROM members
  WHERE church_id IS NOT NULL
),
phone_match AS (
  SELECT d.id AS dupe_id, k.id AS keep_id, 'phone' AS method
  FROM dupes d JOIN keepers k ON k.phone10 <> '' AND k.phone10 = d.phone10
),
email_match AS (
  SELECT d.id AS dupe_id, k.id AS keep_id, 'email' AS method
  FROM dupes d JOIN keepers k ON k.email <> '' AND k.email = d.email
),
name_match AS (
  SELECT d.id AS dupe_id, k.id AS keep_id, 'name' AS method
  FROM dupes d JOIN keepers k ON k.ln = d.ln AND (
    k.fn = d.fn OR k.fn LIKE d.fn||' %' OR d.fn LIKE k.fn||' %' OR substr(k.fn,1,1) = substr(d.fn,1,1)
  )
),
all_matches AS (
  SELECT * FROM phone_match
  UNION ALL
  SELECT * FROM email_match
  UNION ALL
  SELECT * FROM name_match
),
mapping AS (
  SELECT dupe_id, keep_id, method,
         ROW_NUMBER() OVER (PARTITION BY dupe_id ORDER BY (CASE method WHEN 'phone' THEN 1 WHEN 'email' THEN 2 ELSE 3 END)) AS rn
  FROM all_matches
);

-- Update references
UPDATE calling_assignments ca
SET member_id = m.keep_id
FROM _mapping m
WHERE m.rn = 1 AND ca.member_id = m.dupe_id;

UPDATE calling_changes cc
SET new_member_id = m.keep_id
FROM _mapping m
WHERE m.rn = 1 AND cc.new_member_id = m.dupe_id;

UPDATE calling_changes cc
SET current_member_id = m.keep_id
FROM _mapping m
WHERE m.rn = 1 AND cc.current_member_id = m.dupe_id;

UPDATE member_calling_needs n
SET member_id = m.keep_id
FROM _mapping m
WHERE m.rn = 1 AND n.member_id = m.dupe_id;

UPDATE tasks t
SET member_id = m.keep_id
FROM _mapping m
WHERE m.rn = 1 AND t.member_id = m.dupe_id;

UPDATE calling_considerations c
SET member_id = m.keep_id
FROM _mapping m
WHERE m.rn = 1 AND c.member_id = m.dupe_id;

UPDATE notes n
SET entity_id = m.keep_id
FROM _mapping m
WHERE m.rn = 1 AND n.entity_type='member' AND n.entity_id = m.dupe_id;

-- Delete duplicates
DELETE FROM members x USING _mapping m WHERE m.rn = 1 AND x.id = m.dupe_id;

DROP TABLE _mapping;

COMMIT;
