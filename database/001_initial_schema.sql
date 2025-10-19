-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Households table
CREATE TABLE households (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_name VARCHAR(255) NOT NULL,
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Members table
CREATE TABLE members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    church_id BIGINT UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    preferred_name VARCHAR(100),
    photo_url VARCHAR(500),
    household_id UUID REFERENCES households(id),
    phone VARCHAR(20),
    email VARCHAR(255),
    age INT,
    gender VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Organizations table (hierarchical)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    parent_org_id UUID REFERENCES organizations(id),
    level INT DEFAULT 0,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Callings/Positions table
CREATE TABLE callings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id),
    title VARCHAR(255) NOT NULL,
    position_type VARCHAR(100),
    requires_setting_apart BOOLEAN DEFAULT true,
    display_order INT DEFAULT 0,
    parent_calling_id UUID REFERENCES callings(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Current calling assignments
CREATE TABLE calling_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    calling_id UUID REFERENCES callings(id),
    member_id UUID REFERENCES members(id),
    assigned_date DATE,
    sustained_date DATE,
    set_apart_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Calling changes workflow
CREATE TYPE calling_change_status AS ENUM ('hold', 'in_progress', 'completed');

CREATE TABLE calling_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    calling_id UUID REFERENCES callings(id),
    new_member_id UUID REFERENCES members(id),
    current_member_id UUID REFERENCES members(id),
    status calling_change_status DEFAULT 'in_progress',
    priority INT DEFAULT 0,
    assigned_to_bishopric_member VARCHAR(100),
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- People being considered for callings
CREATE TABLE calling_considerations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    calling_change_id UUID REFERENCES calling_changes(id) ON DELETE CASCADE,
    member_id UUID REFERENCES members(id),
    is_selected_for_prayer BOOLEAN DEFAULT false,
    notes TEXT,
    consideration_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Members who need callings
CREATE TYPE member_calling_need_status AS ENUM ('active', 'hold');

CREATE TABLE member_calling_needs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID REFERENCES members(id),
    status member_calling_need_status DEFAULT 'active',
    potential_callings TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tasks for calling workflow
CREATE TYPE task_type AS ENUM (
    'release_current',
    'extend_calling',
    'sustain_new',
    'release_sustained',
    'set_apart',
    'record_in_tools'
);

CREATE TYPE task_status AS ENUM ('pending', 'completed');

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    calling_change_id UUID REFERENCES calling_changes(id) ON DELETE CASCADE,
    task_type task_type NOT NULL,
    member_id UUID REFERENCES members(id),
    assigned_to VARCHAR(100),
    status task_status DEFAULT 'pending',
    due_date DATE,
    completed_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bishopric stewardships
CREATE TABLE bishopric_stewardships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bishopric_member VARCHAR(100) NOT NULL,
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- General notes system
CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    note_text TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX idx_members_household ON members(household_id);
CREATE INDEX idx_members_church_id ON members(church_id);
CREATE INDEX idx_calling_assignments_calling ON calling_assignments(calling_id);
CREATE INDEX idx_calling_assignments_member ON calling_assignments(member_id);
CREATE INDEX idx_calling_assignments_active ON calling_assignments(is_active);
CREATE INDEX idx_calling_changes_status ON calling_changes(status);
CREATE INDEX idx_calling_considerations_change ON calling_considerations(calling_change_id);
CREATE INDEX idx_tasks_calling_change ON tasks(calling_change_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_notes_entity ON notes(entity_type, entity_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers to all tables
CREATE TRIGGER update_households_updated_at BEFORE UPDATE ON households FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_members_updated_at BEFORE UPDATE ON members FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_callings_updated_at BEFORE UPDATE ON callings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_calling_assignments_updated_at BEFORE UPDATE ON calling_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_calling_changes_updated_at BEFORE UPDATE ON calling_changes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_calling_considerations_updated_at BEFORE UPDATE ON calling_considerations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_member_calling_needs_updated_at BEFORE UPDATE ON member_calling_needs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bishopric_stewardships_updated_at BEFORE UPDATE ON bishopric_stewardships FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
