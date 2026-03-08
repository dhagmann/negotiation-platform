'use strict';

const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { Sequelize } = require('sequelize');
const basename = path.basename(__filename);
const db = {};
const isProduction = process.env.NODE_ENV === 'production';
const isDemoMode = process.env.DEMO_MODE === 'true';

// Use different connection methods for demo, production, and development
let sequelize;
if (isDemoMode) {
    // Demo mode: SQLite in-memory database (no data persisted)
    sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: ':memory:',
        logging: false,
        pool: { max: 1, min: 0, acquire: 30000, idle: 10000 }
    });
    console.log('DEMO MODE: Using in-memory database (no data will be persisted)');
} else if (isProduction && process.env.POSTGRES_DATABASE_URL && process.env.POSTGRES_DATABASE_URL !== 'your_production_database_url') {
    // Production: Optimized for AWS Aurora Serverless v2
    sequelize = new Sequelize(process.env.POSTGRES_DATABASE_URL, {
        dialect: 'postgres',
        protocol: 'postgres',
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false,
            },
            connectTimeout: 60000,
            socketTimeout: 30000,
            keepAlive: true,
            keepAliveInitialDelayMillis: 10000,
        },
        pool: {
            max: parseInt(process.env.DB_MAX_CONNECTIONS) || 100,
            min: parseInt(process.env.DB_MIN_CONNECTIONS) || 0,
            acquire: 60000,
            idle: 30000,
            evict: 60000,
            handleDisconnects: true,
            validate: (client) => {
                return client && !client._ending && !client._destroyed;
            }
        },
        retry: {
            max: 3,
            timeout: 5000,
        },
        logging: false,
        benchmark: true,
        minifyAliases: true,
        isolationLevel: 'READ COMMITTED',
        hooks: {
            beforeConnect: () => {},
            afterConnect: (connection, config) => {},
            beforeDisconnect: () => {}
        }
    });
} else {
    // Development: Use individual connection parameters
    sequelize = new Sequelize(
        process.env.DB_NAME || 'agent_selection',
        process.env.DB_USER || 'postgres',
        process.env.DB_PASSWORD || 'postgres',
        {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            dialect: 'postgres',
            dialectOptions: {
                ssl: process.env.DB_HOST && process.env.DB_HOST.includes('rds.amazonaws.com') ? {
                    require: true,
                    rejectUnauthorized: false,
                } : false,
            },
            pool: {
                max: parseInt(process.env.DB_MAX_CONNECTIONS) || 5,
                min: parseInt(process.env.DB_MIN_CONNECTIONS) || 1,
                acquire: 30000,
                idle: 10000
            }
        }
    );
}

// Connection health monitoring (skip for demo mode)
if (!isDemoMode) {
    sequelize.addHook('beforeQuery', (options, query) => {
        query.startTime = Date.now();
    });

    sequelize.addHook('afterQuery', (options, query) => {
        const duration = Date.now() - query.startTime;
        if (duration > 1000) {
            // Slow query detected
        }
    });
}

fs.readdirSync(__dirname)
    .filter((file) => {
        return file.indexOf('.') !== 0 && file !== basename && file.slice(-3) === '.js';
    })
    .forEach((file) => {
        const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
        db[model.name] = model;
    });

Object.keys(db).forEach((modelName) => {
    if (db[modelName].associate) {
        db[modelName].associate(db);
    }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

// Auto-create tables in demo mode
if (isDemoMode) {
    db.syncPromise = sequelize.sync({ force: true }).then(() => {
        console.log('DEMO MODE: In-memory tables created successfully');
    }).catch(err => {
        console.error('DEMO MODE: Failed to create tables:', err);
    });
}

// Add connection monitoring utilities
db.getConnectionStatus = async () => {
    if (isDemoMode) {
        return { status: 'demo-mode', pool: {} };
    }
    try {
        await sequelize.authenticate();
        const poolInfo = sequelize.connectionManager.pool;
        return {
            status: 'connected',
            pool: {
                used: poolInfo.used || 0,
                waiting: poolInfo.pending || 0,
                available: poolInfo.available || 0,
                created: poolInfo.created || 0
            }
        };
    } catch (error) {
        return {
            status: 'disconnected',
            error: error.message
        };
    }
};

module.exports = db;
