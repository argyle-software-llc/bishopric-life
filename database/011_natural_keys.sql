-- Migration: Add natural keys to app tables for stable references across syncs
-- This allows synced tables (members, callings, organizations) to be hard-refreshed
-- without breaking app data (calling_changes, tasks, etc.)

-- ============================================================================
-- STEP 1: Add natural key columns to app tables
-- ============================================================================

-- calling_changes: references callings and members
ALTER TABLE calling_changes
  ADD COLUMN IF NOT EXISTS calling_org_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS calling_title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS new_member_church_id BIGINT,
  ADD COLUMN IF NOT EXISTS current_member_church_id BIGINT;

-- calling_considerations: references members
ALTER TABLE calling_considerations
  ADD COLUMN IF NOT EXISTS member_church_id BIGINT;

-- tasks: references members
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS member_church_id BIGINT;

-- member_calling_needs: references members
ALTER TABLE member_calling_needs
  ADD COLUMN IF NOT EXISTS member_church_id BIGINT;

-- bishopric_stewardships: references organizations
ALTER TABLE bishopric_stewardships
  ADD COLUMN IF NOT EXISTS organization_name VARCHAR(255);

-- notes: uses entity_type/entity_id pattern - add natural key columns
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS member_church_id BIGINT,
  ADD COLUMN IF NOT EXISTS calling_org_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS calling_title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS organization_name VARCHAR(255);

-- ============================================================================
-- STEP 2: Populate natural keys from existing data
-- ============================================================================

-- calling_changes: populate from joined data
UPDATE calling_changes cc SET
  calling_org_name = o.name,
  calling_title = c.title
FROM callings c
JOIN organizations o ON c.organization_id = o.id
WHERE cc.calling_id = c.id
  AND cc.calling_org_name IS NULL;

UPDATE calling_changes cc SET
  new_member_church_id = m.church_id
FROM members m
WHERE cc.new_member_id = m.id
  AND cc.new_member_church_id IS NULL;

UPDATE calling_changes cc SET
  current_member_church_id = m.church_id
FROM members m
WHERE cc.current_member_id = m.id
  AND cc.current_member_church_id IS NULL;

-- calling_considerations: populate from joined data
UPDATE calling_considerations cc SET
  member_church_id = m.church_id
FROM members m
WHERE cc.member_id = m.id
  AND cc.member_church_id IS NULL;

-- tasks: populate from joined data
UPDATE tasks t SET
  member_church_id = m.church_id
FROM members m
WHERE t.member_id = m.id
  AND t.member_church_id IS NULL;

-- member_calling_needs: populate from joined data
UPDATE member_calling_needs mcn SET
  member_church_id = m.church_id
FROM members m
WHERE mcn.member_id = m.id
  AND mcn.member_church_id IS NULL;

-- bishopric_stewardships: populate from joined data
UPDATE bishopric_stewardships bs SET
  organization_name = o.name
FROM organizations o
WHERE bs.organization_id = o.id
  AND bs.organization_name IS NULL;

-- notes: populate based on entity_type
UPDATE notes n SET
  member_church_id = m.church_id
FROM members m
WHERE n.entity_type = 'member'
  AND n.entity_id = m.id
  AND n.member_church_id IS NULL;

UPDATE notes n SET
  calling_org_name = o.name,
  calling_title = c.title
FROM callings c
JOIN organizations o ON c.organization_id = o.id
WHERE n.entity_type = 'calling'
  AND n.entity_id = c.id
  AND n.calling_org_name IS NULL;

UPDATE notes n SET
  organization_name = o.name
FROM organizations o
WHERE n.entity_type = 'organization'
  AND n.entity_id = o.id
  AND n.organization_name IS NULL;

-- ============================================================================
-- STEP 3: Make foreign keys nullable (for ON DELETE SET NULL behavior)
-- ============================================================================

-- Drop existing foreign key constraints and recreate with ON DELETE SET NULL
ALTER TABLE calling_changes
  DROP CONSTRAINT IF EXISTS calling_changes_calling_id_fkey,
  DROP CONSTRAINT IF EXISTS calling_changes_new_member_id_fkey,
  DROP CONSTRAINT IF EXISTS calling_changes_current_member_id_fkey;

