const express = require('express');
const router = express.Router();
const { pool } = require('../db/init');
const { authenticate, requireRole } = require('../middleware/auth');

// ─── GET /api/notifications — all notifications for current user ──
router.get('/', authenticate, async (req, res) => {
    try {
        const [notifications] = await pool.query(
            'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30',
            [req.user.user_id]
        );
        const unreadCount = notifications.filter(n => !n.is_read).length;
        res.json({ notifications, unreadCount });
    } catch (err) {
        console.error('Get notifications error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── PUT /api/notifications/read-all ──
router.put('/read-all', authenticate, async (req, res) => {
    try {
        await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = ?', [req.user.user_id]);
        res.json({ message: 'All notifications marked as read' });
    } catch (err) {
        console.error('Mark read error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── PUT /api/notifications/:id/read ──
router.put('/:id/read', authenticate, async (req, res) => {
    try {
        await pool.query(
            'UPDATE notifications SET is_read = TRUE WHERE notification_id = ? AND user_id = ?',
            [parseInt(req.params.id), req.user.user_id]
        );
        res.json({ message: 'Notification marked as read' });
    } catch (err) {
        console.error('Mark single read error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── GET /api/notifications/previous-workers — employer's past employees ──
router.get('/previous-workers', authenticate, requireRole('employer'), async (req, res) => {
    try {
        const [workers] = await pool.query(`
            SELECT DISTINCT u.user_id, u.name, u.email, u.phone, u.location,
                   ep.skills, ep.experience, ep.education,
                   (SELECT AVG(rating) FROM employee_ratings WHERE employee_id = u.user_id) AS avg_rating,
                   (SELECT COUNT(*) FROM contracts WHERE employee_id = u.user_id AND employer_id = ?) AS contracts_count,
                   (SELECT COUNT(*) FROM attendance a JOIN contracts c ON a.contract_id = c.contract_id
                    WHERE c.employee_id = u.user_id AND c.employer_id = ?) AS total_days_worked,
                   (SELECT j2.title FROM contracts c2 JOIN jobs j2 ON c2.job_id = j2.job_id
                    WHERE c2.employee_id = u.user_id AND c2.employer_id = ?
                    ORDER BY c2.created_at DESC LIMIT 1) AS last_job_title
            FROM contracts c
            JOIN users u ON c.employee_id = u.user_id
            LEFT JOIN employee_profiles ep ON u.user_id = ep.user_id
            WHERE c.employer_id = ?
            ORDER BY contracts_count DESC
        `, [req.user.user_id, req.user.user_id, req.user.user_id, req.user.user_id]);

        res.json({ workers });
    } catch (err) {
        console.error('Previous workers error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── GET /api/notifications/worker/:id/detail — worker's full profile + history ──
router.get('/worker/:id/detail', authenticate, requireRole('employer'), async (req, res) => {
    try {
        const workerId = parseInt(req.params.id);

        // Verify this worker has contracts with this employer
        const [check] = await pool.query(
            'SELECT COUNT(*) AS cnt FROM contracts WHERE employee_id = ? AND employer_id = ?',
            [workerId, req.user.user_id]
        );
        if (check[0].cnt === 0) {
            return res.status(403).json({ error: 'This worker has not worked with you.' });
        }

        // Full profile
        const [userRows] = await pool.query(
            `SELECT u.user_id, u.name, u.email, u.phone, u.location,
                    ep.skills, ep.experience, ep.education
             FROM users u LEFT JOIN employee_profiles ep ON u.user_id = ep.user_id
             WHERE u.user_id = ?`, [workerId]
        );
        if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });
        const profile = userRows[0];

        // Work history with this employer
        const [history] = await pool.query(`
            SELECT c.contract_id, c.participation_status, c.created_at,
                   j.title AS job_title, j.location AS job_location, j.salary,
                   (SELECT COUNT(*) FROM attendance WHERE contract_id = c.contract_id) AS days_attended
            FROM contracts c
            JOIN jobs j ON c.job_id = j.job_id
            WHERE c.employee_id = ? AND c.employer_id = ?
            ORDER BY c.created_at DESC
        `, [workerId, req.user.user_id]);

        // Rating
        const [ratingRows] = await pool.query(
            'SELECT AVG(rating) AS avg_rating, COUNT(*) AS review_count FROM employee_ratings WHERE employee_id = ?',
            [workerId]
        );

        res.json({
            profile,
            history,
            rating: {
                avg: ratingRows[0].avg_rating ? Number(ratingRows[0].avg_rating).toFixed(1) : null,
                count: ratingRows[0].review_count
            }
        });
    } catch (err) {
        console.error('Worker detail error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── POST /api/notifications/send-offer — employer sends structured job offer ──
router.post('/send-offer', authenticate, requireRole('employer'), async (req, res) => {
    try {
        const { worker_id, job_id, message } = req.body;
        if (!worker_id || !job_id) {
            return res.status(400).json({ error: 'worker_id and job_id are required' });
        }

        // Verify worker has contracts with employer
        const [check] = await pool.query(
            'SELECT COUNT(*) AS cnt FROM contracts WHERE employee_id = ? AND employer_id = ?',
            [worker_id, req.user.user_id]
        );
        if (check[0].cnt === 0) {
            return res.status(403).json({ error: 'You can only send offers to your previous workers.' });
        }

        // Verify job belongs to this employer
        const [jobRows] = await pool.query(
            'SELECT job_id, title FROM jobs WHERE job_id = ? AND employer_id = ?',
            [job_id, req.user.user_id]
        );
        if (jobRows.length === 0) {
            return res.status(403).json({ error: 'You can only offer your own jobs.' });
        }

        // Check for existing active contract for this job+worker
        const [existingContract] = await pool.query(
            "SELECT contract_id FROM contracts WHERE job_id = ? AND employee_id = ? AND status = 'active'",
            [job_id, worker_id]
        );
        if (existingContract.length > 0) {
            return res.status(400).json({ error: 'This worker already has an active contract for this job.' });
        }

        // Insert job offer
        try {
            await pool.query(
                'INSERT INTO job_offers (employer_id, employee_id, job_id, message) VALUES (?, ?, ?, ?)',
                [req.user.user_id, worker_id, job_id, message || null]
            );
        } catch (dupErr) {
            if (dupErr.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'You have already sent an offer for this job to this worker.' });
            }
            throw dupErr;
        }

        // Send notification to worker
        const [empRow] = await pool.query('SELECT name FROM users WHERE user_id = ?', [req.user.user_id]);
        const employerName = empRow[0]?.name || 'An employer';
        const jobTitle = jobRows[0].title;

        let notifMsg = `📋 ${employerName} is offering you a position for "${jobTitle}"!`;
        if (message) notifMsg += ` — "${message}"`;
        notifMsg += ` [View in Job Offers]`;

        await pool.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [worker_id, notifMsg]
        );

        res.json({ message: `Job offer sent to the worker for "${jobTitle}"!` });
    } catch (err) {
        console.error('Send offer error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── GET /api/notifications/offers — job seeker's pending offers ──
router.get('/offers', authenticate, async (req, res) => {
    try {
        const [offers] = await pool.query(`
            SELECT o.offer_id, o.job_id, o.employer_id, o.message, o.status, o.created_at, o.responded_at,
                   j.title AS job_title, j.description AS job_description, j.location AS job_location,
                   j.salary, j.job_type, j.skills_required,
                   u.name AS employer_name, u.email AS employer_email,
                   ep.company_name, ep.company_location
            FROM job_offers o
            JOIN jobs j ON o.job_id = j.job_id
            JOIN users u ON o.employer_id = u.user_id
            LEFT JOIN employer_profiles ep ON o.employer_id = ep.user_id
            WHERE o.employee_id = ?
            ORDER BY o.created_at DESC
        `, [req.user.user_id]);

        res.json({ offers });
    } catch (err) {
        console.error('Get offers error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── POST /api/notifications/offers/:id/respond — accept or decline ──
router.post('/offers/:id/respond', authenticate, async (req, res) => {
    try {
        const offerId = parseInt(req.params.id);
        const { action } = req.body; // 'accept' or 'decline'

        if (!['accept', 'decline'].includes(action)) {
            return res.status(400).json({ error: 'Action must be "accept" or "decline"' });
        }

        // Get offer
        const [offerRows] = await pool.query(
            'SELECT * FROM job_offers WHERE offer_id = ? AND employee_id = ?',
            [offerId, req.user.user_id]
        );
        if (offerRows.length === 0) return res.status(404).json({ error: 'Offer not found' });

        const offer = offerRows[0];
        if (offer.status !== 'pending') {
            return res.status(400).json({ error: `This offer has already been ${offer.status}.` });
        }

        const newStatus = action === 'accept' ? 'accepted' : 'declined';

        // Update offer status
        await pool.query(
            'UPDATE job_offers SET status = ?, responded_at = NOW() WHERE offer_id = ?',
            [newStatus, offerId]
        );

        const [jobRow] = await pool.query('SELECT title, max_workers, employer_id FROM jobs WHERE job_id = ?', [offer.job_id]);
        const jobTitle = jobRow[0]?.title || 'a job';

        // If accepted — auto-create contract (no need to reapply)
        if (action === 'accept') {
            try {
                // Check for existing active contract to avoid duplicates
                const [existingContract] = await pool.query(
                    "SELECT contract_id FROM contracts WHERE job_id = ? AND employee_id = ? AND status = 'active'",
                    [offer.job_id, req.user.user_id]
                );
                if (existingContract.length === 0) {
                    await pool.query(
                        `INSERT INTO contracts (job_id, employee_id, employer_id, job_mode)
                         VALUES (?, ?, ?, 'offline')`,
                        [offer.job_id, req.user.user_id, offer.employer_id]
                    );
                }
            } catch (contractErr) {
                console.error('Auto-create contract on accept error:', contractErr.message);
            }

            // ── Auto-close job if capacity reached ──
            const maxWorkers = jobRow[0]?.max_workers;
            if (maxWorkers) {
                const [countRows] = await pool.query(
                    "SELECT COUNT(*) as cnt FROM contracts WHERE job_id = ? AND status = 'active'",
                    [offer.job_id]
                );
                if (countRows[0].cnt >= maxWorkers) {
                    await pool.query("UPDATE jobs SET status = 'closed' WHERE job_id = ?", [offer.job_id]);
                    await pool.query(
                        'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                        [offer.employer_id, `🎉 Your job "${jobTitle}" has reached the required ${maxWorkers} worker(s)! The job has been automatically closed for new applications.`]
                    );
                }
            }

            // Notify employer
            const [empName] = await pool.query('SELECT name FROM users WHERE user_id = ?', [req.user.user_id]);
            await pool.query(
                'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                [offer.employer_id, `✅ ${empName[0]?.name || 'A worker'} accepted your offer for "${jobTitle}"!`]
            );

            res.json({ message: `Offer accepted! You are now assigned to "${jobTitle}".` });
        } else {
            // Notify employer about decline
            const [empName] = await pool.query('SELECT name FROM users WHERE user_id = ?', [req.user.user_id]);
            await pool.query(
                'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                [offer.employer_id, `❌ ${empName[0]?.name || 'A worker'} declined your offer for "${jobTitle}".`]
            );

            res.json({ message: `Offer for "${jobTitle}" declined.` });
        }
    } catch (err) {
        console.error('Respond to offer error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
