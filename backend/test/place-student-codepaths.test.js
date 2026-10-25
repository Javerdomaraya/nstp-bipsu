import { enforceTestDatabase } from './test-db-guard.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/nstp_test';
enforceTestDatabase();

const { default: prisma } = await import('../src/db/prisma.js');
const { upsertAdminResource } = await import('../src/modules/nstp/nstp.service.js');

const originalUserUpsert = prisma.user?.upsert;
const originalUserFindUnique = prisma.user?.findUnique;
const originalComponentUpsert = prisma.nSTPComponent?.upsert;
const originalComponentFindFirst = prisma.nSTPComponent?.findFirst;
const originalStudentUpsert = prisma.studentProfile?.upsert;
const originalStudentFindUnique = prisma.studentProfile?.findUnique;
const originalStudentUpdate = prisma.studentProfile?.update;
const originalEnrollmentFindFirst = prisma.enrollment?.findFirst;
const originalEnrollmentCreate = prisma.enrollment?.create;

afterEach(() => {
  if (originalUserUpsert) prisma.user.upsert = originalUserUpsert;
  if (originalUserFindUnique) prisma.user.findUnique = originalUserFindUnique;
  if (originalComponentUpsert) prisma.nSTPComponent.upsert = originalComponentUpsert;
  if (originalComponentFindFirst) prisma.nSTPComponent.findFirst = originalComponentFindFirst;
  if (originalStudentUpsert) prisma.studentProfile.upsert = originalStudentUpsert;
  if (originalStudentFindUnique) prisma.studentProfile.findUnique = originalStudentFindUnique;
  if (originalStudentUpdate) prisma.studentProfile.update = originalStudentUpdate;
  if (originalEnrollmentFindFirst) prisma.enrollment.findFirst = originalEnrollmentFindFirst;
  if (originalEnrollmentCreate) prisma.enrollment.create = originalEnrollmentCreate;
});

test('upsertAdminResource for students routes placement through placeStudent to create active enrollment', async () => {
  let createdEnrollment = null;
  let placedComponentId = null;

  prisma.user.findUnique = async () => null;
  prisma.user.upsert = async () => ({ id: 'user-admin-created' });
  prisma.nSTPComponent.upsert = async () => ({ id: 'comp-cwts-id', type: 'CWTS' });
  prisma.nSTPComponent.findFirst = async () => ({ id: 'comp-cwts-id', type: 'CWTS' });

  prisma.studentProfile.upsert = async () => ({
    id: 'sp-admin-created',
    userId: 'user-admin-created',
    studentNumber: '21-ADMIN-01',
    componentId: null,
  });

  prisma.studentProfile.findUnique = async () => ({
    id: 'sp-admin-created',
    userId: 'user-admin-created',
    studentNumber: '21-ADMIN-01',
    componentId: placedComponentId,
  });

  prisma.studentProfile.update = async ({ data }) => {
    placedComponentId = data.componentId;
    return { id: 'sp-admin-created', ...data };
  };

  prisma.enrollment.findFirst = async () => null;
  prisma.enrollment.create = async ({ data }) => {
    createdEnrollment = data;
    return { id: 'enr-admin-created', ...data };
  };

  const payload = {
    studentId: '21-ADMIN-01',
    name: 'Admin Added Student',
    email: 'admin.student@bipsu.edu.ph',
    password: 'SecurePassword123!',
    component: 'CWTS',
    course: 'BSIT',
  };

  const result = await upsertAdminResource('students', { studentId: '21-ADMIN-01' }, payload);

  assert.equal(placedComponentId, 'comp-cwts-id', 'StudentProfile.componentId must be set via placeStudent');
  assert.equal(result.componentId, 'comp-cwts-id');
  assert.equal(createdEnrollment?.studentId, 'sp-admin-created');
  assert.equal(createdEnrollment?.componentId, 'comp-cwts-id');
  assert.equal(createdEnrollment?.status, 'ACTIVE', 'Must create an ACTIVE enrollment');
});
