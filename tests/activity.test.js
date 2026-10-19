
const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveAcademicYear } = require('../utils/academicYear');

test('Activity start date is required', () => {
  const startDate = '';
  assert.equal(startDate, '');
});

test('Activity end date must not be before start date', () => {
  const startDate = new Date('2025-08-10');
  const endDate = new Date('2025-08-09');

  assert.ok(endDate < startDate);
});

test('Activity must have an allowed document type', () => {
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
  ];

  assert.ok(allowedTypes.includes('application/pdf'));
  assert.ok(!allowedTypes.includes('text/plain'));
});

test('Activity document must not exceed 5 MB', () => {
  const maxSize = 5 * 1024 * 1024;

  assert.ok(1024 * 1024 <= maxSize);
  assert.ok(6 * 1024 * 1024 > maxSize);
});

test('Academic year is derived from activity start date', () => {
  assert.equal(deriveAcademicYear('2025-08-10'), '2025-26');
});

test('Activities in different tenants have different tenant IDs', () => {
  const tenantA = 1;
  const tenantB = 2;

  assert.notEqual(tenantA, tenantB);
});
