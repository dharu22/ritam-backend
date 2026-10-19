
require('dotenv').config();

const bcrypt = require('bcrypt');
const pool = require('../db');

async function seedUsers() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check that both tenants exist.
    const tenants = await client.query(
      `SELECT tenant_id
       FROM tenants
       WHERE tenant_id IN (1, 2)`
    );

    if (tenants.rows.length !== 2) {
      throw new Error(
        'Expected sample tenants 1 and 2. Check the tenants table first.'
      );
    }

    // Check that all required employees exist.
    const employees = await client.query(
      `SELECT tenant_id, emp_id
       FROM employees
       WHERE (tenant_id = 1 AND emp_id IN (101, 102, 103))
          OR (tenant_id = 2 AND emp_id = 201)`
    );

    if (employees.rows.length !== 4) {
      throw new Error(
        'Expected sample employees were not found. Check employee records.'
      );
    }

    // Test accounts for all three required roles.
    const testUsers = [
      {
        tenantId: 1,
        email: 'faculty.a@example.test',
        password: 'FacultyA-Local-2026!',
        roles: ['FACULTY'],
        empId: 101,
      },
      {
        tenantId: 1,
        email: 'verifier.a@example.test',
        password: 'VerifierA-Local-2026!',
        roles: ['IQAC_VERIFIER'],
        empId: 102,
      },
      {
        tenantId: 1,
        email: 'coordinator.a@example.test',
        password: 'Coord-Local-2026!',
        roles: ['IQAC_COORDINATOR'],
        empId: 103,
      },
      {
        tenantId: 2,
        email: 'faculty.b@example.test',
        password: 'FacultyB-Local-2026!',
        roles: ['FACULTY'],
        empId: 201,
      },
    ];

    for (const user of testUsers) {
      const passwordHash = await bcrypt.hash(user.password, 12);

      await client.query(
        `INSERT INTO users
          (tenant_id, login_email, password_hash, roles, emp_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, login_email)
         DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           roles = EXCLUDED.roles,
           emp_id = EXCLUDED.emp_id`,
        [
          user.tenantId,
          user.email,
          passwordHash,
          user.roles,
          user.empId,
        ]
      );
    }

    await client.query('COMMIT');

    console.log('Sample test users created successfully.');
    console.log('Created/updated test accounts:');
    console.log('- faculty.a@example.test (FACULTY, Tenant 1)');
    console.log('- verifier.a@example.test (IQAC_VERIFIER, Tenant 1)');
    console.log('- coordinator.a@example.test (IQAC_COORDINATOR, Tenant 1)');
    console.log('- faculty.b@example.test (FACULTY, Tenant 2)');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seeding failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seedUsers();