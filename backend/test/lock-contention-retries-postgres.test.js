import { enforceTestDatabase } from './test-db-guard.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://neondb_owner:npg_2wuOR3NhbaAF@ep-long-truth-a1cnk55w.ap-southeast-1.aws.neon.tech/nstp_fresh_test?sslmode=require';
enforceTestDatabase();

process.env.QUALIFYING_LOCK_TIMEOUT_MS = '250';

const { PrismaClient } = await import('@prisma/client');
const { default: prisma } = await import('../src/db/prisma.js');
const { submitMyQualifyingExam, isLockTimeoutError } = await import('../src/modules/nstp/nstp.controller.js');
const { QUALIFYING_EXAM_ID } = await import('../src/seed.js');

function mockResponse() {
  const res = {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(key, val) {
      this.headers[key] = val;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

test('real postgres: isLockTimeoutError correctly recognizes PostgreSQL lock timeout codes', () => {
  assert.equal(isLockTimeoutError({ code: '55P03' }), true);
  assert.equal(isLockTimeoutError({ code: '57014' }), true);
  assert.equal(isLockTimeoutError({ message: 'canceling statement due to lock timeout' }), true);
  assert.equal(isLockTimeoutError({ message: 'could not obtain lock on row in relation' }), true);
  assert.equal(isLockTimeoutError({ code: '23505' }), false);
});

test('real postgres: lock contention recovers via retries when row lock is released before max retries', async () => {
  const blockerPrisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  await blockerPrisma.$connect();

  try {
    const openSY = '2026-2027';
    const openSem = '1st Semester';

    await prisma.componentApplicationState.deleteMany({});
    await prisma.componentApplicationState.create({
      data: { id: `app-state-${Date.now()}`, schoolYear: openSY, semester: openSem, applicationClosed: false, slotLimits: { CWTS: 100 } },
    });

    const exam = await prisma.exam.findFirst({
      where: { id: QUALIFYING_EXAM_ID },
      include: { questions: true },
    });
    assert.ok(exam && exam.questions.length > 0, 'Master qualifying exam must exist');

    const ts = `retry_rec_${Date.now()}`;
    const user = await prisma.user.create({
      data: {
        email: `${ts}@bipsu.edu.ph`,
        name: 'Retry Recovery Student',
        passwordHash: 'dummy-hash',
        role: 'STUDENT',
        studentProfile: {
          create: {
            studentNumber: `SN-${Date.now().toString().slice(-6)}`,
            componentId: null,
          },
        },
      },
      include: { studentProfile: true },
    });

    const answersPayload = exam.questions.map((q) => ({
      questionId: q.id,
      optionIndex: q.answer?.correctIndex ?? 0,
    }));

    const attempt = await prisma.qualifyingExamAttempt.create({
      data: {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        examId: exam.id,
        preferredComponent: 'CWTS',
        answers: { servedQuestionIds: exam.questions.map((q) => q.id) },
        attemptNumber: 1,
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        status: 'STARTED',
      },
    });

    let blockerStarted = false;
    let releaseBlocker = null;
    const blockerPromise = blockerPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT id FROM component_application_state WHERE "applicationClosed" = false FOR UPDATE;');
      blockerStarted = true;
      await new Promise((resolve) => {
        releaseBlocker = resolve;
      });
    }, { timeout: 15000 });

    while (!blockerStarted) {
      await new Promise((r) => setTimeout(r, 20));
    }

    // Release after 400ms so attempt 1 with 250ms lock_timeout fails, but retry succeeds
    setTimeout(() => {
      if (releaseBlocker) releaseBlocker();
    }, 400);

    const req = {
      user: { id: user.id, name: user.name, email: user.email },
      student: { id: user.studentProfile.id },
      body: {
        attemptId: attempt.id,
        preferredComponent: 'CWTS',
        answers: answersPayload,
      },
    };
    const res = mockResponse();

    await submitMyQualifyingExam(req, res);
    await blockerPromise;

    assert.equal(res.statusCode, 201, `Expected 201 after retry recovery, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.data.status, 'assigned-preferred');
    assert.equal(res.body.data.assignedComponent, 'CWTS');

    const updatedProfile = await prisma.studentProfile.findUnique({
      where: { id: user.studentProfile.id },
    });
    assert.ok(
      updatedProfile.componentId === 'CWTS' || updatedProfile.componentId === 'system-component-cwts',
      `Expected placed componentId, got ${updatedProfile.componentId}`
    );
  } finally {
    await blockerPrisma.$disconnect();
  }
});

test('real postgres: lock-timeout exhaustion returns 503 with Retry-After', async () => {
  const blockerPrisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  await blockerPrisma.$connect();

  try {
    const openSY = '2026-2027';
    const openSem = '1st Semester';

    await prisma.componentApplicationState.deleteMany({});
    await prisma.componentApplicationState.create({
      data: { id: `app-state-${Date.now()}`, schoolYear: openSY, semester: openSem, applicationClosed: false, slotLimits: { CWTS: 100 } },
    });

    const exam = await prisma.exam.findFirst({
      where: { id: QUALIFYING_EXAM_ID },
      include: { questions: true },
    });

    const ts = `retry_exh_${Date.now()}`;
    const user = await prisma.user.create({
      data: {
        email: `${ts}@bipsu.edu.ph`,
        name: 'Retry Exhaustion Student',
        passwordHash: 'dummy-hash',
        role: 'STUDENT',
        studentProfile: {
          create: {
            studentNumber: `SN-${Date.now().toString().slice(-6)}`,
            componentId: null,
          },
        },
      },
      include: { studentProfile: true },
    });

    const answersPayload = exam.questions.map((q) => ({
      questionId: q.id,
      optionIndex: q.answer?.correctIndex ?? 0,
    }));

    const attempt = await prisma.qualifyingExamAttempt.create({
      data: {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        examId: exam.id,
        preferredComponent: 'CWTS',
        answers: { servedQuestionIds: exam.questions.map((q) => q.id) },
        attemptNumber: 1,
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        status: 'STARTED',
      },
    });

    let blockerStarted = false;
    let releaseBlocker = null;
    const blockerPromise = blockerPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT id FROM component_application_state WHERE "applicationClosed" = false FOR UPDATE;');
      blockerStarted = true;
      await new Promise((resolve) => {
        releaseBlocker = resolve;
      });
    }, { timeout: 15000 });

    while (!blockerStarted) {
      await new Promise((r) => setTimeout(r, 20));
    }

    const req = {
      user: { id: user.id, name: user.name, email: user.email },
      student: { id: user.studentProfile.id },
      body: {
        attemptId: attempt.id,
        preferredComponent: 'CWTS',
        answers: answersPayload,
      },
    };
    const res = mockResponse();

    try {
      await submitMyQualifyingExam(req, res);
    } finally {
      if (releaseBlocker) releaseBlocker();
      await blockerPromise;
    }

    assert.equal(res.statusCode, 503, `Expected 503 on lock exhaustion, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    assert.equal(res.headers['Retry-After'], '2');
    assert.match(res.body.error, /temporarily busy/i);
  } finally {
    await blockerPrisma.$disconnect();
  }
});
