import { enforceTestDatabase } from './test-db-guard.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, afterEach, before, test } from 'node:test';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'h3-h4-test-secret';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/nstp_test';
enforceTestDatabase();

const { createApp } = await import('../src/app.js');
const { default: prisma } = await import('../src/db/prisma.js');
const { authenticateSocketHandshake, emitToRoom, resolveAuthorizedRooms } = await import('../src/websocket.js');

let server;
let baseUrl;
const originals = {
  userFindUnique: prisma.user.findUnique,
  followFindUnique: prisma.follow.findUnique,
  followCreate: prisma.follow.create,
  followDeleteMany: prisma.follow.deleteMany,
  followCount: prisma.follow.count,
  enrollmentFindFirst: prisma.enrollment.findFirst,
  paymentFindUnique: prisma.payment.findUnique,
  paymentCreate: prisma.payment.create,
  studentFindUnique: prisma.studentProfile.findUnique,
  instructorFindUnique: prisma.instructorProfile.findUnique,
  sectionFindMany: prisma.section.findMany,
  coordinatorFindUnique: prisma.coordinatorProfile.findUnique,
};

function token(role, id) {
  return jwt.sign({ id, email: `${id}@example.test`, role }, process.env.JWT_SECRET, { algorithm: 'HS256' });
}

