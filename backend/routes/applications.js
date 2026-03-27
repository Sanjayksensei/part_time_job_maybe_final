const express = require('express');
const router = express.Router();
const { pool } = require('../db/init');
const { authenticate, requireRole } = require('../middleware/auth');

// POST /api/applications
router.post('/', authenticate, requireRole('employee'), async (req, res) => {
    try {
        const { job_id } = req.body;
        if (!job_id) return res.status(400).json({ error: 'job_id is required' });

        const [jobs] = await pool.query("SELECT * FROM jobs WHERE job_id = ?", [job_id]);
        if (jobs.length === 0) return res.status(404).json({ error: 'Job not found' });

        const job = jobs[0];

        // Block applications to closed jobs
        if (job.status === 'closed') {
            return res.status(400).json({ error: 'This job is no longer accepting applications. The required number of workers has been reached.' });
        }

        // Block if max_workers already filled
        if (job.max_workers) {
            const [countRows] = await pool.query(
                "SELECT COUNT(*) as cnt FROM contracts WHERE job_id = ? AND status = 'active'",
                [job_id]
            );
            if (countRows[0].cnt >= job.max_workers) {
                return res.status(400).json({ error: 'This job has already reached its required number of workers.' });
            }
        }

        // Time Conflict Validation System
        if (job.job_date && job.end_date && job.start_time && job.end_time) {
            const newStartStr = `${job.job_date} ${job.start_time}`;
            const newEndStr = `${job.end_date} ${job.end_time}`;
            
            const [conflicts] = await pool.query(`
                SELECT a.application_id, j.title 
                FROM applications a
                JOIN jobs j ON a.job_id = j.job_id
                WHERE a.employee_id = ? 
                  AND a.status IN ('pending', 'accepted')
                  AND CONCAT(j.job_date, ' ', j.start_time) < ?
                  AND CONCAT(COALESCE(j.end_date, j.job_date), ' ', j.end_time) > ?
            `, [req.user.user_id, newEndStr, newStartStr]);

            if (conflicts.length > 0) {
                return res.status(400).json({ error: 'You already have a job scheduled during this time.' });
            }
        }

        const [existing] = await pool.query('SELECT * FROM applications WHERE job_id = ? AND employee_id = ?', [job_id, req.user.user_id]);
        if (existing.length > 0) return res.status(400).json({ error: 'You have already applied for this job' });

        const [result] = await pool.query('INSERT INTO applications (job_id, employee_id) VALUES (?, ?)', [job_id, req.user.user_id]);
        const [applications] = await pool.query('SELECT * FROM applications WHERE application_id = ?', [result.insertId]);
        
        // Add a notification for the employer
        await pool.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)', 
            [job.employer_id, `You have a new application for the job ${job.title}`]);

        res.status(201).json({ application: applications[0] });
    } catch (err) {
        console.error('Apply error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/applications/mine
router.get('/mine', authenticate, async (req, res) => {
    try {
        const [applications] = await pool.query(`SELECT a.*, j.title as job_title, j.location as job_location, j.salary,
            j.job_type, u.name as employer_name, ep.company_name
            FROM applications a JOIN jobs j ON a.job_id = j.job_id
            JOIN users u ON j.employer_id = u.user_id
            LEFT JOIN employer_profiles ep ON j.employer_id = ep.user_id
            WHERE a.employee_id = ? ORDER BY a.applied_at DESC`, [req.user.user_id]);
        res.json({ applications });
    } catch (err) {
        console.error('Get applications error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/applications/job/:job_id
router.get('/job/:job_id', authenticate, requireRole('employer'), async (req, res) => {
    try {
        const [jobs] = await pool.query('SELECT * FROM jobs WHERE job_id = ? AND employer_id = ?', [parseInt(req.params.job_id), req.user.user_id]);
        if (jobs.length === 0) return res.status(404).json({ error: 'Job not found or access denied' });

        const [applicants] = await pool.query(`SELECT a.*, u.name as applicant_name, u.email as applicant_email,
            u.phone as applicant_phone, ep.*
            FROM applications a JOIN users u ON a.employee_id = u.user_id
            LEFT JOIN employee_profiles ep ON a.employee_id = ep.user_id
            WHERE a.job_id = ? ORDER BY a.applied_at DESC`, [parseInt(req.params.job_id)]);
        res.json({ applicants, job: jobs[0] });
    } catch (err) {
        console.error('Get job applicants error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/applications/employer/all
router.get('/employer/all', authenticate, requireRole('employer'), async (req, res) => {
    try {
        const [applicants] = await pool.query(`SELECT a.*, j.title as job_title, j.job_id,
            u.name as applicant_name, u.email as applicant_email,
            u.phone as applicant_phone
            FROM applications a JOIN jobs j ON a.job_id = j.job_id
            JOIN users u ON a.employee_id = u.user_id
            WHERE j.employer_id = ? ORDER BY j.title, a.applied_at DESC`, [req.user.user_id]);
        res.json({ applicants });
    } catch (err) {
        console.error('Get all employer applicants error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT /api/applications/:id/status
router.put('/:id/status', authenticate, requireRole('employer'), async (req, res) => {
    try {
        const { status } = req.body;
        if (!status || !['accepted', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Status must be accepted or rejected' });
        }

        const [applications] = await pool.query(`SELECT a.*, j.employer_id, j.title, j.max_workers, j.status as job_status FROM applications a
            JOIN jobs j ON a.job_id = j.job_id
            WHERE a.application_id = ? AND j.employer_id = ?`, [parseInt(req.params.id), req.user.user_id]);
            
        if (applications.length === 0) return res.status(404).json({ error: 'Application not found or access denied' });
        
        const app = applications[0];

        // Block accepting if job is already closed/filled
        if (status === 'accepted' && app.job_status === 'closed') {
            return res.status(400).json({ error: 'Cannot accept — this job has already reached its required number of workers.' });
        }

        await pool.query("UPDATE applications SET status = ? WHERE application_id = ?", [status, parseInt(req.params.id)]);
        
        // ── Auto-create contract when application is accepted ──
        if (status === 'accepted') {
            try {
                await pool.query(
                    `INSERT IGNORE INTO contracts (application_id, job_id, employee_id, employer_id, job_mode)
                     VALUES (?, ?, ?, ?, 'offline')`,
                    [parseInt(req.params.id), app.job_id, app.employee_id, req.user.user_id]
                );
            } catch (contractErr) {
                console.error('Auto-create contract warning:', contractErr.message);
            }

            // ── Auto-close job if capacity reached ──
            if (app.max_workers) {
                const [countRows] = await pool.query(
                    "SELECT COUNT(*) as cnt FROM contracts WHERE job_id = ? AND status = 'active'",
                    [app.job_id]
                );
                if (countRows[0].cnt >= app.max_workers) {
                    await pool.query("UPDATE jobs SET status = 'closed' WHERE job_id = ?", [app.job_id]);
                    // Notify employer that capacity is reached
                    await pool.query(
                        'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                        [req.user.user_id, `🎉 Your job "${app.title}" has reached the required ${app.max_workers} worker(s)! The job has been automatically closed for new applications.`]
                    );
                }
            }
        }

        // Notify employee
        await pool.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)', 
            [app.employee_id, `Your application for ${app.title} was ${status}.`]);
            
        const [updated] = await pool.query('SELECT * FROM applications WHERE application_id = ?', [parseInt(req.params.id)]);
        res.json({ application: updated[0] });
    } catch (err) {
        console.error('Update application error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
