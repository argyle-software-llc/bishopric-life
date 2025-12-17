-- Add expected release tracking to calling_assignments
-- This allows tracking when a calling is expected to be released (e.g., term limits, moving, etc.)

ALTER TABLE calling_assignments
  ADD COLUMN IF NOT EXISTS expected_release_date date,
  ADD COLUMN IF NOT EXISTS release_notes text;

COMMENT ON COLUMN calling_assignments.expected_release_date IS 'Expected date this calling will be released (for term limits, moves, etc.)';
COMMENT ON COLUMN calling_assignments.release_notes IS 'Notes about why/when this calling will be released (e.g., "12-month term ending", "Moving to Utah")';
