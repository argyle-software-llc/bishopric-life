-- Add released_date column to calling_assignments table
-- This tracks when a member was released from a calling

ALTER TABLE calling_assignments ADD COLUMN IF NOT EXISTS released_date date;
