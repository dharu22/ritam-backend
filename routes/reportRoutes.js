
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');

function requireCoordinator(req, res, next) {
  const { roles, active_role } = req.user;

  if (
    !Array.isArray(roles) ||
    !roles.includes('IQAC_COORDINATOR') ||
    active_role !== 'IQAC_COORDINATOR'
  ) {
    return res.status(403).json({
      message: 'Coordinator role required'
    });
  }

  next();
}

router.get(
  '/summary',
  authenticateToken,
  requireCoordinator,
  async (req, res) => {
    try {
      const { tenant_id } = req.user;
      const { academic_year, department } = req.query;

      const values = [tenant_id];
      const filters = [
        `a.tenant_id = $1`,
        `a.status = 'VERIFIED'`
      ];

      if (academic_year) {
        values.push(academic_year);
        filters.push(`a.academic_year = $${values.length}`);
      }

      if (department) {
        values.push(department);
        filters.push(`e.department = $${values.length}`);
      }

      const result = await pool.query(
        `WITH eligible AS (
          SELECT COUNT(*)::int AS eligible_faculty
          FROM employees
          WHERE tenant_id = $1
            AND is_active = TRUE
            AND appointment_type IN ('FullTime', 'Contract')
        ),
        verified AS (
          SELECT a.*
          FROM activities a
          JOIN employees e
            ON e.tenant_id = a.tenant_id
           AND e.emp_id = a.emp_id
          WHERE ${filters.join(' AND ')}
        ),
        totals AS (
          SELECT COUNT(*)::int AS total_verified_activities
          FROM verified
        ),
        participants AS (
          SELECT COUNT(DISTINCT v.emp_id)::int
            AS faculty_participated
          FROM verified v
          JOIN employees e
            ON e.tenant_id = v.tenant_id
           AND e.emp_id = v.emp_id
          WHERE e.is_active = TRUE
            AND e.appointment_type IN ('FullTime', 'Contract')
        ),
        event_counts AS (
          SELECT event_type, COUNT(*)::int AS total_activities
          FROM verified
          GROUP BY event_type
        )
        SELECT
          t.total_verified_activities,
          p.faculty_participated,
          el.eligible_faculty,
          CASE
            WHEN el.eligible_faculty = 0 THEN 0
            ELSE ROUND(
              100.0 * p.faculty_participated /
              el.eligible_faculty,
              2
            )
          END AS participation_rate_pct,
          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'event_type', event_type,
                  'total_activities', total_activities
                )
                ORDER BY event_type
              )
              FROM event_counts
            ),
            '[]'::json
          ) AS counts_by_event_type
        FROM totals t
        CROSS JOIN participants p
        CROSS JOIN eligible el`,
        values
      );

      return res.json(result.rows[0]);
    } catch (error) {
      console.error('Report summary error:', error.message);
      return res.status(500).json({
        message: 'Internal server error'
      });
    }
  }
);

module.exports = router;
