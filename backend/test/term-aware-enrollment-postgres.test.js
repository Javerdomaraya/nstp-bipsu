import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://neondb_owner:npg_2wuOR3NhbaAF@ep-long-truth-a1cnk55w.ap-southeast-1.aws.neon.tech/nstp_fresh_test?sslmode=require';

const { default: prisma } = await import('../src/db/prisma.js');
const { placeStudent, countDistinctPlacedStudents } = await import('../src/modules/nstp/nstp.service.js');
const { startMyQualifyingExam, submitMyQualifyingExam } = await import('../src/modules/nstp/nstp.controller.js');
const { QUALIFYING_EXAM_ID } = await import('../src/seed.js');

function mockResponse() {
  const res = {
    statusCode: 200,
    body: null,
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

test('real postgres: unsectioned exam-placed students consume slots; last semester students do not; other component enrollments dropped', async () => {
  const openSY = '2026-2027';
  const openSem = '1st Semester';
  const lastSY = '2025-2026';
  const lastSem = '2nd Semester';

  // 1. Ensure CWTS and LTS exist
  const cwts = await prisma.nSTPComponent.upsert({
    where: { type: 'CWTS' },
    update: {},
    create: { type: 'CWTS', name: 'CWTS Regular' },
  });
  const lts = await prisma.nSTPComponent.upsert({
    where: { type: 'LTS' },
    update: {},
    create: { type: 'LTS', name: 'Literacy Training Service' },
  });

  // 2. Set application state with open cycle
  await prisma.componentApplicationState.upsert({
    where: { id: 'default' },
    update: {
      schoolYear: openSY,
      semester: openSem,
      slotLimits: { CWTS: 1, LTS: 1 },
      qualifyingScore: 70,
    },
    create: {
      id: 'default',
      schoolYear: openSY,
      semester: openSem,
      slotLimits: { CWTS: 1, LTS: 1 },
      qualifyingScore: 70,
    },
  });

  // 3. Ensure Qualifying Exam exists
  const questionId = 'q-term-test-1';
  let exam = await prisma.exam.findFirst({
    where: {
      OR: [
        { id: QUALIFYING_EXAM_ID },
        { title: { contains: 'Qualifying' } },
      ],
    },
  });
  if (!exam) {
    exam = await prisma.exam.create({
      data: {
        id: QUALIFYING_EXAM_ID,
        title: 'NSTP Qualifying Examination',
        durationMinutes: 60,
        passingPercentage: 70,
        published: true,
      },
    });
  }

  await prisma.question.upsert({
    where: { id: questionId },
    update: {
      examId: exam.id,
      prompt: 'Qualifying Question 1',
      options: ['Option A', 'Option B'],
      answer: { correctIndex: 0 },
      order: 0,
    },
    create: {
      id: questionId,
      examId: exam.id,
      prompt: 'Qualifying Question 1',
      options: ['Option A', 'Option B'],
      answer: { correctIndex: 0 },
      order: 0,
    },
  });

  // Ensure all questions on this exam have correctIndex: 0
  await prisma.question.updateMany({
    where: { examId: exam.id },
    data: { answer: { correctIndex: 0 } },
  });

  // Helper to create ready student with 25 common module hours
  async function createReadyStudent(prefix) {
    const ts = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const user = await prisma.user.create({
      data: {
        email: `${ts}@bipsu.edu.ph`,
        name: `Student ${prefix}`,
        passwordHash: 'dummy-hash',
        role: 'STUDENT',
        studentProfile: {
          create: {
            studentNumber: `SN-${ts}`,
            course: 'BSIT',
            yearLevel: '1',
          },
        },
      },
      include: { studentProfile: true },
    });
    const commonMod = await prisma.module.create({
      data: {
        title: `Mod ${ts}`,
        hours: 25,
        componentId: null,
      },
    });
    await prisma.moduleProgress.create({
      data: {
        studentId: user.studentProfile.id,
        moduleId: commonMod.id,
        completedAt: new Date(),
      },
    });
    return { user, student: user.studentProfile };
  }

  // --- PART 1: Unsectioned exam-placed students consume slots ---
  const s1 = await createReadyStudent('s1');
  const s2 = await createReadyStudent('s2');

  // S1 starts and submits exam for CWTS
  const res1Start = mockResponse();
  await startMyQualifyingExam({ user: s1.user, student: s1.student, body: { preferredComponent: 'CWTS' } }, res1Start);
  assert.equal(res1Start.statusCode, 201);
  const attempt1Id = res1Start.body.data.attemptId;
  const questions1 = res1Start.body.data.questions;

  const res1Submit = mockResponse();
  await submitMyQualifyingExam({
    user: s1.user,
    student: s1.student,
    body: {
      attemptId: attempt1Id,
      preferredComponent: 'CWTS',
      answers: questions1.map((q) => ({ questionId: q.id, optionIndex: 0 })),
    },
  }, res1Submit);

  assert.equal(res1Submit.statusCode, 201);
  assert.equal(res1Submit.body.data.status, 'assigned-preferred');
  assert.equal(res1Submit.body.data.assignedComponent, 'CWTS');

  // Verify S1 is unsectioned (sectionId is null) but has ACTIVE enrollment in open cycle
  const s1Enrollment = await prisma.enrollment.findFirst({
    where: { studentId: s1.student.id, componentId: cwts.id, status: 'ACTIVE' },
  });
  assert.ok(s1Enrollment, 'S1 must have an ACTIVE enrollment');
  assert.equal(s1Enrollment.sectionId, null, 'S1 enrollment must be unsectioned (sectionId: null)');
  assert.equal(s1Enrollment.schoolYear, openSY, 'S1 enrollment must be stamped with open schoolYear');
  assert.equal(s1Enrollment.semester, openSem, 'S1 enrollment must be stamped with open semester');

  // S2 starts and submits exam for CWTS with 100% score
  const res2Start = mockResponse();
  await startMyQualifyingExam({ user: s2.user, student: s2.student, body: { preferredComponent: 'CWTS' } }, res2Start);
  assert.equal(res2Start.statusCode, 201);
  const attempt2Id = res2Start.body.data.attemptId;
  const questions2 = res2Start.body.data.questions;

  const res2Submit = mockResponse();
  await submitMyQualifyingExam({
    user: s2.user,
    student: s2.student,
    body: {
      attemptId: attempt2Id,
      preferredComponent: 'CWTS',
      answers: questions2.map((q) => ({ questionId: q.id, optionIndex: 0 })),
    },
  }, res2Submit);

  // S2 MUST be waitlisted because unsectioned S1 already consumed the 1 slot!
  assert.equal(res2Submit.statusCode, 201);
  assert.equal(
    res2Submit.body.data.status,
    'waitlisted',
    'S2 must be waitlisted because unsectioned exam-placed S1 consumed the single CWTS slot'
  );

  // --- PART 2: Last semester students do not consume slots ---
  // Create Student 3 with ACTIVE enrollment in LTS from LAST semester
  const s3 = await createReadyStudent('s3');
  await prisma.enrollment.create({
    data: {
      studentId: s3.student.id,
      componentId: lts.id,
      sectionId: null,
      status: 'ACTIVE',
      schoolYear: lastSY,
      semester: lastSem,
    },
  });
  await prisma.studentProfile.update({
    where: { id: s3.student.id },
    data: { componentId: lts.id },
  });

  // Verify LTS slot count for open cycle is 0, even though S3 exists from last semester
  const ltsCount = await countDistinctPlacedStudents(prisma, {
    canonicalComponent: 'LTS',
    schoolYear: openSY,
    semester: openSem,
  });
  assert.equal(ltsCount, 0, 'Last semester student must not count towards open cycle quota');

  // S4 takes exam preferring LTS
  const s4 = await createReadyStudent('s4');
  const res4Start = mockResponse();
  await startMyQualifyingExam({ user: s4.user, student: s4.student, body: { preferredComponent: 'LTS' } }, res4Start);
  const attempt4Id = res4Start.body.data.attemptId;
  const questions4 = res4Start.body.data.questions;

  const res4Submit = mockResponse();
  await submitMyQualifyingExam({
    user: s4.user,
    student: s4.student,
    body: {
      attemptId: attempt4Id,
      preferredComponent: 'LTS',
      answers: questions4.map((q) => ({ questionId: q.id, optionIndex: 0 })),
    },
  }, res4Submit);

  // S4 must be assigned-preferred (last semester S3 did not consume LTS slot!)
  assert.equal(res4Submit.statusCode, 201);
  assert.equal(res4Submit.body.data.status, 'assigned-preferred');
  assert.equal(res4Submit.body.data.assignedComponent, 'LTS');

  // --- PART 3: placeStudent drops other components' enrollments for that term ---
  const s5 = await createReadyStudent('s5');
  // First enroll S5 in CWTS for open cycle
  await placeStudent(prisma, {
    studentId: s5.student.id,
    canonicalComponent: 'CWTS',
    schoolYear: openSY,
    semester: openSem,
  });

  const cwtsEnrollmentBefore = await prisma.enrollment.findFirst({
    where: { studentId: s5.student.id, componentId: cwts.id, schoolYear: openSY, semester: openSem },
  });
  assert.equal(cwtsEnrollmentBefore.status, 'ACTIVE');

  // Now reassign S5 to LTS for open cycle
  await placeStudent(prisma, {
    studentId: s5.student.id,
    canonicalComponent: 'LTS',
    schoolYear: openSY,
    semester: openSem,
  });

  const cwtsEnrollmentAfter = await prisma.enrollment.findFirst({
    where: { studentId: s5.student.id, componentId: cwts.id, schoolYear: openSY, semester: openSem },
  });
  assert.equal(cwtsEnrollmentAfter.status, 'DROPPED', "Previous component's enrollment must be DROPPED for that term");

  const ltsEnrollmentAfter = await prisma.enrollment.findFirst({
    where: { studentId: s5.student.id, componentId: lts.id, schoolYear: openSY, semester: openSem },
  });
  assert.equal(ltsEnrollmentAfter.status, 'ACTIVE', 'New component enrollment must be ACTIVE');
});
