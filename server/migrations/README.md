# Dashboard Performance Optimization

This directory contains database optimizations to improve dashboard query performance for the Agent Selection application.

## What This Does

The optimization adds targeted database indexes to dramatically improve dashboard loading times and reduce Aurora Serverless V2 ACU usage.

### Performance Improvements Expected:
- **Dashboard loads 5-10x faster** (from ~2-5 seconds to ~200-500ms)
- **Reduced ACU usage** during dashboard queries
- **Better scalability** for 200+ concurrent participants
- **Smoother dashboard updates** during high activity

## How to Run

### Option 1: Using Node.js Script (Recommended)
```bash
cd server/migrations
node run-dashboard-optimization.js
```

### Option 2: Direct SQL Execution
```bash
psql -d your_database -f 001-add-dashboard-indexes.sql
```

## What Indexes Are Created

| Index Name | Purpose | Impact |
|------------|---------|---------|
| `idx_participants_created_dropout` | **⭐ Critical** - Main dashboard filtering | Highest impact |
| `idx_participants_role` | Role-based participant counting | High impact |
| `idx_participants_session_id` | DISTINCT session counts | Medium impact |
| `idx_participants_agreement_reached` | Agreement status filtering | Medium impact |
| `idx_participants_completed_study` | Completion status filtering | Medium impact |
| `idx_chat_messages_timestamp` | Recent message queries | Medium impact |
| `idx_participants_complex_dashboard` | Complex multi-condition queries | High impact |

## Safety Features

- Uses `CREATE INDEX CONCURRENTLY` to avoid table locks
- Includes `IF NOT EXISTS` to prevent duplicate index errors  
- Safe to run multiple times
- Non-blocking operation (won't affect live traffic)

## Monitoring

After running the optimization, monitor these metrics:

### Aurora CloudWatch Metrics:
- **ServerlessDatabaseCapacity**: Should show lower ACU spikes during dashboard queries
- **DatabaseConnections**: More efficient connection usage
- **ReadThroughput**: Higher due to index efficiency

### Application Metrics:
- Dashboard `/dashboard-data` endpoint response time
- Lower CPU usage during dashboard updates
- Faster page loads in dashboard UI

## Verification

The script automatically tests performance and shows:
- Query execution time before/after
- List of created indexes
- Performance classification (Excellent/Good/Acceptable/Slow)

## Expected Results

**Before Optimization:**
```
Dashboard query: ~2000-5000ms
ACU usage spikes: 4-8 ACU during queries
```

**After Optimization:**
```
Dashboard query: ~200-500ms
ACU usage spikes: 1-2 ACU during queries
```

## Rollback

If needed, indexes can be removed with:
```sql
DROP INDEX CONCURRENTLY idx_participants_created_dropout;
DROP INDEX CONCURRENTLY idx_participants_role;
-- ... etc for each index
```

## Questions?

The optimization is designed for Aurora Serverless V2 PostgreSQL and targets the specific query patterns in your dashboard. All indexes are carefully chosen based on the actual SQL queries used by the application. 