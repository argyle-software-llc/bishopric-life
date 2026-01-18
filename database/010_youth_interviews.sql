-- Youth interviews tracking table
-- Tracks which youth need Bishop Youth Interviews (BYI) or Bishopric Counselor Youth Interviews (BCYI)

CREATE TYPE interview_type AS ENUM ('BYI', 'BCYI');

CREATE TABLE youth_interviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    interview_type interview_type NOT NULL,
    -- The specific interview category from the API (e.g., BISHOP_YOUTH_INTERVIEW, COUNSELOR_YOUTH_INTERVIEW)
    api_interview_type VARCHAR(100),
    -- Whether this interview is currently due/needed
    is_due BOOLEAN DEFAULT true,
    -- Optional: last completed interview date (if we get this data)
    last_interview_date DATE,
    -- Optional: notes about this interview
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Prevent duplicate entries for same member/interview type
    UNIQUE(member_id, interview_type)
);

-- Index for quick lookups
CREATE INDEX idx_youth_interviews_member ON youth_interviews(member_id);
CREATE INDEX idx_youth_interviews_type ON youth_interviews(interview_type);
CREATE INDEX idx_youth_interviews_due ON youth_interviews(is_due) WHERE is_due = true;
