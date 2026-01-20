-- Migration 014: Add release data columns to pre_sync_calling_snapshot
-- These columns preserve user-entered expected_release_date and release_notes across syncs

ALTER TABLE pre_sync_calling_snapshot
    ADD COLUMN IF NOT EXISTS expected_release_date DATE,
    ADD COLUMN IF NOT EXISTS release_notes TEXT;
