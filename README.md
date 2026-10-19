# RITAM Backend API

## 1. Project Overview

RITAM is a multi-tenant faculty activity management backend built using Node.js, Express.js, and PostgreSQL.

Faculty members can submit professional development activities with supporting certificates. Authorized verifiers can approve or reject activities, and coordinators can view summary reports containing verified activities.

The system supports multiple colleges (tenants). Each tenant's data must remain isolated from other tenants.

## 2. Technology Stack

- Node.js
- Express.js
- PostgreSQL
- JSON Web Tokens (JWT)
- bcrypt password hashing
- Multer file uploads
- Node.js built-in test runner
- Postman for API testing

## 3. Prerequisites

Install the following before running the project:

- Node.js and npm
- PostgreSQL
- Postman
- Visual Studio Code or another code editor

## 4. Project Setup

### Step 1: Install Dependencies

Open the project directory in a terminal and run:

```bash
npm install
```

### Step 2: Configure Environment Variables

Create a local `.env` file in the project root using `.env.example` as a reference.

Configure the following variables with your local values:

- `PORT`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `JWT_SECRET`

Never commit the actual `.env` file or real secrets to GitHub.

### Step 3: Create the Database

Create a PostgreSQL database named `ritam_db`.

Ensure PostgreSQL is running and the database tables required by the application have been created.

### Step 4: Initialize the Database

Run the database schema and seed scripts provided in the project, using the commands appropriate to their actual filenames.

The seed data should contain:

- Two tenants
- At least six employees across two departments
- Mixed appointment types
- Test users for `FACULTY`, `IQAC_VERIFIER`, and `IQAC_COORDINATOR`

The seed script should provide local test accounts for API testing. Use the actual test credentials created by the script.

### Step 5: Start the Server

Run:

```bash
npm start
```

If the project does not define a `start` script, use the start command configured in `package.json`.

The server uses port `5000` by default when configured that way in the environment.

### Step 6: Verify the Server

Check the following endpoints:

- `GET /` — checks server status
- `GET /api/health/db` — checks the database connection

## 5. Authentication and Authorization

Log in through:

`POST /api/auth/login`

The API returns a JWT after successful authentication.

For protected endpoints, send the token in the request header:

```text
Authorization: Bearer YOUR_ACCESS_TOKEN
```

The system supports these roles:

- `FACULTY` — submits activities and views their own records
- `IQAC_VERIFIER` — views pending activities and approves or rejects records
- `IQAC_COORDINATOR` — views summary reports

Protected endpoints must enforce the required role and tenant isolation.

## 6. API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/` | Check server status |
| GET | `/api/health/db` | Check database connectivity |
| POST | `/api/auth/login` | Authenticate a user |
| GET | `/api/auth/me` | Get authenticated user details, if implemented |
| POST | `/api/activities` | Submit an activity with a certificate |
| GET | `/api/activities/mine` | View the faculty member's own activities |
| GET | `/api/verification/queue` | View pending activities for the tenant |
| POST | `/api/verification/:id/approve` | Approve a pending activity |
| POST | `/api/verification/:id/reject` | Reject a pending activity |
| GET | `/api/reports/summary` | View the coordinator's activity summary |

### Activity Submission Rules

- Only authorized faculty can submit activities.
- A certificate file is required.
- Accepted formats: PDF, JPG, and PNG.
- Maximum file size: 5 MB.
- Tenant and employee identifiers must come from the authenticated token.
- The end date cannot be earlier than the start date.
- The academic year is calculated by the server.
- New activities start with `PENDING` status.

### Verification Rules

- Only `IQAC_VERIFIER` users can approve or reject activities.
- The verifier can process pending activities from their own tenant only.
- Rejection requires a reason.
- An activity that is no longer pending must return HTTP `409`.
- A verifier must not approve or reject their own submission.
- The activity status update and verification log entry must be committed in one database transaction.

### Summary Report Filters

The coordinator summary supports optional filters:

- `academic_year`, for example `2026-27`
- `department`, for example `CSE`

Example:

```text
GET /api/reports/summary?academic_year=2026-27&department=CSE
```

The report must include verified activities only and return:

- `total_verified_activities`
- Activity counts grouped by `event_type`
- `eligible_faculty`
- `faculty_participated`
- `participation_rate_pct`

Eligible faculty are active employees with `FullTime` or `Contract` appointment types. Participating faculty are unique eligible employees with at least one verified activity. The participation rate is rounded to two decimal places and must handle a zero denominator safely.

## 7. Academic Year

The academic year runs from 1 July through 30 June and is written as `YYYY-YY`.

Examples:

- 15 August 2024 → `2024-25`
- 10 March 2025 → `2024-25`
- 1 July 2025 → `2025-26`

The academic-year utility is located in `utils/academicYear.js`, and its tests are in `tests/basic.test.js`.

## 8. Running Tests

Run the automated tests using:

```bash
npm test
```

The academic-year utility currently has four unit tests covering dates in August, June, July, and March. All four passed in the previously observed test run.

The project should also include a Postman collection or automated API tests covering:

- Missing certificate upload
- Tenant isolation
- Prevention of self-verification
- Exclusion of pending and rejected activities from reports
- Unique participating-faculty counts

Only mark a test as passed after running it and checking the result.

## 9. Security

- Store passwords as hashes using bcrypt.
- Verify JWTs before allowing access to protected routes.
- Enforce role-based authorization.
- Derive tenant and employee identity from authenticated token claims.
- Use parameterized SQL queries.
- Validate uploaded file types and sizes.
- Use database transactions for verification status and audit-log changes.
- Return clear error messages without exposing secrets or internal database details.
- Never commit `.env`, real passwords, access tokens, or `node_modules/`.

## 10. Assumptions and Limitations

- The academic year runs from 1 July through 30 June.
- Only verified activities are included in coordinator summary reports.
- Eligible faculty are active employees with `FullTime` or `Contract` appointment types.
- The exact schema and seed commands depend on the files included in the project.
- Local test credentials must match the actual accounts created by the seed script.
- The academic-year unit tests have passed; additional API test coverage must be confirmed separately.

## 11. Repository Contents

The submission repository should contain:

- `server.js`
- `db.js`
- `routes/`
- `middleware/`
- `utils/`
- `tests/`
- `README.md`
- `.env.example`
- `.gitignore`
- Database schema and seed scripts
- `CODE_REVIEW.md`
- `ANSWERS.md`
- `AVAILABILITY.md`
- `TIMELOG.md`
- A Postman collection or sufficient automated API tests

## 12. Submission

Before submitting the project:

1. Verify the setup instructions on a fresh environment where possible.
2. Confirm the seed script creates the required tenants, employees, and test users.
3. Run the tests and record the actual results.
4. Check that `.env` and `node_modules/` are excluded from version control.
5. Commit the project to a GitHub repository and share the repository link as requested.
6. Be prepared to explain the implementation, security decisions, and test results during the code walkthrough.