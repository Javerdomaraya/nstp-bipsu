import { enforceTestDatabase } from './test-db-guard.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/nstp_test';
enforceTestDatabase();

const { placeStudent } = await import('../src/modules/nstp/nstp.service.js');

test('placeStudent updates StudentProfile.componentId and creates an ACTIVE Enrollment', async () => {
  let updatedStudentData = null;
  let createdEnrollmentData = null;

  const mockTx = {
    studentProfile: {
      findUnique: async () => ({ id: 'sp-1', userId: 'user-1', componentId: null }),
      update: async ({ where, data }) => {
        updatedStudentData = { where, data };
        return { id: 'sp-1', ...data };
      },
    },
    nSTPComponent: {
      findFirst: async () => ({ id: 'comp-cwts-id', type: 'CWTS' }),
    },
    enrollment: {
      findFirst: async () => null, // No existing enrollment
      create: async ({ data }) => {
        createdEnrollmentData = data;
        return { id: 'enr-1', ...data };
      },
      update: async () => assert.fail('should create, not update'),
    },
  };

  const result = await placeStudent(mockTx, {
    studentId: 'sp-1',
    canonicalComponent: 'CWTS',
  });

  assert.equal(updatedStudentData.where.id, 'sp-1');
  assert.equal(updatedStudentData.data.componentId, 'comp-cwts-id');
  assert.equal(result.student.componentId, 'comp-cwts-id');

  assert.equal(createdEnrollmentData.studentId, 'sp-1');
  assert.equal(createdEnrollmentData.componentId, 'comp-cwts-id');
  assert.equal(createdEnrollmentData.status, 'ACTIVE');
  assert.equal(result.enrollment.status, 'ACTIVE');
});

test('placeStudent updates existing Enrollment to ACTIVE when already present', async () => {
  let updatedEnrollmentData = null;

  const mockTx = {
    studentProfile: {
      findUnique: async () => ({ id: 'sp-1', userId: 'user-1', componentId: null }),
      update: async ({ data }) => ({ id: 'sp-1', ...data }),
    },
    nSTPComponent: {
      findFirst: async () => ({ id: 'comp-lts-id', type: 'LTS' }),
    },
    enrollment: {
      findFirst: async () => ({ id: 'enr-existing', studentId: 'sp-1', componentId: 'comp-lts-id', status: 'PENDING' }),
      create: async () => assert.fail('should update existing, not create'),
      update: async ({ where, data }) => {
        updatedEnrollmentData = { where, data };
        return { id: where.id, ...data };
      },
    },
  };

  const result = await placeStudent(mockTx, {
    userId: 'user-1',
    canonicalComponent: 'LTS',
  });

  assert.equal(updatedEnrollmentData.where.id, 'enr-existing');
  assert.equal(updatedEnrollmentData.data.status, 'ACTIVE');
  assert.equal(result.enrollment.status, 'ACTIVE');
});
