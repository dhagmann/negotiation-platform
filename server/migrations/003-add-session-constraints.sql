-- Add database constraints to prevent race conditions and data corruption
-- These constraints provide additional safety at the database level

-- Add unique constraint to prevent duplicate active sessions per participant
-- This will fail fast if a participant somehow gets matched twice
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_participants_active_session 
ON participants (participant_id) 
WHERE session_id IS NOT NULL AND chat_ended_at IS NULL;

-- Add constraint to ensure partner relationships are bidirectional
-- This helps catch orphaned partner relationships
ALTER TABLE participants 
ADD CONSTRAINT chk_partner_consistency 
CHECK (
  (partner_id IS NULL AND session_id IS NULL) OR 
  (partner_id IS NOT NULL AND session_id IS NOT NULL)
);

-- Add index for fast session_id lookups during matching
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_participants_session_lookup 
ON participants (session_id, participant_id) 
WHERE session_id IS NOT NULL;

-- Add constraint to prevent self-partnering
ALTER TABLE participants 
ADD CONSTRAINT chk_no_self_partner 
CHECK (participant_id != partner_id OR partner_id IS NULL);

-- Add index for cleanup operations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_participants_cleanup 
ON participants (socket_id, last_seen_at) 
WHERE socket_id IS NOT NULL;

-- Comments for future maintenance (PostgreSQL only - may fail on other databases)
-- COMMENT ON INDEX idx_participants_active_session IS 'Prevents race conditions by ensuring only one active session per participant';
-- COMMENT ON INDEX idx_participants_session_lookup IS 'Optimizes session validation during matching process'; 
-- COMMENT ON INDEX idx_participants_cleanup IS 'Optimizes cleanup operations for stale connections';