const express = require('express');
const router = express.Router();
const { pool } = require('../db/init');
const { authenticate, requireRole } = require('../middleware/auth');

// GET /api/dashboard/job-seeker
router.get('/job-seeker', authenticate, requireRole('employee'), async (req, res) => {
    try {
        const userId = req.user.user_id;
        
        const [totalJobs] = await pool.query("SELECT COUNT(*) as count FROM jobs");
        const [savedJobs] = await pool.query("SELECT COUNT(*) as count FROM saved_jobs WHERE employee_id = ?", [userId]);
        const [applications] = await pool.query("SELECT COUNT(*) as count FROM applications WHERE employee_id = ?", [userId]);
        
        // Calculate average trust score from employee ratings
        const [ratings] = await pool.query("SELECT AVG(rating) as avg_rating FROM employee_ratings WHERE employee_id = ?", [userId]);
        const trustScore = ratings.length > 0 && ratings[0].avg_rating !== null ? Number(ratings[0].avg_rating).toFixed(1) : 0;

        res.json({
            total_jobs: totalJobs[0].count || 0,
            active_tokens: savedJobs[0].count || 0, // Sending as active_tokens to not break frontend structure, but it's saved jobs now
            trust_score: parseFloat(trustScore),
            applications_count: applications[0].count || 0
        });
    } catch (err) {
        console.error('Job seeker dashboard error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/dashboard/employer
router.get('/employer', authenticate, requireRole('employer'), async (req, res) => {
    try {
        const userId = req.user.user_id;
        
        const [activeJobs] = await pool.query("SELECT COUNT(*) as count FROM jobs WHERE employer_id = ?", [userId]);
        const [totalApplicants] = await pool.query(`SELECT COUNT(*) as count FROM applications a
            JOIN jobs j ON a.job_id = j.job_id WHERE j.employer_id = ?`, [userId]);
        const [hired] = await pool.query(`SELECT COUNT(*) as count FROM applications a
            JOIN jobs j ON a.job_id = j.job_id WHERE j.employer_id = ? AND a.status = 'accepted'`, [userId]);
            
        // Calculate average trust score from employer ratings
        const [ratings] = await pool.query("SELECT AVG(rating) as avg_rating FROM employer_ratings WHERE employer_id = ?", [userId]);
        const trustScore = ratings.length > 0 && ratings[0].avg_rating !== null ? Number(ratings[0].avg_rating).toFixed(1) : 0;

        res.json({
            active_jobs: activeJobs[0].count || 0,
            total_applicants: totalApplicants[0].count || 0,
            hired: hired[0].count || 0,
            trust_score: parseFloat(trustScore)
        });
    } catch (err) {
        console.error('Employer dashboard error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
