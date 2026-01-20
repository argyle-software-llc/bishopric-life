-- Migration: Add in-flight calling support
-- This enables detection and tracking of calling changes that happened in MemberTools
-- but weren't initiated through our app (e.g., sustaining/setting apart done externally)

-- ============================================================================
-- STEP 1: Add 'in_flight' status to calling_change_status enum
-- ============================================================================

-- Note: PostgreSQL doesn't support IF NOT EXISTS for ADD VALUE, so we check first
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'in_flight'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'calling_change_status')
    ) THEN
        ALTER TYPE calling_change_status ADD VALUE 'in_flight';
    END IF;
END$$;

-- ============================================================================
-- STEP 2: Add source tracking columns to calling_changes
-- ============================================================================

-- Track where the calling change originated
ALTER TABLE calling_changes
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'user_initiated'
    CHECK (source IN ('user_initiated', 'auto_detected'));

-- Track when an in-flight calling was detected
ALTER TABLE calling_changes
  ADD COLUMN IF NOT EXISTS detected_at TIMESTAMP;

-- ============================================================================
-- STEP 3: Create pre-sync snapshot table for comparison
-- ============================================================================

-- This table stores the state of calling assignments BEFORE a sync
-- so we can compare and detect what changed externally
CREATE TABLE IF NOT EXISTS pre_sync_calling_snapshot (
  id SERIAL PRIMARY KEY,
  calling_org_name VARCHAR(255) NOT NULL,
  calling_title VARCHAR(255) NOT NULL,
  member_church_id BIGINT NOT NULL,
  member_first_name VARCHAR(255),
  member_last_name VARCHAR(255),
  sustained_date DATE,
  set_apart_date DATE,
  is_active BOOLEAN,
  snapshot_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient comparison queries
CREATE INDEX IF NOT EXISTS idx_pre_sync_snapshot_lookup
  ON pre_sync_calling_snapshot (calling_org_name, calling_title, member_church_id);

-- ============================================================================
-- STEP 4: Update default values for existing records
-- ============================================================================

-- Set source to 'user_initiated' for all existing calling_changes
UPDATE calling_changes
SET source = 'user_initiated'
WHERE source IS NULL;
