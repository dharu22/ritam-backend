
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Roles permitted to verify activities.
// Confirm these role names against your assignment and seed data.
const VERIFIER_ROLES = ['IQAC_VERIFIER'];

function requireVerifier(req, res, next) {
  const { roles, active_role } = req.user;

  if (
    !Array.isArray(roles) ||
    !roles.includes(active_role) ||
    !VERIFIER_ROLES.includes(active_role)
  ) {
    return res.status(403).json({
      message: 'IQAC verifier role required'
    });
  }

  next();
}

// GET pending activities for the logged-in user's tenant
router.get('/queue', authenticateToken, requireVerifier, async (req, res) => {
  try {
    const { tenant_id } = req.user;

    const result = await pool.query(
      `SELECT
         activity_id,
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
       FROM activities
       WHERE tenant_id = $1
         AND status = 'PENDING'
       ORDER BY start_date ASC`,
      [tenant_id]
    );

    return res.json({ activities: result.rows });
  } catch (error) {
    console.error('Verification queue error:', error.message);

    return res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Approve or reject a pending activity
async function processActivity(req, res, action) {
  const { tenant_id, user_id, emp_id, active_role } = req.user;
  const activityId = Number(req.params.id);

  if (!Number.isSafeInteger(activityId) || activityId <= 0) {
    return res.status(400).json({
      message: 'Valid activity ID is required'
    });
  }

  const reason =
    typeof req.body?.reason === 'string'
      ? req.body.reason.trim()
      : '';

  if (action === 'REJECT' && !reason) {
    return res.status(400).json({
      message: 'Rejection reason is required'
    });
  }

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN');
    transactionStarted = true;

    const result = await client.query(
      `SELECT
         activity_id,
         tenant_id,
         emp_id,
         submitted_by,
         status
       FROM activities
       WHERE activity_id = $1
         AND tenant_id = $2
       FOR UPDATE`,
      [activityId, tenant_id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;

      return res.status(404).json({
        message: 'Activity not found in your tenant'
      });
    }

    const activity = result.rows[0];

    // A user must not verify their own submission.
    if (
      String(activity.submitted_by) === String(user_id) ||
      (
        emp_id != null &&
        String(activity.emp_id) === String(emp_id)
      )
    ) {
      await client.query('ROLLBACK');
      transactionStarted = false;

      return res.status(403).json({
        message: 'You cannot verify your own activity'
      });
    }

    if (activity.status !== 'PENDING') {
      await client.query('ROLLBACK');
      transactionStarted = false;

      return res.status(409).json({
        message: 'Activity has already been processed'
      });
    }

    const newStatus = action === 'APPROVE' ? 'VERIFIED' : 'REJECTED';

    const updated = await client.query(
      `UPDATE activities
       SET status = $1,
           rejection_reason = $2
       WHERE activity_id = $3
         AND tenant_id = $4
         AND status = 'PENDING'
       RETURNING activity_id, status, rejection_reason`,
      [
        newStatus,
        action === 'REJECT' ? reason : null,
        activityId,
        tenant_id
      ]
    );

    if (updated.rows.length === 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;

      return res.status(409).json({
        message: 'Activity has already been processed'
      });
    }

    await client.query(
      `INSERT INTO verification_logs (
         activity_id,
         acted_by,
         acted_role,
         action,
         reason
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [
        activityId,
        user_id,
        active_role,
        action,
        action === 'REJECT' ? reason : null
      ]
    );

    await client.query('COMMIT');
    transactionStarted = false;

    return res.json({
      message: `Activity ${action.toLowerCase()}d successfully`,
      activity: updated.rows[0]
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback error:', rollbackError.message);
      }
    }

    console.error('Process activity error:', error.message);

    return res.status(500).json({
      message: 'Internal server error'
    });
  } finally {
    client.release();
  }
}

router.post(
  '/:id/approve',
  authenticateToken,
  requireVerifier,
  (req, res) => processActivity(req, res, 'APPROVE')
);

router.post(
  '/:id/reject',
  authenticateToken,
  requireVerifier,
  (req, res) => processActivity(req, res, 'REJECT')
);

module.exports = router;
