#!/usr/bin/env node
/**
 * Database Connection Monitor
 * Helps track and optimize Aurora Serverless v2 connection usage
 */

require('dotenv').config();
const dbService = require('./database-service');

async function monitorConnections() {
    //console.log('🔍 Aurora Serverless v2 Connection Monitor\n');
    
    try {
        const status = await dbService.getConnectionStatus();
        
        if (status.status === 'connected') {
            //console.log('✅ Database Status: Connected');
            //console.log('📊 Connection Pool Status:');
            //console.log(`   Total Connections: ${status.pool.total}`);
            //console.log(`   Used Connections:  ${status.pool.used}`);
            //console.log(`   Available:         ${status.pool.available}`);
            //console.log(`   Waiting:           ${status.pool.waiting}`);
            //console.log(`   Idle:              ${status.pool.idle || 0}`);
            
            // Calculate efficiency metrics
            const efficiency = ((status.pool.used / status.pool.total) * 100).toFixed(1);
            //console.log(`   Pool Efficiency:   ${efficiency}%`);
            
            //console.log('\n💾 Query Cache Status:');
            //console.log(`   Cached Entries:    ${status.cache.entries}`);
            //console.log(`   Cache Keys:        ${status.cache.keys.join(', ') || 'None'}`);
            
            // Recommendations
            //console.log('\n💡 Optimization Recommendations:');
            
            if (status.pool.used > status.pool.total * 0.8) {
                //console.log('   ⚠️  HIGH: Connection pool usage > 80% - consider optimizing queries');
            } else if (status.pool.used > status.pool.total * 0.6) {
                //console.log('   ⚡ MEDIUM: Connection pool usage > 60% - monitor closely');
            } else {
                //console.log('   ✅ GOOD: Connection pool usage is optimal');
            }
            
            if (status.pool.waiting > 0) {
                //console.log('   🔴 CRITICAL: Connections waiting - increase pool size or optimize queries');
            }
            
            if (status.cache.entries === 0) {
                //console.log('   📈 INFO: No cached queries - ensure caching is working for dashboard');
            } else {
                //console.log('   ✅ GOOD: Query caching is active');
            }
            
        } else {
            //console.log('❌ Database Status: Disconnected');
            //console.log(`   Error: ${status.error}`);
        }
        
        // Get dashboard data to test optimization
        //console.log('\n🎯 Testing Optimized Dashboard Query...');
        const startTime = Date.now();
        const dashboardData = await dbService.getDashboardData();
        const queryTime = Date.now() - startTime;
        
        //console.log(`   Query Time: ${queryTime}ms`);
        //console.log(`   Participants: ${dashboardData.totalParticipants}`);
        //console.log(`   Completed: ${dashboardData.completedStudies}`);
        //console.log(`   Agreements: ${dashboardData.totalAgreements}`);
        
        if (queryTime < 500) {
            //console.log('   ✅ EXCELLENT: Dashboard query < 500ms');
        } else if (queryTime < 1000) {
            //console.log('   ⚡ GOOD: Dashboard query < 1s');
        } else {
            //console.log('   ⚠️  SLOW: Dashboard query > 1s - needs optimization');
        }
        
    } catch (error) {
        console.error('❌ Monitor failed:', error.message);
    }
}

// Monitor continuously if --watch flag provided
if (process.argv.includes('--watch')) {
    //console.log('🔄 Starting continuous monitoring (every 30 seconds)...\n');
    setInterval(monitorConnections, 30000);
    monitorConnections(); // Run once immediately
} else {
    monitorConnections();
}

module.exports = monitorConnections; 