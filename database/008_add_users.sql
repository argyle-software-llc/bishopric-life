-- Add users table for authentication
-- Only users with allowed=true can log in

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  picture TEXT,
  allowed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP
);

-- Create index on email for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Example: Pre-populate your allowlist (uncomment and edit)
-- INSERT INTO users (email, allowed) VALUES
--   ('your-email@gmail.com', true),
--   ('another-user@gmail.com', true)
-- ON CONFLICT (email) DO UPDATE SET allowed = EXCLUDED.allowed;
