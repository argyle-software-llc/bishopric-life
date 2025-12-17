-- Add availability column to members table
-- Availability is a number from 1-5 (1 being high availability, 5 being low)
-- Used for tracking member availability when considering them for callings

ALTER TABLE members ADD COLUMN IF NOT EXISTS availability integer CHECK (availability >= 1 AND availability <= 5);

COMMENT ON COLUMN members.availability IS 'Availability rating for member (1-5, where 1 is high availability, 5 is low)';
