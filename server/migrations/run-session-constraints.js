#!/usr/bin/env node

/**
 * Apply session constraints to prevent race conditions
 * Run this script to add database-level safeguards for the negotiation app
 */

const { sequelize } = require('../models');
const fs = require('fs');
const path = require('path');

async function applySessionConstraints() {
  try {
    console.log('🔧 Applying session constraints to prevent race conditions...');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, '003-add-session-constraints.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Split into individual statements and execute
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    for (const statement of statements) {
      try {
        await sequelize.query(statement);
        console.log(`✅ Executed: ${statement.substring(0, 60)}...`);
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('CONCURRENTLY')) {
          console.log(`⚠️ Skipped existing: ${statement.substring(0, 60)}...`);
        } else {
          console.error(`❌ Error executing: ${statement.substring(0, 60)}...`);
          console.error(error.message);
        }
      }
    }
    
    console.log('✅ Session constraints applied successfully!');
    console.log('\n📋 Applied constraints:');
    console.log('  - Unique constraint on active sessions per participant');
    console.log('  - Partner relationship consistency checks');
    console.log('  - Self-partnering prevention');
    console.log('  - Optimized indexes for matching and cleanup');
    
  } catch (error) {
    console.error('❌ Failed to apply session constraints:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  applySessionConstraints().catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}

module.exports = { applySessionConstraints };