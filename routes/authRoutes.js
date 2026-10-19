
const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  try {
    const { email, password, active_role } = req.body;

    if (
      typeof email !== 'string' ||
      !email.trim() ||
      typeof password !== 'string' ||
      !password
    ) {
      return res.status(400).json({
        message: 'Email and password are required'
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not configured');

      return res.status(500).json({
        message: 'Authentication configuration error'
      });
    }

    const result = await pool.query(
      `SELECT
         user_id,
         tenant_id,
         emp_id,
         login_email,
         password_hash,
         roles
       FROM users
       WHERE LOWER(login_email) = LOWER($1)`,
      [email.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: 'Invalid email or password'
      });
    }

    const user = result.rows[0];

    const validPassword = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!validPassword) {
      return res.status(401).json({
        message: 'Invalid email or password'
      });
    }

    const roles = Array.isArray(user.roles)
      ? user.roles
      : user.roles
        ? [user.roles]
        : [];

    if (roles.length === 0) {
      return res.status(403).json({
        message: 'No role assigned to this user'
      });
    }

    const selectedRole = active_role || roles[0];

    if (
      typeof selectedRole !== 'string' ||
      !roles.includes(selectedRole)
    ) {
      return res.status(403).json({
        message: 'Invalid active role'
      });
    }

    const token = jwt.sign(
      {
        user_id: user.user_id,
        tenant_id: user.tenant_id,
        roles,
        active_role: selectedRole,
        emp_id: user.emp_id ?? null
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    return res.json({
      message: 'Login successful',
      token,
      user: {
        user_id: user.user_id,
        tenant_id: user.tenant_id,
        emp_id: user.emp_id ?? null,
        email: user.login_email,
        roles,
        active_role: selectedRole
      }
    });
  } catch (error) {
    console.error('Login error:', error.message);

    return res.status(500).json({
      message: 'Internal server error'
    });
  }
});

router.get('/me', authenticateToken, (req, res) => {
  return res.json({
    message: 'Authentication successful',
    user: req.user
  });
});

module.exports = router;
