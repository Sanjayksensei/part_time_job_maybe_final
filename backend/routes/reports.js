const express = require('express');
const router = express.Router();
const { pool } = require('../db/init');
const { authenticate } = require('../middleware/auth');

// ─── POST /api/reports — submit a report ──────────────────────
router.post('/', authenticate, async (req, res) => {
    try {
        const { reported_id, job_id, contract_id, reason, description } = req.body;

        if (!reported_id || !reason) {
            return res.status(400).json({ error: 'reported_id and reason are required' });
        }

        // Cannot report yourself
        if (parseInt(reported_id) === req.user.user_id) {
            return res.status(400).json({ error: 'You cannot report yourself.' });
        }

        // Verify reported user exists
        const [userRows] = await pool.query('SELECT user_id, name FROM users WHERE user_id = ?', [reported_id]);
        if (userRows.length === 0) {
            return res.status(404).json({ error: 'Reported user not found.' });
        }

        // Check for duplicate recent report (same reporter, reported, and reason within 24h)
        const [existing] = await pool.query(
            `SELECT report_id FROM reports
             WHERE reporter_id = ? AND reported_id = ? AND reason = ?
             AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
            [req.user.user_id, reported_id, reason]
        );
        if (existing.length > 0) {
            return res.status(400).json({ error: 'You have already submitted a similar report recently.' });
        }

        // Insert report
        await pool.query(
            `INSERT INTO reports (reporter_id, reported_id, job_id, contract_id, reason, description)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                req.user.user_id,
                reported_id,
                job_id || null,
                contract_id || null,
                reason,
                description || null
            ]
        );

        res.status(201).json({ message: 'Report submitted successfully. We will review it shortly.' });
    } catch (err) {
        console.error('Submit report error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── GET /api/reports/mine — current user's submitted reports ──
router.get('/mine', authenticate, async (req, res) => {
    try {
        const [reports] = await pool.query(
            `SELECT r.*, u.name AS reported_name, u.email AS reported_email
             FROM reports r
             JOIN users u ON r.reported_id = u.user_id
             WHERE r.reporter_id = ?
             ORDER BY r.created_at DESC`,
            [req.user.user_id]
        );
        res.json({ reports });
    } catch (err) {
        console.error('Get reports error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
