-- Migration: Add session management columns to participants table
-- For research studies: replaces in-memory session storage with database persistence

-- Add session state management columns
ALTER TABLE participants ADD COLUMN IF NOT EXISTS session_state JSONB;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP;

-- Add comments for documentation
COMMENT ON COLUMN participants.session_state IS 'Stores user session data (waiting, pairing, etc.)';
COMMENT ON COLUMN participants.last_seen_at IS 'Last activity timestamp for session management';

-- Add index for performance on session queries
CREATE INDEX IF NOT EXISTS idx_participants_socket_id ON participants(socket_id);
CREATE INDEX IF NOT EXISTS idx_participants_last_seen ON participants(last_seen_at);

-- Clean up any existing null socket sessions
UPDATE participants SET 
    session_state = NULL, 
    last_seen_at = NULL 
WHERE socket_id IS NULL;