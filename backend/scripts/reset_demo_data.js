const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '../.env' }); 

async function seed() {
    console.log('🔄 Starting Safe Data Reset...');
    
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'root123',
        database: process.env.DB_NAME || 'parttimejobfinder',
        dateStrings: true
    });

    try {
        await pool.query('SET FOREIGN_KEY_CHECKS = 0');
        
        const tablesToClear = [
            'users', 
            'user_roles',
            'employee_profiles', 
            'employer_profiles', 
            'trust_scores',
            'job_categories',
            'jobs', 
            'job_category_mapping', 
            'applications', 
            'contracts',
            'attendance',
            'reviews', 
            'notifications', 
            'job_offers',
            'job_history',
            'employee_skills',
            'employer_ratings',
            'employee_ratings',
            'recommendations',
            'saved_jobs'
        ];
        
        for(let table of tablesToClear) {
            try {
                await pool.query(`TRUNCATE TABLE ${table}`);
            } catch(e) { }
        }
        
        await pool.query('SET FOREIGN_KEY_CHECKS = 1');
        console.log('✅ Safely deleted all data.');
        
        const execute = async (desc, sql, params) => {
            try { 
                await pool.query(sql, params); 
            } catch(e) { 
                console.error(`❌ Failed: [${desc}] -> ${e.sqlMessage}`); 
            }
        };

        // 2. Categories
        const categories = ['Food & Beverage', 'Retail', 'Events', 'Delivery', 'Technology', 'Healthcare', 'Education', 'Hospitality'];
        for(let i = 0; i < categories.length; i++) {
            await execute('Job Categories', 'INSERT INTO job_categories (category_id, category_name) VALUES (?, ?)', [i+1, categories[i]]);
        }
        
        // 3. USERS
        const passwordHash = await bcrypt.hash('password123', 10);
        const users = [
            { id: 1, name: 'Rahul Sharma', email: 'employer1@test.com', role: 'employer', phone: '9876543210', location: 'Kochi' },
            { id: 2, name: 'Anjali Menon', email: 'employer2@test.com', role: 'employer', phone: '9876543211', location: 'Thrissur' },
            { id: 3, name: 'Vishnu Das', email: 'worker1@test.com', role: 'employee', phone: '9876543220', location: 'Kalady' },
            { id: 4, name: 'Karthik Nair', email: 'worker2@test.com', role: 'employee', phone: '9876543221', location: 'Ernakulam' },
            { id: 5, name: 'Lakshmi V', email: 'worker3@test.com', role: 'employee', phone: '9876543222', location: 'Aluva' }
        ];
        
        for (let u of users) {
             await execute(`User ${u.id}`, 'INSERT INTO users (user_id, name, email, password, role, roles, phone) VALUES (?, ?, ?, ?, ?, ?, ?)', [u.id, u.name, u.email, passwordHash, u.role, u.role, u.phone]);
        }
        
        // Profiles
        await execute('Emp Profile 1', 'INSERT INTO employer_profiles (user_id, company_name, company_description, industry) VALUES (?, ?, ?, ?)', [1, 'Kerala Fresh Logistics', 'Premium delivery services across Kochi', 'Logistics']);
        await execute('Emp Profile 2', 'INSERT INTO employer_profiles (user_id, company_name, company_description, industry) VALUES (?, ?, ?, ?)', [2, 'Spice Events Management', 'Managing large scale weddings in Thrissur', 'Events']);
        
        // Employee profiles - experience is INT
        await execute('Worker Profile 3', 'INSERT INTO employee_profiles (user_id, experience, skills) VALUES (?, ?, ?)', [3, 2, 'Driving, Delivery, Packing']);
        await execute('Worker Profile 4', 'INSERT INTO employee_profiles (user_id, experience, skills) VALUES (?, ?, ?)', [4, 1, 'Event Management, Decor']);
        await execute('Worker Profile 5', 'INSERT INTO employee_profiles (user_id, experience, skills) VALUES (?, ?, ?)', [5, 0, 'Helper, General Labor']);
        
        // Default Trust Scores
        for(let i=1; i<=5; i++) {
            await execute('Trust Scores', 'INSERT INTO trust_scores (user_id, score, total_jobs, completed_jobs) VALUES (?, ?, ?, ?)', [i, 4.5, 0, 0]);
        }
        
        // 4. JOBS
        await execute('Job 1 Multi', `INSERT INTO jobs (job_id, employer_id, title, description, location, salary, job_type, skills_required, status, job_date, end_date, start_time, end_time, max_workers) VALUES (1, 1, 'Delivery Helper', 'Deliver packages locally in Kochi', 'Kochi, Kerala, India', 800, 'part-time', 'Driving, Lifting', 'open', '2026-04-01', '2026-04-03', '09:00:00', '18:00:00', 2)`);
        await execute('Job 2 Single', `INSERT INTO jobs (job_id, employer_id, title, description, location, salary, job_type, skills_required, status, job_date, end_date, start_time, end_time, max_workers) VALUES (2, 2, 'Event Staff', 'Assist in wedding natively Thrissur', 'Thrissur, Kerala, India', 1200, 'temporary', 'Decor, Guest', 'closed', '2026-03-20', '2026-03-20', '14:00:00', '22:00:00', 3)`);
        await execute('Job 3 Single', `INSERT INTO jobs (job_id, employer_id, title, description, location, salary, job_type, skills_required, status, job_date, end_date, start_time, end_time, max_workers) VALUES (3, 1, 'Warehouse Worker', 'Loading inventory', 'Aluva, Kerala, India', 900, 'contract', 'Heavy Lifting', 'open', '2026-03-28', '2026-03-28', '08:00:00', '16:00:00', 5)`);
        await execute('Job 4 Multi', `INSERT INTO jobs (job_id, employer_id, title, description, location, salary, job_type, skills_required, status, job_date, end_date, start_time, end_time, max_workers) VALUES (4, 2, 'Store Assistant', 'Manage store inventory', 'Ernakulam, Kerala, India', 1000, 'part-time', 'Inventory', 'closed', '2026-03-10', '2026-03-12', '10:00:00', '19:00:00', 2)`);

        await execute('Job Cats', 'INSERT INTO job_category_mapping (job_id, category_id) VALUES (1, 4), (2, 3), (3, 2), (4, 2)');

        // 5. APPLICATIONS 
        await execute('Apps 2', 'INSERT INTO applications (application_id, job_id, employee_id, status) VALUES (1, 2, 3, "accepted"), (2, 2, 4, "accepted")');
        await execute('Apps 4', 'INSERT INTO applications (application_id, job_id, employee_id, status) VALUES (3, 4, 5, "accepted")');
        await execute('Apps 1', 'INSERT INTO applications (application_id, job_id, employee_id, status) VALUES (4, 1, 3, "accepted"), (5, 1, 5, "pending")');
        await execute('Apps 3', 'INSERT INTO applications (application_id, job_id, employee_id, status) VALUES (6, 3, 4, "accepted")');

        // 6. CONTRACTS
        await execute('Contracts 2', 'INSERT INTO contracts (contract_id, application_id, job_id, employee_id, employer_id, qr_code, status) VALUES (1, 1, 2, 3, 2, "QR_123", "completed"), (2, 2, 2, 4, 2, "QR_124", "completed")');
        await execute('Contracts 4', 'INSERT INTO contracts (contract_id, application_id, job_id, employee_id, employer_id, qr_code, status) VALUES (3, 3, 4, 5, 2, "QR_125", "completed")');
        await execute('Contracts 1', 'INSERT INTO contracts (contract_id, application_id, job_id, employee_id, employer_id, qr_code, status) VALUES (4, 4, 1, 3, 1, "QR_126", "active")');
        await execute('Contracts 3', 'INSERT INTO contracts (contract_id, application_id, job_id, employee_id, employer_id, qr_code, status) VALUES (5, 6, 3, 4, 1, "QR_127", "active")');

        // 7. ATTENDANCE
        await execute('Attend 1', 'INSERT INTO attendance (contract_id, employee_id, method, date) VALUES (1, 3, "qr_scan", "2026-03-20")');
        await execute('Attend 2', 'INSERT INTO attendance (contract_id, employee_id, method, date) VALUES (2, 4, "qr_scan", "2026-03-20")');

        // 8. REVIEWS
        await execute('Review 1', 'INSERT INTO reviews (job_id, reviewer_id, reviewee_id, rating, comment) VALUES (2, 2, 3, 5, "Excellent worker, very punctual.")');
        await execute('Review 2', 'INSERT INTO reviews (job_id, reviewer_id, reviewee_id, rating, comment) VALUES (2, 2, 4, 4, "Did a solid job at the event.")');
        await execute('Review 3', 'INSERT INTO reviews (job_id, reviewer_id, reviewee_id, rating, comment) VALUES (4, 2, 5, 3, "Did not show up on time.")');
        await execute('Review 4', 'INSERT INTO reviews (job_id, reviewer_id, reviewee_id, rating, comment) VALUES (2, 3, 2, 5, "Amazing employer! Great work environment.")');
        
        await execute('Update Trust', 'UPDATE trust_scores SET score = 5.0, total_jobs = 1, completed_jobs = 1, total_reviews = 1, total_rating = 5 WHERE user_id = 3');
        await execute('Update Trust 2', 'UPDATE trust_scores SET score = 4.0, total_jobs = 1, completed_jobs = 1, total_reviews = 1, total_rating = 4 WHERE user_id = 4');
        
        // 9. NOTIFICATIONS
        await execute('Notif 1', 'INSERT INTO notifications (user_id, message, is_read) VALUES (1, "Vishnu Das has accepted the job offer.", 0)');
        await execute('Notif 2', 'INSERT INTO notifications (user_id, message, is_read) VALUES (3, "You have been hired for Delivery Helper.", 1)');
        
        // 10. JOB OFFERS
        await execute('Job Offers', 'INSERT INTO job_offers (employer_id, worker_id, job_id, status) VALUES (1, 4, 1, "pending")');
        
        console.log('✅ Master Database SEED completed successfully');
        process.exit();
    } catch(e) {
        console.error('❌ SEED Error:', e);
        process.exit(1);
    }
}

seed();
