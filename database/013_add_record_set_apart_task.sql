-- Migration 013: Add record_set_apart task type
-- This task is for recording the set apart date in LCR after someone is set apart

-- Add 'record_set_apart' to task_type enum
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'record_set_apart'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'task_type')
    ) THEN
        ALTER TYPE task_type ADD VALUE 'record_set_apart';
    END IF;
END$$;
