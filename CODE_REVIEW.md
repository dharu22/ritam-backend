# CODE REVIEW — RITAM Backend

## 1. Problems Identified

### Problem 1: Incorrect Tenant Isolation
**Severity:** High

**Issue:** The activity route accepts `tenant_id` from the request body instead of trusting the authenticated user's tenant.

**Impact:** A user could create or access records belonging to another tenant.

### Problem 2: SQL Injection
**Severity:** High

**Issue:** The original activity route inserts values using string interpolation.

**Impact:** Malicious input could modify the SQL query and compromise the database.

### Problem 3: Missing Document Validation
**Severity:** High

**Issue:** The original route does not require a certificate file.

**Impact:** Activities could be submitted without the required supporting document.

### Problem 4: Missing Role Authorization
**Severity:** High

**Issue:** The routes do not properly enforce the required user roles.

**Impact:** Unauthorized users could submit activities or access reports.

### Problem 5: Incorrect Report Data
**Severity:** High

**Issue:** The report uses `SELECT *` and does not restrict results to verified activities.

**Impact:** The response could include unnecessary or incorrect data.

### Problem 6: Incorrect Academic-Year Calculation
**Severity:** Medium

**Issue:** The original calculation uses an incorrect cutoff month.

**Impact:** Activities could be assigned to the wrong academic year. The academic year runs from 1 July through 30 June.

### Problem 7: Missing Initial Status Control
**Severity:** Medium

**Issue:** The original route does not explicitly enforce the initial activity status.

**Impact:** Newly submitted activities must always start as `PENDING`.

### Problem 8: Insufficient Date Validation
**Severity:** Medium

**Issue:** The original route does not validate the date range or invalid dates adequately.

**Impact:** Incorrect activity dates could be accepted.

### Problem 9: Incomplete Participation Calculation
**Severity:** Medium

**Issue:** The original report does not calculate eligible faculty, unique participating faculty, and participation rate.

**Impact:** The coordinator could receive an inaccurate participation summary.

### Problem 10: Inadequate Error Handling
**Severity:** Medium

**Issue:** The original routes lack consistent error handling.

**Impact:** Database failures could produce unclear responses or expose internal details.

### Problem 11: Incorrect Attendance Value
**Severity:** Medium

**Issue:** The original report uses `attended_as = 'Participant'`, but the required value is exactly `PARTICIPANT` or `RESOURCE_PERSON`.

**Impact:** Valid records could be excluded because of an incorrect comparison.

### Problem 12: Incorrect Report Authorization
**Severity:** High

**Issue:** The original report route does not enforce the `IQAC_COORDINATOR` role.

**Impact:** Faculty members or verifiers could access coordinator-only reports.

### Problem 13: Missing Optional Filters
**Severity:** Medium

**Issue:** The original report does not support optional `academic_year` and `department` filters.

**Impact:** Coordinators cannot narrow the summary to the required academic year or department.

### Problem 14: Incorrect Report Counting
**Severity:** High

**Issue:** The original report counts rows rather than unique eligible faculty with verified activities.

**Impact:** A faculty member with multiple activities could be counted more than once.

---

## 2. Corrected Route 1 — POST /api/activities

The following implementation assumes that `authenticateToken`, `pool`, `upload`, and `deriveAcademicYear` are already configured and imported. The `upload` middleware must accept only PDF, JPG, and PNG files and enforce the 5 MB limit.

