import { enforceTestDatabase } from './test-db-guard.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, afterEach, before, test } from 'node:test';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/nstp_test';
enforceTestDatabase();

const { createApp } = await import('../src/app.js');
const { default: prisma } = await import('../src/db/prisma.js');
const { approvePendingRegistration, getUserById, registerUser } = await import('../src/modules/auth/auth.service.js');
const { deleteAdminResource, listAdminResource, upsertAdminResource } = await import('../src/modules/nstp/nstp.service.js');

let server;
let baseUrl;
const originals = {
  transaction: prisma.$transaction,
  userFindMany: prisma.user.findMany,
  userFindUnique: prisma.user.findUnique,
  userCreate: prisma.user.create,
  userUpdate: prisma.user.update,
  studentFindUnique: prisma.studentProfile.findUnique,
  studentFindMany: prisma.studentProfile.findMany,
  gradeFindMany: prisma.grade.findMany,
  gradeUpsert: prisma.grade.upsert,
  gradeDelete: prisma.grade.delete,
  pendingFindFirst: prisma.pendingRegistration.findFirst,
  pendingFindMany: prisma.pendingRegistration.findMany,
  pendingCreate: prisma.pendingRegistration.create,
  instructorFindUnique: prisma.instructorProfile.findUnique,
  coordinatorFindUnique: prisma.coordinatorProfile.findUnique,
  sectionFindUnique: prisma.section.findUnique,
};

function token(role, id = `${role.toLowerCase()}-user`) {
  return jwt.sign({ id, email: `${id}@example.test`, role }, process.env.JWT_SECRET, { algorithm: 'HS256' });
}

