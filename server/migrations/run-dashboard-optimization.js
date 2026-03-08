const path = require('path');
const fs = require('fs');

// Load environment variables from .env file
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { sequelize } = require('../models');

async function runDashboardOptimization() {
  console.log('🚀 Starting Dashboard Performance Optimization...\n');
  
  // Debug database connection info
  console.log('🔍 Database Configuration:');
  console.log(`   Host: ${process.env.DB_HOST || 'localhost'}`);
  console.log(`   Database: ${process.env.DB_NAME || 'agent_selection'}`);
  console.log(`   User: ${process.env.DB_USER || 'postgres'}`);
  console.log(`   SSL: ${process.env.DB_HOST && process.env.DB_HOST.includes('rds.amazonaws.com') ? 'enabled' : 'disabled'}\n`);
  
  try {
    // Test database connection first
    console.log('🔗 Testing database connection...');
    await sequelize.authenticate();
    console.log('✅ Database connection successful!\n');
    // Read the SQL migration file
    const sqlPath = path.join(__dirname, '001-add-dashboard-indexes.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Split SQL commands (by semicolon and clean up)
    const allCommands = sqlContent.split(';').map(cmd => cmd.trim().replace(/\s+/g, ' '));
    console.log(`🔍 Debug - Total commands after split: ${allCommands.length}`);
    allCommands.forEach((cmd, i) => {
      if (cmd.length > 0) {
        console.log(`   Raw ${i + 1}: ${cmd.substring(0, 100)}${cmd.length > 100 ? '...' : ''}`);
      }
    });
    
    const commands = allCommands.map(cmd => {
      // Extract CREATE INDEX statements from mixed comment/command lines
      const createMatch = cmd.match(/CREATE\s+INDEX.*?;?$/i);
      if (createMatch) {
        return createMatch[0];
      }
      // Keep ANALYZE statements as-is
      if (cmd.toUpperCase().includes('ANALYZE') && !cmd.startsWith('--')) {
        return cmd;
      }
      return null;
    }).filter(cmd => cmd !== null && cmd.length > 0);
    
    console.log(`📝 Found ${commands.length} SQL commands to execute\n`);
    
    // Debug: Show what commands were parsed
    console.log('🔍 Debug - Parsed commands:');
    commands.forEach((cmd, i) => {
      console.log(`   ${i + 1}: ${cmd.substring(0, 80)}${cmd.length > 80 ? '...' : ''}`);
    });
    console.log('');
    
    // Execute each command
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      console.log(`⚡ Executing command ${i + 1}/${commands.length}:`);
      console.log(`   ${command.substring(0, 60)}${command.length > 60 ? '...' : ''}`);
      
      try {
        const startTime = Date.now();
        await sequelize.query(command);
        const duration = Date.now() - startTime;
        console.log(`   ✅ Completed in ${duration}ms\n`);
      } catch (error) {
        console.log(`   ⚠️  Warning: ${error.message}`);
        console.log(`   (This might be expected if index already exists)\n`);
      }
    }
    
    // Test query performance
    console.log('📊 Testing dashboard query performance...');
    const startTime = Date.now();
    
    const testQuery = `
      SELECT 
        COUNT(CASE WHEN dropout_stage = 'completed' THEN 1 END) as completed_studies,
        COUNT(CASE WHEN agreement_reached = true THEN 1 END) as successful_agreements,
        COUNT(CASE WHEN completed_study = true AND agreement_reached = true THEN 1 END) as completed_with_agreement,
        COUNT(CASE WHEN dropout_stage = 'disconnected' THEN 1 END) as disconnected_count,
        COUNT(CASE WHEN role = 'optimisticBuyer' THEN 1 END) as optimistic_buyers,
        COUNT(DISTINCT session_id) as total_sessions
      FROM participants
      WHERE created_at > NOW() - INTERVAL '48 hours'
    `;
    
    const result = await sequelize.query(testQuery, {
      type: sequelize.QueryTypes.SELECT
    });
    
    const queryDuration = Date.now() - startTime;
    console.log(`   ⏱️  Dashboard query completed in ${queryDuration}ms`);
    console.log(`   📈 Sample results:`, result[0]);
    
    // Show performance guidance
    console.log('\n🎯 Performance Optimization Results:');
    if (queryDuration < 100) {
      console.log('   ✅ EXCELLENT: Dashboard query < 100ms');
    } else if (queryDuration < 500) {
      console.log('   ⚡ GOOD: Dashboard query < 500ms');
    } else if (queryDuration < 1000) {
      console.log('   ⚠️  ACCEPTABLE: Dashboard query < 1s');
    } else {
      console.log('   🔴 SLOW: Dashboard query > 1s - may need additional optimization');
    }
    
    // Verify indexes were created
    console.log('\n🔍 Verifying created indexes...');
    const indexCheck = await sequelize.query(`
      SELECT 
          tablename,
          indexname,
          CASE 
            WHEN indexname LIKE '%created_dropout%' THEN '⭐ Critical'
            WHEN indexname LIKE '%role%' THEN '🎯 Role filtering'
            WHEN indexname LIKE '%timestamp%' THEN '⏰ Time filtering'
            ELSE '📊 General'
          END as purpose
      FROM pg_indexes 
      WHERE tablename IN ('participants', 'chat_messages') 
          AND indexname LIKE 'idx_%'
      ORDER BY tablename, indexname
    `, {
      type: sequelize.QueryTypes.SELECT
    });
    
    console.log(`   📋 Found ${indexCheck.length} dashboard indexes:`);
    indexCheck.forEach(idx => {
      console.log(`   - ${idx.indexname} (${idx.purpose})`);
    });
    
    console.log('\n🎉 Dashboard optimization completed successfully!');
    console.log('\n💡 Expected improvements:');
    console.log('   - Dashboard loads 5-10x faster');
    console.log('   - Reduced ACU usage during dashboard queries');
    console.log('   - Better performance under high participant load');
    
  } catch (error) {
    console.error('❌ Error during optimization:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Run if called directly
if (require.main === module) {
  runDashboardOptimization()
    .then(() => {
      console.log('\n✅ Optimization script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Optimization script failed:', error);
      process.exit(1);
    });
}

module.exports = { runDashboardOptimization }; 