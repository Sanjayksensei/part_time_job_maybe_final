const express = require('express');
const router = express.Router();
const { pool } = require('../db/init');
const { authenticate } = require('../middleware/auth');

// GET /api/reviews/received
router.get('/received', authenticate, async (req, res) => {
    try {
        const [reviews] = await pool.query(`SELECT r.*, u.name as reviewer_name, u.role as reviewer_role,
            ep.company_name as reviewer_company
            FROM reviews r JOIN users u ON r.reviewer_id = u.user_id
            LEFT JOIN employer_profiles ep ON r.reviewer_id = ep.user_id
            WHERE r.reviewee_id = ? ORDER BY r.created_at DESC`, [req.user.user_id]);
        res.json({ reviews });
    } catch (err) {
        console.error('Get received reviews error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/reviews/given
router.get('/given', authenticate, async (req, res) => {
    try {
        const [reviews] = await pool.query(`SELECT r.*, u.name as reviewee_name, u.role as reviewee_role,
            ep.company_name as reviewee_company
            FROM reviews r JOIN users u ON r.reviewee_id = u.user_id
            LEFT JOIN employer_profiles ep ON r.reviewee_id = ep.user_id
            WHERE r.reviewer_id = ? ORDER BY r.created_at DESC`, [req.user.user_id]);
        res.json({ reviews });
    } catch (err) {
        console.error('Get given reviews error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/reviews
router.post('/', authenticate, async (req, res) => {
    try {
        const { reviewee_id, rating, comment, job_id } = req.body;
        if (!reviewee_id || !rating) return res.status(400).json({ error: 'reviewee_id and rating are required' });
        if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5' });
        if (reviewee_id === req.user.user_id) return res.status(400).json({ error: 'Cannot review yourself' });

        const [users] = await pool.query('SELECT user_id, role FROM users WHERE user_id = ?', [reviewee_id]);
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });
        
        const reviewee = users[0];

        // Insert into generic reviews (job_id is optional but supported by schema)
        const [result] = await pool.query('INSERT INTO reviews (job_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
            [job_id || null, req.user.user_id, reviewee_id, rating, comment || '']);
            
        // Also insert into specific rating table context based on reviewee's role
        if (reviewee.role === 'employer' && req.user.role === 'employee') {
            await pool.query('INSERT INTO employer_ratings (employer_id, employee_id, rating, review) VALUES (?, ?, ?, ?)',
                [reviewee_id, req.user.user_id, rating, comment || '']);
        } else if (reviewee.role === 'employee' && req.user.role === 'employer') {
            await pool.query('INSERT INTO employee_ratings (employee_id, employer_id, rating, review) VALUES (?, ?, ?, ?)',
                [reviewee_id, req.user.user_id, rating, comment || '']);
        }
        
        // Trust score was removed from the users table, so we don't update it anymore.
        // If frontend relies on it, it would be calculated on the fly or just omitted.

        const [reviews] = await pool.query('SELECT * FROM reviews WHERE review_id = ?', [result.insertId]);
        res.status(201).json({ review: reviews[0] });
    } catch (err) {
        console.error('Submit review error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
