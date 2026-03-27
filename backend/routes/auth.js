const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/init');
const { authenticate } = require('../middleware/auth');

// Helper: get all roles for a user from user_roles table
async function getUserRoles(userId) {
    const [rows] = await pool.query('SELECT role FROM user_roles WHERE user_id = ?', [userId]);
    return rows.map(r => r.role);
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, phone, role, location,
                // Optional role-specific profile data
                company_name, company_description, company_location,
                skills, experience, education } = req.body;

        if (!name || !email || !password || !role) {
            return res.status(400).json({ error: 'Name, email, password, and role are required' });
        }
        if (!['employee', 'employer'].includes(role)) {
            return res.status(400).json({ error: 'Role must be employee or employer' });
        }

        const [existing] = await pool.query('SELECT user_id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const hash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 10);
        
        const [result] = await pool.query(
            'INSERT INTO users (name, email, password, phone, role, location, roles) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, email, hash, phone || null, role, location || null, role]
        );
        
        const insertId = result.insertId;

        // Insert into user_roles table
        await pool.query('INSERT INTO user_roles (user_id, role) VALUES (?, ?)', [insertId, role]);

        // Create the corresponding profile with provided data
        if (role === 'employee') {
            await pool.query(
                'INSERT INTO employee_profiles (user_id, skills, experience, education, resume_url, availability) VALUES (?, ?, ?, ?, ?, ?)',
                [insertId, skills || '', experience || 0, education || '', '', 'both']
            );
        } else {
            await pool.query(
                'INSERT INTO employer_profiles (user_id, company_name, company_description, company_location, company_website) VALUES (?, ?, ?, ?, ?)',
                [insertId, company_name || name, company_description || '', company_location || location || '', '']
            );
        }

        const token = jwt.sign(
            { user_id: insertId, email, role },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        await pool.query('UPDATE users SET current_token = ? WHERE user_id = ?', [token, insertId]);

        const allRoles = await getUserRoles(insertId);
        const [users] = await pool.query('SELECT user_id, name, email, role, location FROM users WHERE user_id = ?', [insertId]);
        res.status(201).json({ token, user: { ...users[0], roles: allRoles.join(',') } });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(401).json({ error: 'User not found. Please register first.' });
        }

        const user = users[0];
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(401).json({ error: 'Incorrect password. Please try again.' });
        }

        // Get all roles from user_roles table
        const allRoles = await getUserRoles(user.user_id);
        const rolesString = allRoles.length > 0 ? allRoles.join(',') : user.role;

        // Sync users.roles column with user_roles table data
        if (rolesString !== user.roles) {
            await pool.query('UPDATE users SET roles = ? WHERE user_id = ?', [rolesString, user.user_id]);
        }

        const token = jwt.sign(
            { user_id: user.user_id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        await pool.query('UPDATE users SET current_token = ? WHERE user_id = ?', [token, user.user_id]);

        res.json({
            token,
            user: {
                user_id: user.user_id,
                name: user.name,
                email: user.email,
                role: user.role,
                roles: rolesString,
                location: user.location,
                phone: user.phone
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/auth/add-role — Add a second role to an existing user with profile data
router.post('/add-role', authenticate, async (req, res) => {
    try {
        const { role,
                // Employer profile fields
                company_name, company_description, company_location,
                // Employee profile fields
                skills, experience, education } = req.body;

        if (!role || !['employee', 'employer'].includes(role)) {
            return res.status(400).json({ error: 'Role must be employee or employer' });
        }

        const [users] = await pool.query('SELECT * FROM users WHERE user_id = ?', [req.user.user_id]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];

        // Check if role already exists in user_roles table
        const [existingRole] = await pool.query(
            'SELECT id FROM user_roles WHERE user_id = ? AND role = ?',
            [user.user_id, role]
        );
        if (existingRole.length > 0) {
            return res.status(400).json({ error: 'You already have this role' });
        }

        // Add the new role to user_roles table
        await pool.query('INSERT INTO user_roles (user_id, role) VALUES (?, ?)', [user.user_id, role]);

        // Update users.roles column for backward compatibility
        const allRoles = await getUserRoles(user.user_id);
        const newRolesString = allRoles.join(',');
        await pool.query('UPDATE users SET roles = ? WHERE user_id = ?', [newRolesString, user.user_id]);

        // Create the corresponding profile with provided data
        if (role === 'employee') {
            const [existing] = await pool.query('SELECT * FROM employee_profiles WHERE user_id = ?', [user.user_id]);
            if (existing.length === 0) {
                await pool.query(
                    'INSERT INTO employee_profiles (user_id, skills, experience, education, resume_url, availability) VALUES (?, ?, ?, ?, ?, ?)',
                    [user.user_id, skills || '', experience || 0, education || '', '', 'both']
                );
            }
        } else {
            const [existing] = await pool.query('SELECT * FROM employer_profiles WHERE user_id = ?', [user.user_id]);
            if (existing.length === 0) {
                await pool.query(
                    'INSERT INTO employer_profiles (user_id, company_name, company_description, company_location, company_website) VALUES (?, ?, ?, ?, ?)',
                    [user.user_id, company_name || user.name, company_description || '', company_location || user.location || '', '']
                );
            }
        }

        res.json({ message: 'Role added successfully', roles: newRolesString });
    } catch (err) {
        console.error('Add role error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/auth/switch-role — Switch active role (issues new JWT)
router.post('/switch-role', authenticate, async (req, res) => {
    try {
        const { role } = req.body;
        if (!role || !['employee', 'employer'].includes(role)) {
            return res.status(400).json({ error: 'Role must be employee or employer' });
        }

        const [users] = await pool.query('SELECT * FROM users WHERE user_id = ?', [req.user.user_id]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];

        // Validate against user_roles table
        const allRoles = await getUserRoles(user.user_id);
        if (!allRoles.includes(role)) {
            return res.status(403).json({ error: 'You do not have this role. Please register for it first.' });
        }

        // Update active role in DB
        await pool.query('UPDATE users SET role = ? WHERE user_id = ?', [role, user.user_id]);

        // Issue new JWT with updated role
        const token = jwt.sign(
            { user_id: user.user_id, email: user.email, role },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        await pool.query('UPDATE users SET current_token = ? WHERE user_id = ?', [token, user.user_id]);

        res.json({
            token,
            user: {
                user_id: user.user_id,
                name: user.name,
                email: user.email,
                role,
                roles: allRoles.join(','),
                location: user.location,
                phone: user.phone
            }
        });
    } catch (err) {
        console.error('Switch role error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
    try {
        const [users] = await pool.query('SELECT user_id, name, email, role, location, phone, created_at FROM users WHERE user_id = ?',
            [req.user.user_id]);
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });

        const allRoles = await getUserRoles(req.user.user_id);
        res.json({ user: { ...users[0], roles: allRoles.join(',') } });
    } catch (err) {
        console.error('Me error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
