const jwt = require('jsonwebtoken');
const { pool } = require('../db/init');

async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Validate Single Active Session matches database exactly
        const [users] = await pool.query('SELECT current_token FROM users WHERE user_id = ?', [decoded.user_id]);
        if (users.length === 0 || users[0].current_token !== token) {
            return res.status(401).json({ error: 'Session expired or logged in from another device. Please log in again.' });
        }
        
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

async function optionalAuthenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [users] = await pool.query('SELECT current_token FROM users WHERE user_id = ?', [decoded.user_id]);
        if (users.length > 0 && users[0].current_token === token) {
            req.user = decoded;
        }
    } catch (err) {}
    next();
}

/**
 * requireRole — checks if the user's ACTIVE role (from JWT) matches one of the allowed roles.
 * This is fast (no DB query) and suitable for most route protection.
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
        }
        next();
    };
}

/**
 * checkUserRole — checks if the user HAS a role in the user_roles table
 * (regardless of their active role). Useful when you want to verify
 * the user has ever registered for a role.
 */
function checkUserRole(role) {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        try {
            const [rows] = await pool.query(
                'SELECT id FROM user_roles WHERE user_id = ? AND role = ?',
                [req.user.user_id, role]
            );
            if (rows.length === 0) {
                return res.status(403).json({ error: `You do not have the ${role} role. Please register for it first.` });
            }
            next();
        } catch (err) {
            console.error('checkUserRole error:', err);
            return res.status(500).json({ error: 'Server error checking role' });
        }
    };
}

module.exports = { authenticate, requireRole, checkUserRole, optionalAuthenticate };
