const express = require('express');
const router = express.Router();
const { pool } = require('../db/init');
const { authenticate, requireRole } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────
//  Utility: normalise a comma-separated skill string into
//  a Set of lowercase trimmed tokens for comparison.
// ─────────────────────────────────────────────────────────
function parseSkills(raw) {
    if (!raw) return new Set();
    return new Set(
        raw.split(',')
           .map(s => s.trim().toLowerCase())
           .filter(Boolean)
    );
}

function skillOverlap(setA, setB) {
    if (setA.size === 0 || setB.size === 0) return 0;
    let matches = 0;
    for (const s of setA) {
        if (setB.has(s)) matches++;
    }
    return matches / setB.size; // fraction of setB matched
}

function cityMatch(loc1, loc2) {
    if (!loc1 || !loc2) return false;
    const a = loc1.toLowerCase().trim();
    const b = loc2.toLowerCase().trim();
    if (a === b) return true;
    // Check if either city name is contained in the other
    const cityA = a.split(',')[0].trim();
    const cityB = b.split(',')[0].trim();
    return cityA === cityB || a.includes(cityB) || b.includes(cityA);
}

// ═══════════════════════════════════════════════════════════
//  1.  GET /api/recommendations/jobs
//      Personalised job recommendations for an employee
// ═══════════════════════════════════════════════════════════
router.get('/jobs', authenticate, requireRole('employee'), async (req, res) => {
    try {
        const userId = req.user.user_id;
        const limit = parseInt(req.query.limit) || 10;

        // ── Gather user profile data ──────────────────────
        const [userRows] = await pool.query(
            'SELECT location FROM users WHERE user_id = ?', [userId]
        );
        const userLocation = userRows.length ? userRows[0].location : '';

        // Skills from employee_profiles (comma-separated)
        const [profileRows] = await pool.query(
            'SELECT skills FROM employee_profiles WHERE user_id = ?', [userId]
        );
        let userSkills = new Set();
        if (profileRows.length) {
            userSkills = parseSkills(profileRows[0].skills);
        }

        // Skills from employee_skills table
        const [skillRows] = await pool.query(
            'SELECT skill_name FROM employee_skills WHERE employee_id = ?', [userId]
        );
        skillRows.forEach(r => userSkills.add(r.skill_name.toLowerCase().trim()));

        // ── Past behaviour signals ────────────────────────
        // Categories the user applied to / saved
        const [categoryRows] = await pool.query(`
            SELECT DISTINCT jc.category_name
            FROM applications a
            JOIN jobs j ON a.job_id = j.job_id
            LEFT JOIN job_category_mapping jcm ON j.job_id = jcm.job_id
            LEFT JOIN job_categories jc ON jcm.category_id = jc.category_id
            WHERE a.employee_id = ? AND jc.category_name IS NOT NULL
            UNION
            SELECT DISTINCT jc.category_name
            FROM saved_jobs sj
            JOIN jobs j ON sj.job_id = j.job_id
            LEFT JOIN job_category_mapping jcm ON j.job_id = jcm.job_id
            LEFT JOIN job_categories jc ON jcm.category_id = jc.category_id
            WHERE sj.employee_id = ? AND jc.category_name IS NOT NULL
        `, [userId, userId]);
        const preferredCategories = new Set(categoryRows.map(r => r.category_name));

        // Job types the user has applied to (frequency)
        const [jtRows] = await pool.query(`
            SELECT j.job_type, COUNT(*) as cnt
            FROM applications a JOIN jobs j ON a.job_id = j.job_id
            WHERE a.employee_id = ? AND j.job_type IS NOT NULL
            GROUP BY j.job_type ORDER BY cnt DESC
        `, [userId]);
        const preferredJobTypes = new Set(jtRows.map(r => r.job_type));

        // Employers where user was accepted (trusted employers)
        const [trustedRows] = await pool.query(`
            SELECT DISTINCT j.employer_id
            FROM applications a JOIN jobs j ON a.job_id = j.job_id
            WHERE a.employee_id = ? AND a.status = 'accepted'
        `, [userId]);
        const trustedEmployers = new Set(trustedRows.map(r => r.employer_id));

        // Jobs user already applied to or saved (exclude)
        const [excludeRows] = await pool.query(`
            SELECT job_id FROM applications WHERE employee_id = ?
            UNION
            SELECT job_id FROM saved_jobs WHERE employee_id = ?
        `, [userId, userId]);
        const excludedJobs = new Set(excludeRows.map(r => r.job_id));

        // ── Fetch all available jobs ──────────────────────
        const [allJobs] = await pool.query(`
            SELECT j.*, jc.category_name, u.name as employer_name,
                   ep.company_name, ep.company_description
            FROM jobs j
            LEFT JOIN job_category_mapping jcm ON j.job_id = jcm.job_id
            LEFT JOIN job_categories jc ON jcm.category_id = jc.category_id
            LEFT JOIN users u ON j.employer_id = u.user_id
            LEFT JOIN employer_profiles ep ON j.employer_id = ep.user_id
            WHERE j.status = 'open'
            ORDER BY j.created_at DESC
        `);

        // ── Score each job ────────────────────────────────
        const scored = [];
        for (const job of allJobs) {
            if (excludedJobs.has(job.job_id)) continue;

            let score = 0;

            // 1. Skill match (0-35 pts)
            const jobSkills = parseSkills(job.skills_required);
            const overlap = skillOverlap(userSkills, jobSkills);
            score += Math.round(overlap * 35);

            // 2. Location match (0-20 pts)
            if (cityMatch(userLocation, job.location)) {
                score += 20;
            }

            // 3. Category affinity (0-20 pts)
            if (job.category_name && preferredCategories.has(job.category_name)) {
                score += 20;
            }

            // 4. Job type preference (0-10 pts)
            if (job.job_type && preferredJobTypes.has(job.job_type)) {
                score += 10;
            }

            // 5. Trusted employer boost (0-15 pts)
            if (trustedEmployers.has(job.employer_id)) {
                score += 15;
            }

            scored.push({ ...job, score });
        }

        // Sort by score desc, then by recency
        scored.sort((a, b) => b.score - a.score || new Date(b.created_at) - new Date(a.created_at));

        let recommendations = scored.slice(0, limit);

        // Fallback: if no scored results (or all zero), return newest jobs matching location
        if (recommendations.length === 0 || recommendations.every(r => r.score === 0)) {
            const fallback = allJobs
                .filter(j => !excludedJobs.has(j.job_id))
                .slice(0, limit);
            recommendations = fallback.map(j => ({ ...j, score: 0 }));
        }

        res.json({ recommendations });
    } catch (err) {
        console.error('Job recommendations error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ═══════════════════════════════════════════════════════════
//  2.  GET /api/recommendations/employees
//      Personalised employee recommendations for an employer
// ═══════════════════════════════════════════════════════════
router.get('/employees', authenticate, requireRole('employer'), async (req, res) => {
    try {
        const userId = req.user.user_id;
        const limit = parseInt(req.query.limit) || 10;

        // ── Employer data ─────────────────────────────────
        const [empRows] = await pool.query(
            'SELECT location FROM users WHERE user_id = ?', [userId]
        );
        const employerLocation = empRows.length ? empRows[0].location : '';

        const [epRows] = await pool.query(
            'SELECT company_location FROM employer_profiles WHERE user_id = ?', [userId]
        );
        const companyLocation = epRows.length ? epRows[0].company_location : employerLocation;

        // Skills the employer needs most (from their posted jobs)
        const [jobSkillRows] = await pool.query(
            'SELECT skills_required FROM jobs WHERE employer_id = ?', [userId]
        );
        const requiredSkills = new Set();
        jobSkillRows.forEach(r => {
            parseSkills(r.skills_required).forEach(s => requiredSkills.add(s));
        });

        // Employees already accepted by this employer (exclude from recs, use for similarity)
        const [hiredRows] = await pool.query(`
            SELECT DISTINCT a.employee_id
            FROM applications a JOIN jobs j ON a.job_id = j.job_id
            WHERE j.employer_id = ? AND a.status = 'accepted'
        `, [userId]);
        const hiredSet = new Set(hiredRows.map(r => r.employee_id));

        // Skills of previously hired employees (for similarity scoring)
        const hiredSkills = new Set();
        if (hiredSet.size > 0) {
            const hiredIds = [...hiredSet];
            const placeholders = hiredIds.map(() => '?').join(',');
            const [hsRows] = await pool.query(
                `SELECT skills FROM employee_profiles WHERE user_id IN (${placeholders})`,
                hiredIds
            );
            hsRows.forEach(r => parseSkills(r.skills).forEach(s => hiredSkills.add(s)));
            const [hsRows2] = await pool.query(
                `SELECT skill_name FROM employee_skills WHERE employee_id IN (${placeholders})`,
                hiredIds
            );
            hsRows2.forEach(r => hiredSkills.add(r.skill_name.toLowerCase().trim()));
        }

        // ── Fetch all employees ───────────────────────────
        const [allEmployees] = await pool.query(`
            SELECT u.user_id, u.name, u.email, u.location, u.phone,
                   ep.skills, ep.experience, ep.education, ep.availability,
                   COALESCE(AVG(er.rating), 0) as avg_rating,
                   COUNT(er.rating_id) as rating_count
            FROM users u
            LEFT JOIN employee_profiles ep ON u.user_id = ep.user_id
            LEFT JOIN employee_ratings er ON u.user_id = er.employee_id
            WHERE u.role = 'employee'
            GROUP BY u.user_id, u.name, u.email, u.location, u.phone,
                     ep.skills, ep.experience, ep.education, ep.availability
        `);

        // Fetch normalised skills from employee_skills table
        const [allSkillRows] = await pool.query(
            'SELECT employee_id, skill_name FROM employee_skills'
        );
        const skillsByEmployee = {};
        allSkillRows.forEach(r => {
            if (!skillsByEmployee[r.employee_id]) skillsByEmployee[r.employee_id] = new Set();
            skillsByEmployee[r.employee_id].add(r.skill_name.toLowerCase().trim());
        });

        // ── Score each employee ───────────────────────────
        const scored = [];
        for (const emp of allEmployees) {
            if (hiredSet.has(emp.user_id)) continue; // exclude already-hired
            if (emp.user_id === userId) continue;     // exclude self

            let empSkills = parseSkills(emp.skills);
            // Merge with employee_skills table
            if (skillsByEmployee[emp.user_id]) {
                skillsByEmployee[emp.user_id].forEach(s => empSkills.add(s));
            }

            let score = 0;

            // 1. Skill match against employer's required skills (0-35 pts)
            if (requiredSkills.size > 0) {
                const overlap = skillOverlap(empSkills, requiredSkills);
                score += Math.round(overlap * 35);
            }

            // 2. Location match (0-20 pts)
            if (cityMatch(emp.location, companyLocation) || cityMatch(emp.location, employerLocation)) {
                score += 20;
            }

            // 3. Experience (0-15 pts) — scaled, max at 5+ years
            const exp = emp.experience || 0;
            score += Math.min(Math.round((exp / 5) * 15), 15);

            // 4. Rating score (0-15 pts) — scaled from 0-5 stars
            const rating = parseFloat(emp.avg_rating) || 0;
            score += Math.round((rating / 5) * 15);

            // 5. Past hire similarity (0-15 pts) — skills overlap with previously hired
            if (hiredSkills.size > 0) {
                const simOverlap = skillOverlap(empSkills, hiredSkills);
                score += Math.round(simOverlap * 15);
            }

            scored.push({
                user_id: emp.user_id,
                name: emp.name,
                email: emp.email,
                location: emp.location,
                phone: emp.phone,
                skills: emp.skills,
                experience: emp.experience,
                education: emp.education,
                availability: emp.availability,
                avg_rating: parseFloat(parseFloat(emp.avg_rating).toFixed(1)),
                rating_count: emp.rating_count,
                score
            });
        }

        scored.sort((a, b) => b.score - a.score);

        let recommendations = scored.slice(0, limit);

        // Fallback: if no scored results, return highest-rated employees
        if (recommendations.length === 0 || recommendations.every(r => r.score === 0)) {
            const fallback = allEmployees
                .filter(e => !hiredSet.has(e.user_id) && e.user_id !== userId)
                .sort((a, b) => (parseFloat(b.avg_rating) || 0) - (parseFloat(a.avg_rating) || 0))
                .slice(0, limit)
                .map(e => ({
                    user_id: e.user_id,
                    name: e.name,
                    email: e.email,
                    location: e.location,
                    phone: e.phone,
                    skills: e.skills,
                    experience: e.experience,
                    education: e.education,
                    availability: e.availability,
                    avg_rating: parseFloat(parseFloat(e.avg_rating || 0).toFixed(1)),
                    rating_count: e.rating_count,
                    score: 0
                }));
            recommendations = fallback;
        }

        res.json({ recommendations });
    } catch (err) {
        console.error('Employee recommendations error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ═══════════════════════════════════════════════════════════
//  3.  GET /api/recommendations/employees/hired
//      Previously hired employees for an employer
// ═══════════════════════════════════════════════════════════
router.get('/employees/hired', authenticate, requireRole('employer'), async (req, res) => {
    try {
        const userId = req.user.user_id;

        const [hired] = await pool.query(`
            SELECT u.user_id, u.name, u.email, u.location, u.phone,
                   ep.skills, ep.experience, ep.education, ep.availability,
                   j.title as hired_for_job, j.job_id,
                   a.applied_at as hired_at,
                   COALESCE(AVG(er.rating), 0) as avg_rating,
                   COUNT(er.rating_id) as rating_count
            FROM applications a
            JOIN jobs j ON a.job_id = j.job_id
            JOIN users u ON a.employee_id = u.user_id
            LEFT JOIN employee_profiles ep ON u.user_id = ep.user_id
            LEFT JOIN employee_ratings er ON u.user_id = er.employee_id
            WHERE j.employer_id = ? AND a.status = 'accepted'
            GROUP BY u.user_id, u.name, u.email, u.location, u.phone,
                     ep.skills, ep.experience, ep.education, ep.availability,
                     j.title, j.job_id, a.applied_at
            ORDER BY a.applied_at DESC
        `, [userId]);

        const employees = hired.map(h => ({
            ...h,
            avg_rating: parseFloat(parseFloat(h.avg_rating).toFixed(1))
        }));

        res.json({ employees });
    } catch (err) {
        console.error('Hired employees error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
