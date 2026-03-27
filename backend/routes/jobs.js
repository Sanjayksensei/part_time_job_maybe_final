const express = require('express');
const router = express.Router();
const { pool } = require('../db/init');
const { authenticate, requireRole, optionalAuthenticate } = require('../middleware/auth');

// GET /api/jobs — all jobs (public)
router.get('/', optionalAuthenticate, async (req, res) => {
    try {
        const { category, location, search } = req.query;
        let sql = `SELECT j.*, jc.category_name, u.name as employer_name,
            ep.company_name, ep.company_description,
            (SELECT COUNT(*) FROM contracts WHERE job_id = j.job_id AND status = 'active') as hired_count
            FROM jobs j 
            LEFT JOIN job_category_mapping jcm ON j.job_id = jcm.job_id
            LEFT JOIN job_categories jc ON jcm.category_id = jc.category_id
            LEFT JOIN users u ON j.employer_id = u.user_id
            LEFT JOIN employer_profiles ep ON j.employer_id = ep.user_id WHERE j.status = 'open'`;
        const params = [];

        if (req.user && req.user.role === 'employee') {
            sql += ` AND j.job_id NOT IN (SELECT job_id FROM applications WHERE employee_id = ?)`;
            params.push(req.user.user_id);
        }

        if (category && category !== 'All') {
            sql += ' AND jc.category_name = ?';
            params.push(category);
        }
        if (location && location !== 'All Locations') {
            sql += ' AND j.location LIKE ?';
            params.push(`%${location}%`);
        }
        if (search) {
            sql += ' AND (j.title LIKE ? OR j.description LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        sql += ' ORDER BY j.created_at DESC';
        
        const [jobs] = await pool.query(sql, params);
        res.json({ jobs });
    } catch (err) {
        console.error('Get jobs error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// IMPORTANT: Specific sub-routes MUST come before /:id wildcard

// GET /api/jobs/locations
router.get('/locations', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT DISTINCT TRIM(location) as location FROM jobs WHERE location IS NOT NULL AND location != ""');
        const uniqueLocations = [...new Set(rows.map(r => r.location.toLowerCase()))]
                                .map(l => rows.find(r => r.location.toLowerCase() === l).location);
        uniqueLocations.sort((a, b) => a.localeCompare(b));
        res.json({ locations: uniqueLocations });
    } catch (err) {
        console.error('Get locations error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/jobs/saved/list
router.get('/saved/list', authenticate, requireRole('employee'), async (req, res) => {
    try {
        const [jobs] = await pool.query(`
            SELECT j.*, jc.category_name, u.name as employer_name, ep.company_name
            FROM saved_jobs sj
            JOIN jobs j ON sj.job_id = j.job_id
            LEFT JOIN job_category_mapping jcm ON j.job_id = jcm.job_id
            LEFT JOIN job_categories jc ON jcm.category_id = jc.category_id
            LEFT JOIN users u ON j.employer_id = u.user_id
            LEFT JOIN employer_profiles ep ON j.employer_id = ep.user_id
            WHERE sj.employee_id = ? ORDER BY sj.saved_at DESC
        `, [req.user.user_id]);
        res.json({ jobs });
    } catch (err) {
        console.error('Get saved jobs error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/jobs/employer/mine
router.get('/employer/mine', authenticate, requireRole('employer'), async (req, res) => {
    try {
        const [jobs] = await pool.query(`SELECT j.*, jc.category_name,
            (SELECT COUNT(*) FROM applications WHERE job_id = j.job_id) as applicant_count,
            (SELECT COUNT(*) FROM contracts WHERE job_id = j.job_id AND status = 'active') as hired_count
            FROM jobs j 
            LEFT JOIN job_category_mapping jcm ON j.job_id = jcm.job_id
            LEFT JOIN job_categories jc ON jcm.category_id = jc.category_id
            WHERE j.employer_id = ? ORDER BY j.created_at DESC`, [req.user.user_id]);
        res.json({ jobs });
    } catch (err) {
        console.error('Get employer jobs error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/jobs/:id
// GET /api/jobs/calendar/employer
router.get('/calendar/employer', authenticate, requireRole('employer'), async (req, res) => {
    try {
        const [jobs] = await pool.query(`
            SELECT job_id, title, job_date, end_date, start_time, end_time, location, salary 
            FROM jobs 
            WHERE employer_id = ? 
            ORDER BY job_date ASC
        `, [req.user.user_id]);
        res.json({ jobs });
    } catch (err) {
        console.error('Employer calendar error:', err);
        res.status(500).json({ error: 'Server error fetching calendar' });
    }
});

// GET /api/jobs/calendar/employee
router.get('/calendar/employee', authenticate, requireRole('employee'), async (req, res) => {
    try {
        const [jobs] = await pool.query(`
            SELECT j.job_id, j.title, j.job_date, j.end_date, j.start_time, j.end_time, j.location, j.salary, a.status as application_status
            FROM jobs j
            JOIN applications a ON j.job_id = a.job_id
            WHERE a.employee_id = ? AND a.status IN ('accepted', 'pending')
            ORDER BY j.job_date ASC
        `, [req.user.user_id]);
        res.json({ jobs });
    } catch (err) {
        console.error('Employee calendar error:', err);
        res.status(500).json({ error: 'Server error fetching calendar' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const [jobs] = await pool.query(`SELECT j.*, jc.category_name, u.name as employer_name,
            ep.company_name, ep.company_description,
            (SELECT COUNT(*) FROM contracts WHERE job_id = j.job_id AND status = 'active') as hired_count
            FROM jobs j 
            LEFT JOIN job_category_mapping jcm ON j.job_id = jcm.job_id
            LEFT JOIN job_categories jc ON jcm.category_id = jc.category_id
            LEFT JOIN users u ON j.employer_id = u.user_id
            LEFT JOIN employer_profiles ep ON j.employer_id = ep.user_id
            WHERE j.job_id = ?`, [parseInt(req.params.id)]);
            
        if (jobs.length === 0) return res.status(404).json({ error: 'Job not found' });
        res.json({ job: jobs[0] });
    } catch (err) {
        console.error('Get job error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/jobs
router.post('/', authenticate, requireRole('employer'), async (req, res) => {
    try {
        const { title, description, location, salary, job_type, skills_required, category_id, allow_resignation, max_workers, job_date, end_date, start_time, end_time } = req.body;
        if (!title || !description) return res.status(400).json({ error: 'Title and description are required' });

        const [result] = await pool.query(
            `INSERT INTO jobs (employer_id, title, description, location, salary, job_type, skills_required, allow_resignation, max_workers, job_date, end_date, start_time, end_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.user.user_id, title, description, location || null, salary || null, job_type || 'part-time', skills_required || null, allow_resignation !== false ? 1 : 0, max_workers || null, job_date || null, end_date || job_date || null, start_time || null, end_time || null]
        );

        if (category_id) {
            await pool.query('INSERT INTO job_category_mapping (job_id, category_id) VALUES (?, ?)', [result.insertId, category_id]);
        }

        const [jobs] = await pool.query(`SELECT j.*, jc.category_name, u.name as employer_name, ep.company_name
            FROM jobs j
            LEFT JOIN job_category_mapping jcm ON j.job_id = jcm.job_id
            LEFT JOIN job_categories jc ON jcm.category_id = jc.category_id
            LEFT JOIN users u ON j.employer_id = u.user_id
            LEFT JOIN employer_profiles ep ON j.employer_id = ep.user_id
            WHERE j.job_id = ?`, [result.insertId]);
        res.status(201).json({ job: jobs[0] });
    } catch (err) {
        console.error('Post job error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT /api/jobs/:id
router.put('/:id', authenticate, requireRole('employer'), async (req, res) => {
    try {
        const [existing] = await pool.query('SELECT * FROM jobs WHERE job_id = ? AND employer_id = ?', [parseInt(req.params.id), req.user.user_id]);
        if (existing.length === 0) return res.status(404).json({ error: 'Job not found or access denied' });

        const { title, description, location, salary, job_type, skills_required, category_id, job_date, end_date, start_time, end_time } = req.body;
        const ex = existing[0];
        
        await pool.query(
            `UPDATE jobs SET title=?, description=?, location=?, salary=?, job_type=?, skills_required=?, job_date=?, end_date=?, start_time=?, end_time=? WHERE job_id=?`,
            [
                title || ex.title, 
                description || ex.description, 
                location || ex.location,
                salary !== undefined ? salary : ex.salary, 
                job_type || ex.job_type, 
                skills_required || ex.skills_required,
                job_date !== undefined ? job_date : ex.job_date,
                end_date !== undefined ? end_date : ex.end_date,
                start_time !== undefined ? start_time : ex.start_time,
                end_time !== undefined ? end_time : ex.end_time,
                parseInt(req.params.id)
            ]
        );

        if (category_id) {
            await pool.query('DELETE FROM job_category_mapping WHERE job_id = ?', [parseInt(req.params.id)]);
            await pool.query('INSERT INTO job_category_mapping (job_id, category_id) VALUES (?, ?)', [parseInt(req.params.id), category_id]);
        }

        const [jobs] = await pool.query('SELECT * FROM jobs WHERE job_id = ?', [parseInt(req.params.id)]);
        res.json({ job: jobs[0] });
    } catch (err) {
        console.error('Update job error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/jobs/:id
router.delete('/:id', authenticate, requireRole('employer'), async (req, res) => {
    try {
        const [existing] = await pool.query('SELECT * FROM jobs WHERE job_id = ? AND employer_id = ?', [parseInt(req.params.id), req.user.user_id]);
        if (existing.length === 0) return res.status(404).json({ error: 'Job not found or access denied' });
        
        await pool.query("DELETE FROM jobs WHERE job_id = ?", [parseInt(req.params.id)]);
        res.json({ message: 'Job deleted successfully' });
    } catch (err) {
        console.error('Delete job error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/jobs/:id/save
router.post('/:id/save', authenticate, requireRole('employee'), async (req, res) => {
    try {
        const jobId = parseInt(req.params.id);
        // Check if job exists
        const [jobCheck] = await pool.query('SELECT job_id FROM jobs WHERE job_id = ?', [jobId]);
        if (jobCheck.length === 0) return res.status(404).json({ error: 'Job not found' });

        const [existing] = await pool.query('SELECT * FROM saved_jobs WHERE employee_id = ? AND job_id = ?', [req.user.user_id, jobId]);
        if (existing.length > 0) return res.status(400).json({ error: 'Job already saved' });

        await pool.query('INSERT INTO saved_jobs (employee_id, job_id) VALUES (?, ?)', [req.user.user_id, jobId]);
        res.json({ message: 'Job saved successfully' });
    } catch (err) {
        console.error('Save job error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/jobs/:id/save — unsave a job
router.delete('/:id/save', authenticate, requireRole('employee'), async (req, res) => {
    try {
        await pool.query('DELETE FROM saved_jobs WHERE employee_id = ? AND job_id = ?', [req.user.user_id, parseInt(req.params.id)]);
        res.json({ message: 'Job removed from saved list' });
    } catch (err) {
        console.error('Unsave job error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
