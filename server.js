
const express = require('express');
require('dotenv').config();

const pool = require('./db');
const app = express();

// Middleware
app.use(express.json());

// Route imports
const authRoutes = require('./routes/authRoutes');
const activityRoutes = require('./routes/activityRoutes');
const verificationRoutes = require('./routes/verificationRoutes');
const reportRoutes = require('./routes/reportRoutes');
app.use('/api/reports', reportRoutes);
// Route registration
app.use('/api/auth', authRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/verification', verificationRoutes);

// Home route
app.get('/', (req, res) => {
  res.json({
    message: 'RITAM backend is running!'
  });
});

// Database health check
app.get('/api/health/db', async (req, res) => {
  try {
    const result = await pool.query('SELECT current_database()');

    res.json({
      status: 'connected',
      database: result.rows[0].current_database
    });
  } catch (error) {
    console.error('Database error:', error.message);

    res.status(500).json({
      status: 'error',
      message: 'Database connection failed'
    });
  }
});

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`RITAM server running on port ${PORT}`);
});
