-- Dashboard Performance Optimization Indexes
-- This migration adds indexes to optimize the dashboard queries

-- 1. Composite index for main dashboard query (created_at + dropout_stage)
-- This is the most critical index since dashboard filters by date then counts by dropout_stage
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_participants_created_dropout 
ON participants (created_at, dropout_stage);

-- 2. Index on role for role-based filtering and counts
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_participants_role 
ON participants (role);

-- 3. Index on session_id for DISTINCT session counts
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_participants_session_id 
ON participants (session_id);

-- 4. Index on agreement_reached for agreement filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_participants_agreement_reached 
ON participants (agreement_reached);

-- 5. Index on completed_study for completion status filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_participants_completed_study 
ON participants (completed_study);

-- 6. Index on quiz_passed for quiz status filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_participants_quiz_passed 
ON participants (quiz_passed);

-- 7. Index on quiz_attempts for quiz attempt filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_participants_quiz_attempts 
ON participants (quiz_attempts);

-- 8. Index on final_agreement for NULL/NOT NULL checks
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_participants_final_agreement 
ON participants (final_agreement);

-- 9. Index on chat_messages timestamp for recent message queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_timestamp 
ON chat_messages (absolute_timestamp);

-- 10. Composite index for complex filtering scenarios
-- This helps with queries that combine multiple conditions
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_participants_complex_dashboard 
ON participants (created_at, dropout_stage, role, agreement_reached);

-- Analyze tables to update statistics after index creation
ANALYZE participants;
ANALYZE chat_messages;

-- Query to verify indexes were created successfully
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename IN ('participants', 'chat_messages') 
    AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname; 