```javascript
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { deriveAcademicYear } = require('../utils/academicYear');

function requireFaculty(req, res, next) {
  const { roles, active_role } = req.user;

  if (
    !Array.isArray(roles) ||
    !roles.includes('FACULTY') ||
    active_role !== 'FACULTY'
  ) {
    return res.status(403).json({
      message: 'Faculty role required'
    });
  }

  next();
}

router.post(
  '/',
  authenticateToken,
  requireFaculty,
  upload.single('document'),
  async (req, res) => {
    try {
      const {
        event_name,
        event_type,
        start_date,
        end_date,
        attended_as
      } = req.body;

      if (!req.file) {
        return res.status(400).json({
          message: 'Certificate file is required'
        });
      }

      if (
        !event_name ||
        !event_type ||
        !start_date ||
        !end_date ||
        !attended_as
      ) {
        return res.status(400).json({
          message: 'All required activity fields must be provided'
        });
      }

      if (!['FDP', 'STTP', 'WORKSHOP'].includes(event_type)) {
        return res.status(400).json({
          message: 'Invalid event type'
        });
      }

      if (
        !['PARTICIPANT', 'RESOURCE_PERSON'].includes(attended_as)
      ) {
        return res.status(400).json({
          message: 'Invalid attendance type'
        });
      }

      const start = new Date(start_date);
      const end = new Date(end_date);

      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime())
      ) {
        return res.status(400).json({
          message: 'Invalid activity dates'
        });
      }

      if (end < start) {
        return res.status(400).json({
          message: 'End date cannot be before start date'
        });
      }

      const academic_year = deriveAcademicYear(start_date);

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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING')
        RETURNING activity_id, event_name, event_type,
                  start_date, end_date, academic_year,
                  status`,
        [
          req.user.tenant_id,
          req.user.emp_id,
          req.user.user_id,
          event_name,
          event_type,
          start_date,
          end_date,
          attended_as,
          academic_year,
          req.file.path
        ]
      );

      return res.status(201).json({
        message: 'Activity submitted successfully',
        activity: result.rows[0]
      });
    } catch (error) {
      console.error('Activity submission error:', error.message);

      return res.status(500).json({
        message: 'Unable to submit activity'
      });
    }
  }
);

module.exports = router;
```

**Important implementation assumptions:**

- The upload middleware must validate MIME type, file extension, and file size, and return a clear `400` error for a missing file.
- `req.user` must contain verified JWT claims, including `tenant_id`, `user_id`, and `emp_id`.
- The route assumes the database uses the column names shown above.
- In the actual project, reuse the existing upload middleware and academic-year utility instead of creating duplicate implementations.

---

## 3. Corrected Route 2 — GET /api/reports/summary

This route restricts access to coordinators, uses the authenticated tenant, supports optional filters, and calculates participation from verified records only.

```javascript
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
        filters.push(
          `a.academic_year = $${values.length}`
        );
      }

      if (department) {
        values.push(department);
        filters.push(
          `e.department = $${values.length}`
        );
      }

      const result = await pool.query(
        `WITH eligible AS (
          SELECT COUNT(*)::int AS eligible_faculty
          FROM employees
          WHERE tenant_id = $1
            AND is_active = TRUE
            AND appointment_type IN ('FullTime', 'Contract')
            AND (
              $${values.length + 1}::text IS NULL
              OR department = $${values.length + 1}
            )
        ),
        verified AS (
          SELECT a.activity_id, a.emp_id, a.event_type,
                 a.tenant_id
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
        [
          ...values,
          department || null
        ]
      );

      return res.status(200).json(result.rows[0]);
    } catch (error) {
      console.error('Report summary error:', error.message);

      return res.status(500).json({
        message: 'Unable to generate report summary'
      });
    }
  }
);

module.exports = router;
```

**Note:** This is a code-review example, not a replacement for your existing working report route without testing. The parameter indexing and optional department filter must be checked carefully against the actual schema. The eligible-faculty denominator should use the selected department when a department filter is supplied, but should not shrink merely because an academic-year filter is supplied.

---

## 4. Security Improvements

- Use parameterized SQL queries.
- Derive `tenant_id` and user identity from the authenticated token.
- Enforce role-based authorization on every protected endpoint.
- Validate file type and size before saving uploads.
- Validate required fields and date ranges.
- Use database transactions for activity status changes and verification log entries.
- Avoid returning sensitive internal details in API responses.
- Use database constraints where appropriate.

## 5. Testing Recommendations

- Confirm that submissions without a file return `400`.
- Test invalid file types and files larger than 5 MB.
- Test invalid dates and `end_date` before `start_date`.
- Verify that tenant A cannot access or act on tenant B's records.
- Verify that a verifier cannot approve or reject their own submission.
- Confirm that non-pending activities return `409`.
- Confirm that rejection without a reason returns `400`.
- Confirm that status changes and verification logs succeed or fail together.
- Verify that pending and rejected activities are excluded from reports.
- Confirm that multiple verified activities by one eligible faculty member count as one participant.
- Test participation-rate calculation when eligible faculty is zero.
- Test academic-year boundaries and optional report filters.

## 6. Conclusion

The original routes have security, validation, and reporting problems. The corrected implementations demonstrate role-based authorization, tenant isolation, parameterized SQL, file validation, server-side academic-year calculation, and verified-only reporting. The code must be tested against the actual project schema and middleware before submission.