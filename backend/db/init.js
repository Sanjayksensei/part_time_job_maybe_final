const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Create a connection pool instead of a single connection
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true,
    dateStrings: true,

    ssl: {
        rejectUnauthorized: false
    }
});

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const SEED_PATH = path.join(__dirname, 'seed.sql');

async function initDatabase() {
    try {
        console.log('🔄 Checking database connection...');
        const connection = await pool.getConnection();
        console.log('✅ Connected to MySQL database');

        // Check if users table exists to determine if we need to seed
        const [rows] = await connection.query("SHOW TABLES LIKE 'users'");
        const isNew = rows.length === 0;

        if (isNew) {
            console.log('🌱 Empty database detected. Initializing schema and seeding data...');

            // 1. Run schema
            const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
            await connection.query(schema);
            console.log('📋 Schema created successfully');

            // 2. Generate bcrypt hash for 'password123'
            const hash = await bcrypt.hash('password123', parseInt(process.env.BCRYPT_ROUNDS) || 10);

            // 3. Read seed SQL and replace placeholder hashes
            let seed = fs.readFileSync(SEED_PATH, 'utf8');
            seed = seed.replace(/\$PLACEHOLDER\$/g, hash);

            // 4. Run seed
            await connection.query(seed);
            console.log('✅ Database seeded successfully');
        } else {
            console.log('📦 Database already populated, skipping seed');
        }

        // Migration: add 'roles' column if it doesn't exist (supports dual-role feature)
        try {
            const [cols] = await connection.query("SHOW COLUMNS FROM users LIKE 'roles'");
            if (cols.length === 0) {
                await connection.query("ALTER TABLE users ADD COLUMN roles VARCHAR(50) DEFAULT NULL");
                await connection.query("UPDATE users SET roles = role WHERE roles IS NULL");
                console.log('✅ Migration: added roles column to users table');
            }
        } catch (migErr) {
            console.error('Migration warning (roles column):', migErr.message);
        }

        // Migration: add 'current_token' column for single-session tracking
        try {
            const [cols] = await connection.query("SHOW COLUMNS FROM users LIKE 'current_token'");
            if (cols.length === 0) {
                await connection.query("ALTER TABLE users ADD COLUMN current_token TEXT DEFAULT NULL");
                console.log('✅ Migration: added current_token column to users table');
            }
        } catch (migErr) {
            console.error('Migration warning (current_token column):', migErr.message);
        }

        // Migration: create user_roles table if it doesn't exist and populate from existing data
        try {
            const [urTable] = await connection.query("SHOW TABLES LIKE 'user_roles'");
            if (urTable.length === 0) {
                await connection.query(`
                    CREATE TABLE user_roles (
                        id INT PRIMARY KEY AUTO_INCREMENT,
                        user_id INT NOT NULL,
                        role ENUM('employee','employer') NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY unique_user_role (user_id, role),
                        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
                    )
                `);
                console.log('✅ Migration: created user_roles table');

                // Populate from existing users.roles column data
                const [allUsers] = await connection.query("SELECT user_id, role, roles FROM users");
                for (const u of allUsers) {
                    const roleList = (u.roles || u.role || '').split(',').map(r => r.trim()).filter(Boolean);
                    for (const r of roleList) {
                        if (['employee', 'employer'].includes(r)) {
                            await connection.query(
                                "INSERT IGNORE INTO user_roles (user_id, role) VALUES (?, ?)",
                                [u.user_id, r]
                            );
                        }
                    }
                }
                console.log('✅ Migration: populated user_roles from existing data');
            }
        } catch (migErr) {
            console.error('Migration warning (user_roles table):', migErr.message);
        }

        // Migration: create contracts table if it doesn't exist
        try {
            const [ctTable] = await connection.query("SHOW TABLES LIKE 'contracts'");
            if (ctTable.length === 0) {
                await connection.query(`
                    CREATE TABLE contracts (
                        contract_id INT PRIMARY KEY AUTO_INCREMENT,
                        application_id INT UNIQUE NOT NULL,
                        job_id INT NOT NULL,
                        employee_id INT NOT NULL,
                        employer_id INT NOT NULL,
                        job_mode ENUM('offline','online') DEFAULT 'offline',
                        qr_code TEXT,
                        status ENUM('active','completed','cancelled') DEFAULT 'active',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (application_id) REFERENCES applications(application_id) ON DELETE CASCADE,
                        FOREIGN KEY (job_id) REFERENCES jobs(job_id) ON DELETE CASCADE,
                        FOREIGN KEY (employee_id) REFERENCES users(user_id) ON DELETE CASCADE,
                        FOREIGN KEY (employer_id) REFERENCES users(user_id) ON DELETE CASCADE
                    )
                `);
                console.log('✅ Migration: created contracts table');
            }
        } catch (migErr) {
            console.error('Migration warning (contracts table):', migErr.message);
        }

        // Migration: create attendance table if it doesn't exist
        try {
            const [atTable] = await connection.query("SHOW TABLES LIKE 'attendance'");
            if (atTable.length === 0) {
                await connection.query(`
                    CREATE TABLE attendance (
                        attendance_id INT PRIMARY KEY AUTO_INCREMENT,
                        contract_id INT NOT NULL,
                        employee_id INT NOT NULL,
                        method ENUM('qr_scan','online_confirm') DEFAULT 'qr_scan',
                        marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        date DATE NOT NULL,
                        UNIQUE KEY unique_attendance (contract_id, date),
                        FOREIGN KEY (contract_id) REFERENCES contracts(contract_id) ON DELETE CASCADE,
                        FOREIGN KEY (employee_id) REFERENCES users(user_id) ON DELETE CASCADE
                    )
                `);
                console.log('✅ Migration: created attendance table');
            }
        } catch (migErr) {
            console.error('Migration warning (attendance table):', migErr.message);
        }

        // Migration: add allow_resignation and qr_token columns to jobs
        try {
            const [cols1] = await connection.query("SHOW COLUMNS FROM jobs LIKE 'allow_resignation'");
            if (cols1.length === 0) {
                await connection.query("ALTER TABLE jobs ADD COLUMN allow_resignation BOOLEAN DEFAULT TRUE");
                console.log('✅ Migration: added allow_resignation column to jobs');
            }
            const [cols2] = await connection.query("SHOW COLUMNS FROM jobs LIKE 'qr_token'");
            if (cols2.length === 0) {
                await connection.query("ALTER TABLE jobs ADD COLUMN qr_token TEXT");
                console.log('✅ Migration: added qr_token column to jobs');
            }
        } catch (migErr) {
            console.error('Migration warning (jobs columns):', migErr.message);
        }

        // Migration: add max_workers and status columns to jobs (job capacity feature)
        try {
            const [mwCols] = await connection.query("SHOW COLUMNS FROM jobs LIKE 'max_workers'");
            if (mwCols.length === 0) {
                await connection.query("ALTER TABLE jobs ADD COLUMN max_workers INT DEFAULT NULL");
                console.log('✅ Migration: added max_workers column to jobs');
            }
            const [stCols] = await connection.query("SHOW COLUMNS FROM jobs LIKE 'status'");
            if (stCols.length === 0) {
                await connection.query("ALTER TABLE jobs ADD COLUMN status ENUM('open','closed') DEFAULT 'open'");
                console.log('✅ Migration: added status column to jobs');
            }
        } catch (migErr) {
        }

        // Migration: add start_time and end_time columns to jobs (time management)
        try {
            const [dtCols] = await connection.query("SHOW COLUMNS FROM jobs LIKE 'job_date'");
            if (dtCols.length === 0) {
                await connection.query("ALTER TABLE jobs ADD COLUMN job_date DATE DEFAULT NULL");
                console.log('✅ Migration: added job_date column to jobs');
            }

            // Migration: Append end_date natively protecting bounds organically
            const [edCols] = await connection.query("SHOW COLUMNS FROM jobs LIKE 'end_date'");
            if (edCols.length === 0) {
                await connection.query("ALTER TABLE jobs ADD COLUMN end_date DATE DEFAULT NULL");
                console.log('✅ Migration: added end_date column to jobs');
            }
            const [stCols] = await connection.query("SHOW COLUMNS FROM jobs LIKE 'start_time'");
            if (stCols.length === 0) {
                await connection.query("ALTER TABLE jobs ADD COLUMN start_time TIME DEFAULT NULL");
                console.log('✅ Migration: added start_time column to jobs');
            }
            const [etCols] = await connection.query("SHOW COLUMNS FROM jobs LIKE 'end_time'");
            if (etCols.length === 0) {
                await connection.query("ALTER TABLE jobs ADD COLUMN end_time TIME DEFAULT NULL");
                console.log('✅ Migration: added end_time column to jobs');
            }
        } catch (migErr) {
            console.error('Migration warning (jobs time columns):', migErr.message);
        }
        try {
            const [cols3] = await connection.query("SHOW COLUMNS FROM contracts LIKE 'participation_status'");
            if (cols3.length === 0) {
                await connection.query("ALTER TABLE contracts ADD COLUMN participation_status ENUM('active','resigned') DEFAULT 'active'");
                console.log('✅ Migration: added participation_status column to contracts');
            }
        } catch (migErr) {
            console.error('Migration warning (contracts participation_status):', migErr.message);
        }

        // Migration: create job_offers table
        try {
            const [ofTable] = await connection.query("SHOW TABLES LIKE 'job_offers'");
            if (ofTable.length === 0) {
                await connection.query(`
                    CREATE TABLE job_offers (
                        offer_id INT PRIMARY KEY AUTO_INCREMENT,
                        employer_id INT NOT NULL,
                        employee_id INT NOT NULL,
                        job_id INT NOT NULL,
                        message TEXT,
                        status ENUM('pending','accepted','declined') DEFAULT 'pending',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        responded_at TIMESTAMP NULL,
                        UNIQUE KEY unique_offer (employer_id, employee_id, job_id),
                        FOREIGN KEY (employer_id) REFERENCES users(user_id) ON DELETE CASCADE,
                        FOREIGN KEY (employee_id) REFERENCES users(user_id) ON DELETE CASCADE,
                        FOREIGN KEY (job_id) REFERENCES jobs(job_id) ON DELETE CASCADE
                    )
                `);
                console.log('✅ Migration: created job_offers table');
            }
        } catch (migErr) {
            console.error('Migration warning (job_offers table):', migErr.message);
        }

        // Migration: make application_id nullable in contracts (allow offer-based contracts)
        try {
            const [cols] = await connection.query("SHOW COLUMNS FROM contracts WHERE Field = 'application_id'");
            if (cols.length > 0 && cols[0].Null === 'NO') {
                await connection.query("ALTER TABLE contracts MODIFY application_id INT UNIQUE DEFAULT NULL");
                console.log('✅ Migration: made application_id nullable in contracts');
            }
        } catch (migErr) {
            console.error('Migration warning (contracts application_id nullable):', migErr.message);
        }

        // Migration: create reports table
        try {
            const [rpTable] = await connection.query("SHOW TABLES LIKE 'reports'");
            if (rpTable.length === 0) {
                await connection.query(`
                    CREATE TABLE reports (
                        report_id INT PRIMARY KEY AUTO_INCREMENT,
                        reporter_id INT NOT NULL,
                        reported_id INT NOT NULL,
                        job_id INT DEFAULT NULL,
                        contract_id INT DEFAULT NULL,
                        reason VARCHAR(100) NOT NULL,
                        description TEXT,
                        status ENUM('pending','reviewed','resolved','dismissed') DEFAULT 'pending',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (reporter_id) REFERENCES users(user_id) ON DELETE CASCADE,
                        FOREIGN KEY (reported_id) REFERENCES users(user_id) ON DELETE CASCADE
                    )
                `);
                console.log('✅ Migration: created reports table');
            }
        } catch (migErr) {
            console.error('Migration warning (reports table):', migErr.message);
        }

        connection.release();
        return pool;
    } catch (err) {
        console.error('❌ Database initialization error:', err.message);
        if (err.code === 'ER_BAD_DB_ERROR') {
            console.error(`Please create the database first: CREATE DATABASE ${process.env.DB_NAME};`);
        }
        throw err;
    }
}

// Export the pool directly so routes can use pool.query()
module.exports = { initDatabase, pool };
