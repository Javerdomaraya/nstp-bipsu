import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';

const { default: prisma } = await import('../src/db/prisma.js');
const {
  submitMyAssessment,
  submitMyQualifyingExam,
} = await import('../src/modules/nstp/nstp.controller.js');
const {
  submitAssessmentSchema,
  submitQualifyingExamSchema,
} = await import('../src/middleware/validationSchemas.js');
const { validateRequest } = await import('../src/middleware/validateRequest.js');

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

const originalQuizFindFirst = prisma.quiz?.findFirst;
const originalSubmissionCount = prisma.submission?.count;
const originalSubmissionCreate = prisma.submission?.create;
const originalExamFindFirst = prisma.exam?.findFirst;
const originalAttemptFindFirst = prisma.qualifyingExamAttempt?.findFirst;

afterEach(() => {
  if (originalQuizFindFirst) prisma.quiz.findFirst = originalQuizFindFirst;
  if (originalSubmissionCount) prisma.submission.count = originalSubmissionCount;
  if (originalSubmissionCreate) prisma.submission.create = originalSubmissionCreate;
  if (originalExamFindFirst) prisma.exam.findFirst = originalExamFindFirst;
  if (originalAttemptFindFirst) prisma.qualifyingExamAttempt.findFirst = originalAttemptFindFirst;
});

test('quiz scoring denominator divides by expected question count and computes correct percentage', async () => {
  // Quiz has 2 expected questions (questionsToShow = 2), but only 1 is answered correctly
  prisma.quiz.findFirst = async () => ({
    id: 'quiz-1',
    data: { passingScore: 70, questionsToShow: 2 },
    questions: [
      { id: 'q-1', options: ['A', 'B'], answer: { correctIndex: 1 } },
      { id: 'q-2', options: ['A', 'B'], answer: { correctIndex: 0 } },
    ],
  });
  prisma.submission.count = async () => 0;
  let createdSubmission = null;
  prisma.submission.create = async ({ data }) => {
    createdSubmission = data;
    return { id: 'sub-1', submittedAt: new Date(), ...data };
  };

  const req = {
    params: { assessmentId: 'quiz-1' },
    student: { id: 'sp-1', componentId: null },
    validated: {
      body: {
        answers: [
          { questionId: 'q-1', optionIndex: 1 }, // correct
          { questionId: 'q-2', optionIndex: 1 }, // incorrect
        ],
      },
    },
  };
  const res = mockResponse();

  await submitMyAssessment(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  // Denominator is expectedCount = 2, correct = 1 -> score = 50
  assert.equal(res.body.data.score, 50);
  assert.equal(res.body.data.total, 2);
  assert.equal(res.body.data.passed, false);
  assert.equal(createdSubmission.score, 50);
});

test('quiz submission with duplicate question IDs is rejected by schema and controller', async () => {
  // 1. Zod schema rejection
  const validator = validateRequest(submitAssessmentSchema);
  let nextCalled = false;
  const duplicateReq = {
    body: {
      answers: [
        { questionId: 'q-1', optionIndex: 0 },
        { questionId: 'q-1', optionIndex: 1 }, // Duplicate questionId
      ],
    },
    params: { assessmentId: 'quiz-1' },
    query: {},
  };
  const duplicateRes = mockResponse();
  validator(duplicateReq, duplicateRes, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(duplicateRes.statusCode, 400);
  assert.match(duplicateRes.body.error, /invalid request/i);

  // 2. Controller rejection
  prisma.quiz.findFirst = async () => ({
    id: 'quiz-1',
    data: { passingScore: 70, questionsToShow: 2 },
    questions: [
      { id: 'q-1', options: ['A', 'B'], answer: { correctIndex: 0 } },
      { id: 'q-2', options: ['A', 'B'], answer: { correctIndex: 0 } },
    ],
  });
  const controllerReq = {
    params: { assessmentId: 'quiz-1' },
    student: { id: 'sp-1', componentId: null },
    validated: {
      body: {
        answers: [
          { questionId: 'q-1', optionIndex: 0 },
          { questionId: 'q-1', optionIndex: 0 },
        ],
      },
    },
  };
  const controllerRes = mockResponse();
  await submitMyAssessment(controllerReq, controllerRes);

  assert.equal(controllerRes.statusCode, 400);
  assert.match(controllerRes.body.error, /duplicate/i);
});

test('qualifying exam submission with duplicate question IDs is rejected by schema and controller', async () => {
  // 1. Schema rejection
  const validator = validateRequest(submitQualifyingExamSchema);
  let nextCalled = false;
  const duplicateReq = {
    body: {
      attemptId: 'attempt-1',
      preferredComponent: 'CWTS',
      answers: [
        { questionId: 'q-1', optionIndex: 0 },
        { questionId: 'q-1', optionIndex: 1 }, // Duplicate
      ],
    },
    params: {},
    query: {},
  };
  const duplicateRes = mockResponse();
  validator(duplicateReq, duplicateRes, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(duplicateRes.statusCode, 400);

  // 2. Controller rejection
  const controllerReq = {
    user: { id: 'student-1' },
    body: {
      attemptId: 'attempt-1',
      preferredComponent: 'CWTS',
      answers: [
        { questionId: 'q-1', optionIndex: 0 },
        { questionId: 'q-1', optionIndex: 1 },
      ],
    },
  };
  const controllerRes = mockResponse();
  await submitMyQualifyingExam(controllerReq, controllerRes);

  assert.equal(controllerRes.statusCode, 400);
  assert.match(controllerRes.body.error, /duplicate/i);
});