async function request(path, { role = 'STUDENT', id = 'actor-user', method = 'POST', body, headers = {} } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token(role, id)}`, 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function socketHandshake({ origin = 'http://localhost:5173', sessionToken } = {}) {
  const socket = { handshake: { headers: { origin, cookie: sessionToken ? `nstp_auth=${sessionToken}` : '' } } };
  const error = await new Promise((resolve) => authenticateSocketHandshake(socket, resolve));
  return { socket, error };
}

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => {
  prisma.user.findUnique = originals.userFindUnique;
  prisma.follow.findUnique = originals.followFindUnique;
  prisma.follow.create = originals.followCreate;
  prisma.follow.deleteMany = originals.followDeleteMany;
  prisma.follow.count = originals.followCount;
  prisma.enrollment.findFirst = originals.enrollmentFindFirst;
  prisma.payment.findUnique = originals.paymentFindUnique;
  prisma.payment.create = originals.paymentCreate;
  prisma.studentProfile.findUnique = originals.studentFindUnique;
  prisma.instructorProfile.findUnique = originals.instructorFindUnique;
  prisma.section.findMany = originals.sectionFindMany;
  prisma.coordinatorProfile.findUnique = originals.coordinatorFindUnique;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

test('follows derive the actor from authentication and reject client actor IDs', async () => {
  const rejected = await request('/api/follows', { body: { followerId: 'victim-user', targetUserId: 'target-user' } });
  assert.equal(rejected.status, 400);

  let created;
  prisma.user.findUnique = async () => ({ id: 'target-user' });
  prisma.follow.findUnique = async () => null;
  prisma.follow.create = async ({ data }) => { created = data; return { id: 'follow-1', ...data }; };
  prisma.follow.count = async () => 1;
  const response = await request('/api/follows', { body: { targetUserId: 'target-user' } });
  assert.equal(response.status, 201);
  assert.deepEqual(created, { followerId: 'actor-user', targetUserId: 'target-user' });
});

test('self-follows and deletion of another user follow are rejected', async () => {
  const self = await request('/api/follows', { body: { targetUserId: 'actor-user' } });
  assert.equal(self.status, 400);

  let deleteWhere;
  prisma.follow.deleteMany = async ({ where }) => { deleteWhere = where; return { count: 0 }; };
  const deletion = await request('/api/follows/target-user', { method: 'DELETE', body: undefined });
  assert.equal(deletion.status, 404);
  assert.deepEqual(deleteWhere, { followerId: 'actor-user', targetUserId: 'target-user' });
});

test('payments bind the actor to authentication and remain pending without a provider', async () => {
  const payload = { amount: 125, currency: 'PHP', purpose: 'ENROLLMENT_FEE', targetEnrollmentId: 'enrollment-1' };
  const attackerSuppliedUser = await request('/api/payments/charge', {
    body: { ...payload, userId: 'victim-user' }, headers: { 'Idempotency-Key': 'security-test-key-0001' },
  });
  assert.equal(attackerSuppliedUser.status, 400);

  let enrollmentWhere;
  let paymentData;
  prisma.user.findUnique = async ({ where }) => ({ id: where.id });
  prisma.enrollment.findFirst = async ({ where }) => { enrollmentWhere = where; return { id: 'enrollment-1' }; };
  prisma.payment.findUnique = async () => null;
  prisma.payment.create = async ({ data }) => { paymentData = data; return { id: 'payment-1', ...data }; };
  const response = await request('/api/payments/charge', {
    body: payload, headers: { 'Idempotency-Key': 'security-test-key-0001' },
  });
  assert.equal(response.status, 202);
  assert.deepEqual(enrollmentWhere, { id: 'enrollment-1', student: { userId: 'actor-user' } });
  assert.equal(paymentData.userId, 'actor-user');
  assert.equal(paymentData.status, 'PENDING');
  assert.deepEqual(await response.json(), {
    id: 'payment-1', amount: 125, currency: 'PHP', purpose: 'ENROLLMENT_FEE', targetEnrollmentId: 'enrollment-1',
    status: 'PENDING', providerStatus: 'NOT_CONFIGURED', reused: false,
  });
});

test('payment idempotency returns the existing pending payment', async () => {
  prisma.user.findUnique = async () => ({ id: 'actor-user' });
  prisma.enrollment.findFirst = async () => ({ id: 'enrollment-1' });
  prisma.payment.findUnique = async () => ({
    id: 'payment-1', amount: 125, currency: 'PHP', purpose: 'ENROLLMENT_FEE', targetEnrollmentId: 'enrollment-1', status: 'PENDING',
  });
  const response = await request('/api/payments/charge', {
    body: { amount: 125, currency: 'PHP', purpose: 'ENROLLMENT_FEE', targetEnrollmentId: 'enrollment-1' },
    headers: { 'Idempotency-Key': 'security-test-key-0002' },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).reused, true);
});

test('socket handshakes reject missing credentials, invalid tokens, and unapproved origins', async () => {
  assert.ok((await socketHandshake()).error);
  assert.ok((await socketHandshake({ sessionToken: 'invalid-token' })).error);
  assert.ok((await socketHandshake({ origin: 'https://attacker.example', sessionToken: token('STUDENT', 'student-user') })).error);
});

test('socket rooms are derived from verified role assignments only', async () => {
  prisma.user.findUnique = async ({ where }) => ({ id: where.id, email: `${where.id}@example.test`, role: 'STUDENT', status: 'ACTIVE' });
  prisma.studentProfile.findUnique = async () => ({ sectionId: 'class-1', componentId: 'component-1' });
  const valid = await socketHandshake({ sessionToken: token('STUDENT', 'student-user') });
  assert.equal(valid.error, undefined);
  assert.equal(valid.socket.user.id, 'student-user');
  assert.deepEqual(valid.socket.authorizedRooms, ['user:student-user', 'class:class-1', 'component:component-1']);
  assert.equal(valid.socket.authorizedRooms.includes('role:admin'), false);

  prisma.instructorProfile.findUnique = async () => ({ id: 'instructor-profile' });
  prisma.section.findMany = async () => [];
  assert.deepEqual(await resolveAuthorizedRooms({ id: 'instructor-user', role: 'INSTRUCTOR' }), ['user:instructor-user']);
});

test('suspended accounts cannot establish realtime connections', async () => {
  prisma.user.findUnique = async ({ where }) => ({ id: where.id, email: `${where.id}@example.test`, role: 'COORDINATOR', status: 'SUSPENDED' });
  const result = await socketHandshake({ sessionToken: token('COORDINATOR', 'suspended-coordinator') });
  assert.ok(result.error);
});

test('websocket delivery is room-scoped and never uses a global sensitive broadcast', async () => {
  const emissions = [];
  const socketServer = {
    to(room) {
      return { emit(event, payload) { emissions.push({ room, event, payload }); } };
    },
  };
  emitToRoom(socketServer, 'user:student-user', 'grade-updated', { gradeId: 'grade-1', status: 'released' });
  assert.deepEqual(emissions, [{
    room: 'user:student-user', event: 'grade-updated', payload: { gradeId: 'grade-1', status: 'released' },
  }]);

  const source = await readFile(new URL('../src/websocket.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bio\.emit\(/);
  assert.match(source, /emitToRoom\(io, 'role:admin', 'data-changed'/);
  assert.match(source, /emitToRoom\(io, `user:\$\{userId\}`, event, payload\)/);
});
