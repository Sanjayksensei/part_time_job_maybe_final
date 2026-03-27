const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const QRCode = require('qrcode');
const { pool } = require('../db/init');
const { authenticate, requireRole } = require('../middleware/auth');

// ─── Helper: base contract query with JOINs ──────────────────
const CONTRACT_SELECT = `
    SELECT c.contract_id, c.application_id, c.job_id, c.employee_id, c.employer_id,
           c.job_mode, c.status, c.participation_status, c.created_at,
           j.title AS job_title, j.description AS job_description, j.location AS job_location,
           j.salary, j.job_type, j.skills_required, j.allow_resignation, j.start_time, j.end_time,
           emp_u.name AS employee_name, emp_u.email AS employee_email,
           emp_u.phone AS employee_phone, emp_u.location AS employee_location,
           er_u.name AS employer_name, er_u.email AS employer_email,
           ep.company_name, ep.company_location
    FROM contracts c
    JOIN jobs j ON c.job_id = j.job_id
    JOIN users emp_u ON c.employee_id = emp_u.user_id
    JOIN users er_u ON c.employer_id = er_u.user_id
    LEFT JOIN employer_profiles ep ON c.employer_id = ep.user_id
`;

// ─── GET /api/tokens/mine — job seeker's contracts ───────────
router.get('/mine', authenticate, async (req, res) => {
    try {
        const [contracts] = await pool.query(
            CONTRACT_SELECT + ' WHERE c.employee_id = ? ORDER BY c.created_at DESC',
            [req.user.user_id]
        );

        const today = new Date().toISOString().slice(0, 10);
        for (const c of contracts) {
            const [att] = await pool.query(
                'SELECT COUNT(*) AS count FROM attendance WHERE contract_id = ?', [c.contract_id]
            );
            c.attendance_count = att[0].count;

            // Check today's attendance
            const [todayAtt] = await pool.query(
                'SELECT * FROM attendance WHERE contract_id = ? AND date = ?', [c.contract_id, today]
            );
            c.today_marked = todayAtt.length > 0;

            // Count co-workers on same job
            const [coworkers] = await pool.query(
                'SELECT COUNT(*) AS count FROM contracts WHERE job_id = ? AND status = ?',
                [c.job_id, 'active']
            );
            c.total_employees = coworkers[0].count;
        }

        res.json({ contracts });
    } catch (err) {
        console.error('Get employee contracts error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── GET /api/tokens/employer — employer's contracts grouped by job ──
router.get('/employer', authenticate, async (req, res) => {
    try {
        const [contracts] = await pool.query(
            CONTRACT_SELECT + ' WHERE c.employer_id = ? ORDER BY j.job_id DESC, c.created_at DESC',
            [req.user.user_id]
        );

        const today = new Date().toISOString().slice(0, 10);

        // Group contracts by job
        const jobMap = {};
        for (const c of contracts) {
            if (!jobMap[c.job_id]) {
                jobMap[c.job_id] = {
                    job_id: c.job_id,
                    job_title: c.job_title,
                    job_location: c.job_location,
                    job_mode: c.job_mode,
                    salary: c.salary,
                    job_type: c.job_type,
                    skills_required: c.skills_required,
                    allow_resignation: c.allow_resignation,
                    start_time: c.start_time,
                    end_time: c.end_time,
                    employees: []
                };
            }

            // Get today's attendance for this employee
            const [todayAtt] = await pool.query(
                'SELECT * FROM attendance WHERE contract_id = ? AND date = ?', [c.contract_id, today]
            );
            // Get total attendance
            const [totalAtt] = await pool.query(
                'SELECT COUNT(*) AS count FROM attendance WHERE contract_id = ?', [c.contract_id]
            );

            jobMap[c.job_id].employees.push({
                contract_id: c.contract_id,
                employee_id: c.employee_id,
                employee_name: c.employee_name,
                employee_email: c.employee_email,
                employee_phone: c.employee_phone,
                participation_status: c.participation_status,
                today_present: todayAtt.length > 0,
                total_attendance: totalAtt[0].count,
                created_at: c.created_at
            });
        }

        // Check if QR has been generated for each job
        const jobIds = Object.keys(jobMap);
        for (const jid of jobIds) {
            const [jobRow] = await pool.query('SELECT qr_token FROM jobs WHERE job_id = ?', [jid]);
            jobMap[jid].has_qr = !!(jobRow[0] && jobRow[0].qr_token);
        }

        res.json({ jobs: Object.values(jobMap) });
    } catch (err) {
        console.error('Get employer contracts error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── GET /api/tokens/:id — contract detail ────────────────────
router.get('/:id', authenticate, async (req, res) => {
    try {
        const [rows] = await pool.query(
            CONTRACT_SELECT + ' WHERE c.contract_id = ? AND (c.employee_id = ? OR c.employer_id = ?)',
            [req.params.id, req.user.user_id, req.user.user_id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Contract not found' });

        const contract = rows[0];
        const [attendance] = await pool.query(
            'SELECT * FROM attendance WHERE contract_id = ? ORDER BY date DESC', [contract.contract_id]
        );
        contract.attendance = attendance;

        res.json({ contract });
    } catch (err) {
        console.error('Get contract detail error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── POST /api/tokens/job/:jobId/qr — employer generates QR per JOB ──
router.post('/job/:jobId/qr', authenticate, async (req, res) => {
    try {
        const jobId = parseInt(req.params.jobId);

        // Verify job belongs to this employer
        const [jobs] = await pool.query(
            'SELECT * FROM jobs WHERE job_id = ? AND employer_id = ?', [jobId, req.user.user_id]
        );
        if (jobs.length === 0) return res.status(404).json({ error: 'Job not found' });

        // Generate unique QR token for this job
        const qrToken = crypto.randomUUID();
        await pool.query('UPDATE jobs SET qr_token = ? WHERE job_id = ?', [qrToken, jobId]);

        // Generate QR image — payload contains job_id + token
        const qrPayload = JSON.stringify({ job_id: jobId, token: qrToken });
        const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 300, margin: 2 });

        res.json({ qr_data_url: qrDataUrl, qr_token: qrToken });
    } catch (err) {
        console.error('Generate job QR error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── POST /api/tokens/attendance/scan — employee scans QR (shared per job) ──
router.post('/attendance/scan', authenticate, async (req, res) => {
    try {
        const { job_id, token } = req.body;
        if (!job_id || !token) return res.status(400).json({ error: 'job_id and token are required' });

        // Validate QR token against job
        const [jobs] = await pool.query(
            'SELECT * FROM jobs WHERE job_id = ? AND qr_token = ?', [job_id, token]
        );
        if (jobs.length === 0) {
            return res.status(400).json({ error: 'Invalid QR code. Please scan the correct code from your employer.' });
        }

        // Find this employee's contract for this job
        const [contracts] = await pool.query(
            'SELECT * FROM contracts WHERE job_id = ? AND employee_id = ?',
            [job_id, req.user.user_id]
        );
        if (contracts.length === 0) {
            return res.status(404).json({ error: 'You do not have a contract for this job.' });
        }

        const contract = contracts[0];

        if (contract.status !== 'active') {
            return res.status(400).json({ error: 'This contract is no longer active.' });
        }
        if (contract.participation_status === 'resigned') {
            return res.status(400).json({ error: 'You have resigned from this job. Attendance cannot be marked.' });
        }

        // Mark attendance for today
        const today = new Date().toISOString().slice(0, 10);
        try {
            await pool.query(
                'INSERT INTO attendance (contract_id, employee_id, method, date) VALUES (?, ?, ?, ?)',
                [contract.contract_id, req.user.user_id, 'qr_scan', today]
            );
        } catch (dupErr) {
            if (dupErr.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'Attendance already marked for today.' });
            }
            throw dupErr;
        }

        // Regenerate QR token after scan for security
        const newToken = crypto.randomUUID();
        await pool.query('UPDATE jobs SET qr_token = ? WHERE job_id = ?', [newToken, job_id]);

        res.json({ message: 'Attendance marked successfully!', date: today, employee_name: req.user.name });
    } catch (err) {
        console.error('Scan attendance error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── POST /api/tokens/:id/resign — employee resigns from contract ──
router.post('/:id/resign', authenticate, async (req, res) => {
    try {
        const contractId = parseInt(req.params.id);

        // Get contract with job info
        const [rows] = await pool.query(
            `SELECT c.*, j.allow_resignation FROM contracts c
             JOIN jobs j ON c.job_id = j.job_id
             WHERE c.contract_id = ? AND c.employee_id = ?`,
            [contractId, req.user.user_id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Contract not found' });

        const contract = rows[0];

        if (contract.participation_status === 'resigned') {
            return res.status(400).json({ error: 'You have already resigned from this job.' });
        }
        if (!contract.allow_resignation) {
            return res.status(403).json({ error: 'Resignation is not allowed for this job.' });
        }

        await pool.query(
            'UPDATE contracts SET participation_status = ? WHERE contract_id = ?',
            ['resigned', contractId]
        );

        // Notify employer
        const [empUser] = await pool.query('SELECT name FROM users WHERE user_id = ?', [req.user.user_id]);
        const [jobRow] = await pool.query('SELECT title FROM jobs WHERE job_id = ?', [contract.job_id]);
        await pool.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [contract.employer_id, `${empUser[0].name} has resigned from "${jobRow[0].title}".`]
        );

        res.json({ message: 'You have resigned from this job.' });
    } catch (err) {
        console.error('Resign error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── GET /api/tokens/job/:jobId/employees — all employees for a job ──
router.get('/job/:jobId/employees', authenticate, async (req, res) => {
    try {
        const jobId = parseInt(req.params.jobId);
        const today = new Date().toISOString().slice(0, 10);

        const [employees] = await pool.query(`
            SELECT c.contract_id, c.employee_id, c.participation_status, c.created_at,
                   u.name AS employee_name, u.email AS employee_email, u.phone AS employee_phone,
                   (SELECT COUNT(*) FROM attendance WHERE contract_id = c.contract_id) AS total_attendance,
                   (SELECT COUNT(*) FROM attendance WHERE contract_id = c.contract_id AND date = ?) AS today_present
            FROM contracts c
            JOIN users u ON c.employee_id = u.user_id
            WHERE c.job_id = ? AND c.status = 'active'
            ORDER BY c.created_at ASC
        `, [today, jobId]);

        res.json({ employees });
    } catch (err) {
        console.error('Get job employees error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── GET /api/tokens/:id/attendance — attendance records ────────
router.get('/:id/attendance', authenticate, async (req, res) => {
    try {
        const contractId = parseInt(req.params.id);

        const [rows] = await pool.query(
            'SELECT contract_id FROM contracts WHERE contract_id = ? AND (employee_id = ? OR employer_id = ?)',
            [contractId, req.user.user_id, req.user.user_id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Contract not found' });

        const [attendance] = await pool.query(
            'SELECT * FROM attendance WHERE contract_id = ? ORDER BY date DESC', [contractId]
        );

        res.json({ attendance });
    } catch (err) {
        console.error('Get attendance error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