ALTER TABLE calling_changes
  ADD CONSTRAINT calling_changes_calling_id_fkey
    FOREIGN KEY (calling_id) REFERENCES callings(id) ON DELETE SET NULL,
  ADD CONSTRAINT calling_changes_new_member_id_fkey
    FOREIGN KEY (new_member_id) REFERENCES members(id) ON DELETE SET NULL,
  ADD CONSTRAINT calling_changes_current_member_id_fkey
    FOREIGN KEY (current_member_id) REFERENCES members(id) ON DELETE SET NULL;

ALTER TABLE calling_considerations
  DROP CONSTRAINT IF EXISTS calling_considerations_member_id_fkey;

ALTER TABLE calling_considerations
  ADD CONSTRAINT calling_considerations_member_id_fkey
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;

ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_member_id_fkey;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_member_id_fkey
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;

ALTER TABLE member_calling_needs
  DROP CONSTRAINT IF EXISTS member_calling_needs_member_id_fkey;

ALTER TABLE member_calling_needs
  ADD CONSTRAINT member_calling_needs_member_id_fkey
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;

ALTER TABLE bishopric_stewardships
  DROP CONSTRAINT IF EXISTS bishopric_stewardships_organization_id_fkey;

ALTER TABLE bishopric_stewardships
  ADD CONSTRAINT bishopric_stewardships_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;

-- ============================================================================
-- STEP 4: Add unique constraints to synced tables to prevent duplicates
-- ============================================================================

-- Organizations: unique by name
-- First, clean up any duplicates
DELETE FROM organizations o1
USING organizations o2
WHERE o1.id > o2.id AND o1.name = o2.name;

-- Add unique constraint
ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_name_unique;
ALTER TABLE organizations
  ADD CONSTRAINT organizations_name_unique UNIQUE (name);

-- Callings: unique by organization + title
-- First, need to consolidate duplicates (move assignments, then delete)
-- This is complex, so we'll do it in a separate step

-- Members: unique by church_id (where not null)
CREATE UNIQUE INDEX IF NOT EXISTS members_church_id_unique
  ON members (church_id) WHERE church_id IS NOT NULL;

-- ============================================================================
-- STEP 5: Create function to re-link cached IDs after sync
-- ============================================================================

CREATE OR REPLACE FUNCTION relink_cached_ids() RETURNS void AS $$
BEGIN
  -- Re-link calling_changes
  UPDATE calling_changes cc SET
    calling_id = c.id
  FROM callings c
  JOIN organizations o ON c.organization_id = o.id
  WHERE o.name = cc.calling_org_name
    AND c.title = cc.calling_title
    AND cc.calling_id IS NULL;

  UPDATE calling_changes cc SET
    new_member_id = m.id
  FROM members m
  WHERE m.church_id = cc.new_member_church_id
    AND cc.new_member_id IS NULL;

  UPDATE calling_changes cc SET
    current_member_id = m.id
  FROM members m
  WHERE m.church_id = cc.current_member_church_id
    AND cc.current_member_id IS NULL;

  -- Re-link calling_considerations
  UPDATE calling_considerations cc SET
    member_id = m.id
  FROM members m
  WHERE m.church_id = cc.member_church_id
    AND cc.member_id IS NULL;

  -- Re-link tasks
  UPDATE tasks t SET
    member_id = m.id
  FROM members m
  WHERE m.church_id = t.member_church_id
    AND t.member_id IS NULL;

  -- Re-link member_calling_needs
  UPDATE member_calling_needs mcn SET
    member_id = m.id
  FROM members m
  WHERE m.church_id = mcn.member_church_id
    AND mcn.member_id IS NULL;

  -- Re-link bishopric_stewardships
  UPDATE bishopric_stewardships bs SET
    organization_id = o.id
  FROM organizations o
  WHERE o.name = bs.organization_name
    AND bs.organization_id IS NULL;

  -- Re-link notes
  UPDATE notes n SET
    entity_id = m.id
  FROM members m
  WHERE n.entity_type = 'member'
    AND m.church_id = n.member_church_id
    AND n.entity_id IS NULL;

  UPDATE notes n SET
    entity_id = c.id
  FROM callings c
  JOIN organizations o ON c.organization_id = o.id
  WHERE n.entity_type = 'calling'
    AND o.name = n.calling_org_name
    AND c.title = n.calling_title
    AND n.entity_id IS NULL;

  UPDATE notes n SET
    entity_id = o.id
  FROM organizations o
  WHERE n.entity_type = 'organization'
    AND o.name = n.organization_name
    AND n.entity_id IS NULL;
END;
$$ LANGUAGE plpgsql;
