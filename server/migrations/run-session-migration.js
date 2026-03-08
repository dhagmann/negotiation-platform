// Load environment variables from project root
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { sequelize } = require('../models');

/**
 * Run session management migration
 * Adds session_state and last_seen_at columns to participants table
 */
async function runSessionMigration() {
    try {
        console.log('🔄 Running session management migration...');
        console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🔗 Database Host: ${process.env.DB_HOST || 'localhost'}`);
        console.log(`🔗 Database Name: ${process.env.DB_NAME || 'agent_selection'}`);
        console.log(`🔗 Production URL: ${process.env.POSTGRES_DATABASE_URL ? 'Set' : 'Not set'}`);
        
        // Test database connection first
        await sequelize.authenticate();
        console.log('✅ Database connection successful');
        
        // Read and execute the migration SQL
        const migrationSQL = fs.readFileSync(
            path.join(__dirname, '002-add-session-management.sql'), 
            'utf8'
        );
        
        // Split SQL statements and execute them one by one
        const statements = migrationSQL
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
        
        for (const statement of statements) {
            console.log(`🔧 Executing: ${statement.substring(0, 50)}...`);
            await sequelize.query(statement);
        }
        
        console.log('✅ Session management migration completed successfully');
        console.log('📋 Added columns:');
        console.log('   - session_state (JSONB): Stores user session data');
        console.log('   - last_seen_at (TIMESTAMP): Last activity timestamp');
        console.log('📊 Added indexes for performance');
        
        // Close the connection
        await sequelize.close();
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.log('\n💡 Troubleshooting:');
        console.log('1. Make sure your .env file has the correct POSTGRES_DATABASE_URL');
        console.log('2. Set NODE_ENV=production if using Aurora');
        console.log('3. Check your AWS Aurora connection details');
        
        await sequelize.close();
        process.exit(1);
    }
}

// Run migration if called directly
if (require.main === module) {
    runSessionMigration();
}

module.exports = { runSessionMigration };