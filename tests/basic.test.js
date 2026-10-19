
const test = require('node:test');
const assert = require('node:assert/strict');

const { deriveAcademicYear } = require('../utils/academicYear');

test('15 August 2024 should be 2024-25', () => {
  assert.equal(deriveAcademicYear('2024-08-15'), '2024-25');
});

test('30 June 2025 should be 2024-25', () => {
  assert.equal(deriveAcademicYear('2025-06-30'), '2024-25');
});

test('1 July 2025 should be 2025-26', () => {
  assert.equal(deriveAcademicYear('2025-07-01'), '2025-26');
});

test('10 March 2025 should be 2024-25', () => {
  assert.equal(deriveAcademicYear('2025-03-10'), '2024-25');
});
