
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { deriveAcademicYear } = require('../utils/academicYear');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const uploadDir = path.join(__dirname, '..', 'uploads', 'activities');
fs.mkdirSync(uploadDir, { recursive: true });

const allowedTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png'
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!allowedTypes.has(file.mimetype)) {
      return cb(
        new Error('Only PDF, JPG, and PNG files are allowed')
      );
    }

    cb(null, true);
  }
});

function validDate(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

// Submit an activity with a required document
router.post(
  '/',
  authenticateToken,
  (req, res, next) => {
    upload.single('document')(req, res, (err) => {
      if (err) {
        const message =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'File must be 5 MB or smaller'
            : err.message;

        return res.status(400).json({ message });
      }

      next();
    });
  },
  async (req, res) => {
    let savedFile;

    try {
      const { user_id, tenant_id, emp_id, active_role } = req.user;

      if (active_role !== 'FACULTY' || !emp_id) {
        return res.status(403).json({
          message: 'Faculty account required'
        });
      }

      const {
        event_name,
        event_type,
        start_date,
        end_date,
        attended_as
      } = req.body;

      if (
        typeof event_name !== 'string' ||
        !event_name.trim() ||
        typeof event_type !== 'string' ||
        !event_type.trim() ||
        typeof start_date !== 'string' ||
        typeof end_date !== 'string' ||
        typeof attended_as !== 'string' ||
        !attended_as.trim()
      ) {
        return res.status(400).json({
          message: 'All activity fields are required'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          message: 'Activity document is required'
        });
      }

      savedFile = req.file.path;

      if (!validDate(start_date) || !validDate(end_date)) {
        fs.unlinkSync(savedFile);
        savedFile = undefined;

        return res.status(400).json({
          message: 'Dates must be valid YYYY-MM-DD dates'
        });
      }

      if (end_date < start_date) {
        fs.unlinkSync(savedFile);
        savedFile = undefined;

        return res.status(400).json({
          message: 'End date cannot be before start date'
        });
      }

      // Calculate the academic year using the shared utility.
      const academic_year = deriveAcademicYear(start_date);

      const documentPath = path
        .relative(path.join(__dirname, '..'), savedFile)
        .replace(/\\/g, '/');

      const result = await pool.query(
        `INSERT INTO activities (
          tenant_id,
          emp_id,
          submitted_by,
          event_name,
          event_type,
          start_date,
          end_date,
          attended_as,
          academic_year,
          document_path,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING
          activity_id,
          tenant_id,
          emp_id,
          event_name,
          event_type,
          start_date,
          end_date,
          attended_as,
          academic_year,
          document_path,
          status`,
        [
          tenant_id,
          emp_id,
          user_id,
          event_name.trim(),
          event_type.trim(),
          start_date,
          end_date,
          attended_as.trim(),
          academic_year,
          documentPath,
          'PENDING'
        ]
      );

      return res.status(201).json({
        message: 'Activity submitted successfully',
        activity: result.rows[0]
      });
    } catch (error) {
      if (savedFile && fs.existsSync(savedFile)) {
        try {
          fs.unlinkSync(savedFile);
        } catch (fileError) {
          console.error('File cleanup error:', fileError.message);
        }
      }

      console.error('Submit activity error:', error.message);

      return res.status(500).json({
        message: 'Internal server error'
      });
    }
  }
);

// Get activities submitted by the logged-in faculty
router.get('/mine', authenticateToken, async (req, res) => {
  try {
    const { tenant_id, emp_id } = req.user;

    if (!tenant_id || !emp_id) {
      return res.status(403).json({
        message: 'Faculty account required'
      });
    }

    const result = await pool.query(
      `SELECT
        activity_id,
        event_name,
        event_type,
        start_date,
        end_date,
        academic_year,
        document_path,
        status,
        rejection_reason
      FROM activities
      WHERE tenant_id = $1
        AND emp_id = $2
      ORDER BY start_date DESC`,
      [tenant_id, emp_id]
    );

    return res.json({
      activities: result.rows
    });
  } catch (error) {
    console.error('Get activities error:', error.message);

    return res.status(500).json({
      message: 'Internal server error'
    });
  }
});

module.exports = router;