async function request(path, { role, method = 'GET', body, id } = {}) {
  const headers = body ? { 'content-type': 'application/json' } : {};
  if (role) headers.authorization = `Bearer ${token(role, id)}`;
  return fetch(`${baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => {
  prisma.$transaction = originals.transaction;
  prisma.user.findMany = originals.userFindMany;
  prisma.user.findUnique = originals.userFindUnique;
  prisma.user.create = originals.userCreate;
  prisma.user.update = originals.userUpdate;
  prisma.studentProfile.findUnique = originals.studentFindUnique;
  prisma.studentProfile.findMany = originals.studentFindMany;
  prisma.grade.findMany = originals.gradeFindMany;
  prisma.grade.upsert = originals.gradeUpsert;
  prisma.grade.delete = originals.gradeDelete;
  prisma.pendingRegistration.findFirst = originals.pendingFindFirst;
  prisma.pendingRegistration.findMany = originals.pendingFindMany;
  prisma.pendingRegistration.create = originals.pendingCreate;
  prisma.instructorProfile.findUnique = originals.instructorFindUnique;
  prisma.coordinatorProfile.findUnique = originals.coordinatorFindUnique;
  prisma.section.findUnique = originals.sectionFindUnique;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

test('unauthenticated protected requests return 401', async () => {
  assert.equal((await request('/api/nstp/admin/accounts')).status, 401);
});

test('students cannot list, create, or delete accounts', async () => {
  assert.equal((await request('/api/nstp/admin/accounts', { role: 'STUDENT' })).status, 403);
  assert.equal((await request('/api/nstp/admin/accounts', { role: 'STUDENT', method: 'POST', body: {} })).status, 403);
  assert.equal((await request('/api/nstp/admin/accounts/another-user', { role: 'STUDENT', method: 'DELETE' })).status, 403);
});

test('only administrators can submit registration approval decisions', async () => {
  assert.equal((await request('/api/auth/admin/registrations/pending-1/approve', { role: 'STUDENT', method: 'POST', body: {} })).status, 403);
  assert.equal((await request('/api/auth/admin/registrations/pending-1/approve', { role: 'INSTRUCTOR', method: 'POST', body: {} })).status, 403);
  assert.equal((await request('/api/auth/admin/registrations/pending-1/approve', { role: 'COORDINATOR', method: 'POST', body: {} })).status, 403);
});

test('students cannot create or modify modules', async () => {
  assert.equal((await request('/api/nstp/admin/modules', { role: 'STUDENT', method: 'POST', body: { id: 'module-1', title: 'Blocked' } })).status, 403);
  assert.equal((await request('/api/nstp/admin/modules/module-1', { role: 'STUDENT', method: 'DELETE' })).status, 403);
});

test('only administrators can release or hold official semester grades', async () => {
  for (const role of ['STUDENT', 'INSTRUCTOR', 'COORDINATOR']) {
    assert.equal((await request('/api/nstp/admin/grades/grade-1/release', { role, method: 'POST', body: {} })).status, 403);
    assert.equal((await request('/api/nstp/admin/grades/grade-1/hold', { role, method: 'POST', body: {} })).status, 403);
  }
});

test('only administrators can manage student profile layouts', async () => {
  const body = { name: 'Blocked layout', configuration: {} };
  assert.equal((await request('/api/nstp/admin/profile-templates', { role: 'STUDENT', method: 'POST', body })).status, 403);
  assert.equal((await request('/api/nstp/admin/profile-templates', { role: 'INSTRUCTOR', method: 'POST', body })).status, 403);
  assert.equal((await request('/api/nstp/admin/profile-templates', { role: 'COORDINATOR', method: 'POST', body })).status, 403);
  assert.equal((await request('/api/nstp/admin/profile-templates/export-events', { role: 'STUDENT', method: 'POST', body: { studentId: 'student-1', format: 'PDF' } })).status, 403);
});

test('students cannot modify grades or use the removed generic route', async () => {
  assert.equal((await request('/api/nstp/admin/grades', { role: 'STUDENT', method: 'POST', body: {} })).status, 403);
  assert.equal((await request('/api/nstp/accounts', { role: 'STUDENT' })).status, 404);
  assert.equal((await request('/api/nstp/students/another-student/grades', { role: 'STUDENT' })).status, 404);
});

test('student record identifiers cannot bypass ownership checks', async () => {
  let observedWhere;
  prisma.studentProfile.findUnique = async ({ where }) => {
    assert.deepEqual(where, { userId: 'student-user' });
    return { id: 'owned-student-profile' };
  };
  prisma.grade.findMany = async ({ where }) => {
    observedWhere = where;
    return [];
  };
  const response = await request('/api/nstp/students/me/grades?studentId=another-student-profile', {
    role: 'STUDENT', id: 'student-user',
  });
  assert.equal(response.status, 200);
  assert.deepEqual(observedWhere, {
    studentId: 'owned-student-profile', isReleased: true,
    schoolYear: { not: null }, semester: { not: null },
  });
});

test('instructors cannot access or modify an unassigned class', async () => {
  prisma.instructorProfile.findUnique = async () => ({ id: 'assigned-instructor' });
  prisma.section.findUnique = async () => ({ id: 'other-class', instructorId: 'different-instructor' });
  assert.equal((await request('/api/nstp/instructors/classes/other-class/students', { role: 'INSTRUCTOR' })).status, 403);
  assert.equal((await request('/api/nstp/instructors/classes/other-class/grades', {
    role: 'INSTRUCTOR', method: 'POST', body: { studentId: 'student-profile', score: 90 },
  })).status, 403);
});

test('coordinators are constrained to their assigned component', async () => {
  let observedWhere;
  prisma.coordinatorProfile.findUnique = async () => ({ id: 'coordinator-profile', componentId: 'component-a' });
  prisma.studentProfile.findMany = async ({ where }) => {
    observedWhere = where;
    return [];
  };
  const response = await request('/api/nstp/coordinators/component/students', { role: 'COORDINATOR' });
  assert.equal(response.status, 200);
  assert.deepEqual(observedWhere, { componentId: { in: ['component-a'] } });
});

test('suspended coordinators cannot use coordinator APIs', async () => {
  prisma.coordinatorProfile.findUnique = async () => ({ id: 'coordinator-profile', scope: 'CWTS', user: { status: 'SUSPENDED' } });
  const response = await request('/api/nstp/coordinators/component/students', { role: 'COORDINATOR' });
  assert.equal(response.status, 403);
});

test('students cannot provision coordinators or facilitators', async () => {
  assert.equal((await request('/api/nstp/admin/coordinators', { role: 'STUDENT', method: 'POST', body: {} })).status, 403);
  assert.equal((await request('/api/nstp/coordinators/facilitators', { role: 'STUDENT', method: 'POST', body: {} })).status, 403);
});

test('administrators can use explicit administrative routes', async () => {
  prisma.user.findMany = async () => [];
  const response = await request('/api/nstp/admin/accounts', { role: 'ADMIN' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});

test('administrator coordinator creation without scope fails before any profile write', async () => {
  let transactionStarted = false;
  prisma.$transaction = async () => { transactionStarted = true; throw new Error('Coordinator write must not run.'); };
  const response = await request('/api/nstp/admin/coordinators', {
    role: 'ADMIN', method: 'POST', body: {
      name: 'Missing Scope Coordinator', email: 'missing-scope@example.test',
      employeeNumber: 'MISSING-SCOPE-1', password: 'SecurePass123!',
    },
  });
  assert.equal(response.status, 400);
  assert.equal(transactionStarted, false);
});

test('pending registration listing excludes decided registrations and credential fields', async () => {
  prisma.pendingRegistration.findMany = async ({ where, select }) => {
    assert.deepEqual(where, { status: 'PENDING' });
    assert.equal(select.password, undefined);
    return [{ id: 'pending-1', email: 'student@example.test' }];
  };
  const response = await request('/api/nstp/admin/pending-registrations', { role: 'ADMIN' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{ id: 'pending-1', email: 'student@example.test' }]);
});

test('registration approval is transactional and replay is rejected', async () => {
  const calls = [];
  const registration = {
    id: 'pending-1', status: 'PENDING', name: 'Student One', email: 'student@example.test',
    password: 'stored-bcrypt-hash', studentId: '2026-0001', yearLevel: '1', degreeProgram: 'BSCS',
  };
  const tx = {
    pendingRegistration: {
      findUnique: async () => registration,
      update: async (args) => { calls.push(['registration', args]); registration.status = 'APPROVED'; return registration; },
    },
    user: {
      findUnique: async () => null,
      create: async (args) => { calls.push(['user', args]); return { id: 'user-1', email: registration.email }; },
    },
    studentProfile: { findUnique: async () => null },
    auditLogEntry: { create: async (args) => { calls.push(['audit', args]); return args.data; } },
  };
  prisma.$transaction = async (operation) => operation(tx);

  assert.deepEqual(await approvePendingRegistration('pending-1', 'admin-1'), { id: 'user-1', email: registration.email });
  assert.deepEqual(calls.map(([name]) => name), ['user', 'registration', 'audit']);
  await assert.rejects(() => approvePendingRegistration('pending-1', 'admin-1'), { statusCode: 409 });
});

test('database outages return 503 rather than an empty grade collection', async () => {
  prisma.grade.findMany = async () => { throw new Error('database connection lost'); };
  const response = await request('/api/nstp/admin/grades', { role: 'ADMIN' });
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.success, false);
  assert.equal(payload.problem.type, 'DATABASE_UNAVAILABLE');
  assert.notDeepEqual(payload, []);
});

test('grade updates and deletion target the grade record id, not the student id', async () => {
  const writes = [];
  prisma.grade.upsert = async (args) => { writes.push(args); return { id: args.where.id, ...args.update }; };
  prisma.grade.delete = async ({ where }) => ({ id: where.id });
  await upsertAdminResource('grades', { id: 'grade-a' }, { id: 'grade-a', studentId: 'student-1', prelim: 80 });
  await upsertAdminResource('grades', { id: 'grade-b' }, { id: 'grade-b', studentId: 'student-1', prelim: 90 });
  assert.deepEqual(writes.map((write) => write.where), [{ id: 'grade-a' }, { id: 'grade-b' }]);
  assert.equal(writes[0].update.prelim, 80);
  assert.equal(writes[1].update.prelim, 90);
  assert.deepEqual(await deleteAdminResource('grades', 'grade-b'), { id: 'grade-b' });
});

test('grade records require an explicit unique grade id', async () => {
  await assert.rejects(
    () => upsertAdminResource('grades', { studentId: 'student-1' }, { studentId: 'student-1', prelim: 80 }),
    { message: /grade id and studentId are required/i },
  );
});

test('account listing uses a safe DTO and never returns password fields', async () => {
  prisma.user.findMany = async ({ select }) => {
    assert.equal(select.passwordHash, undefined);
    return [{
      id: 'account-1', name: 'Account', email: 'account@example.test', role: 'STUDENT',
      passwordHash: 'must-not-leak', password: 'must-not-leak', data: { birthdate: 'private' },
      instructorProfile: null, coordinatorProfile: null,
    }];
  };
  const accounts = await listAdminResource('accounts');
  assert.deepEqual(accounts, [{
    id: 'account-1', name: 'Account', email: 'account@example.test', role: 'STUDENT',
    createdAt: undefined, updatedAt: undefined, instructorProfile: null, coordinatorProfile: null,
  }]);
});

test('administrator account lookup can be scoped to coordinators', async () => {
  prisma.user.findMany = async ({ where }) => {
    assert.deepEqual(where, { role: 'COORDINATOR' });
    return [];
  };
  assert.deepEqual(await listAdminResource('accounts', { role: 'coordinator' }), []);
});

test('single-account and related user responses exclude credential fields', async () => {
  prisma.user.findUnique = async () => ({
    id: 'student-user', name: 'Student', email: 'student@example.test', role: 'STUDENT',
    passwordHash: 'must-not-leak', password: 'must-not-leak', data: { contactNumber: 'self-only' }, studentProfile: null,
  });
  const profile = await getUserById('student-user');
  assert.equal('password' in profile, false);
  assert.equal('passwordHash' in profile, false);

  prisma.studentProfile.findMany = async ({ select }) => {
    assert.equal(select.user.select.passwordHash, undefined);
    assert.equal(select.data, undefined);
    return [];
  };
  assert.deepEqual(await listAdminResource('students'), []);
});

test('passwordHash input is rejected without echoing sensitive request data', async () => {
  const response = await request('/api/nstp/admin/accounts', {
    role: 'ADMIN', method: 'POST', body: { passwordHash: 'client-secret' },
  });
  const payload = await response.json();
  assert.equal(response.status, 400);
  assert.equal(JSON.stringify(payload).includes('client-secret'), false);
  assert.equal(JSON.stringify(payload).includes('passwordHash'), false);
});

test('accounts cannot be created without a secure provisioning password', async () => {
  prisma.user.findUnique = async () => null;
  await assert.rejects(
    () => upsertAdminResource('accounts', { email: 'new@example.test' }, { name: 'New Account', email: 'new@example.test' }),
    { message: /password of at least 8 characters/i },
  );
});

test('clients cannot submit a bcrypt hash as a plaintext provisioning password', async () => {
  prisma.user.findUnique = async () => null;
  await assert.rejects(
    () => upsertAdminResource('accounts', { email: 'new@example.test' }, {
      name: 'New Account', email: 'new@example.test', password: '$2b$10$abcdefghijklmnopqrstuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu',
    }),
    { message: /hashes are not accepted/i },
  );
});

test('facilitators must be assigned between one and three municipalities', async () => {
  prisma.user.findUnique = async () => null;
  const baseAccount = {
    name: 'Facilitator', email: 'facilitator@example.test', password: 'valid-password', role: 'facilitator',
  };

  for (const municipalities of [[], ['Almeria', 'Biliran', 'Cabucgayan', 'Caibiran']]) {
    await assert.rejects(
      () => upsertAdminResource('accounts', { email: baseAccount.email }, { ...baseAccount, municipalities }),
      { message: /between 1 and 3 municipalities/i },
    );
  }
});

test('registration hashes a valid plaintext password only on the backend', async () => {
  let createData;
  prisma.user.findUnique = async () => null;
  prisma.studentProfile.findUnique = async () => null;
  prisma.pendingRegistration.findFirst = async () => null;
  prisma.pendingRegistration.create = async ({ data }) => {
    createData = data;
    return { id: data.id, createdAt: new Date() };
  };
  await registerUser({
    email: 'new.student@example.test', password: 'valid-password', studentId: '2026-0001',
    firstName: 'New', surname: 'Student',
  });
  assert.notEqual(createData.password, 'valid-password');
  assert.equal(await bcrypt.compare('valid-password', createData.password), true);
});

test('the account provisioning service contains no known fallback password', async () => {
  const source = await readFile(new URL('../src/modules/nstp/nstp.service.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /change-me/);
});

test('login sets an HttpOnly session cookie and /auth/me accepts that cookie', async () => {
  const passwordHash = await bcrypt.hash('valid-password', 10);
  prisma.user.findUnique = async ({ where }) => {
    if (where.email) {
      return {
        id: 'cookie-user', name: 'Cookie User', email: 'cookie@example.test', role: 'STUDENT',
        passwordHash, data: {}, studentProfile: { studentNumber: '2026-0002' },
      };
    }
    return { id: 'cookie-user', name: 'Cookie User', email: 'cookie@example.test', role: 'STUDENT', data: {}, studentProfile: null };
  };
  const login = await request('/api/auth/login', {
    method: 'POST', body: { identifier: 'cookie@example.test', password: 'valid-password' },
  });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get('set-cookie') || '';
  assert.match(setCookie, /HttpOnly/i);
  assert.doesNotMatch(JSON.stringify(await login.json()), /token/i);

  const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: setCookie.split(';')[0] } });
  assert.equal(me.status, 200);
});

test('logout clears the session cookie', async () => {
  const response = await request('/api/auth/logout', { method: 'POST' });
  assert.equal(response.status, 204);
  assert.match(response.headers.get('set-cookie') || '', /Expires=Thu, 01 Jan 1970/i);
});
