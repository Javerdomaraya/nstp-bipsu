import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  QUALIFYING_EXAM_ID,
  QUALIFYING_EXAM_QUESTIONS,
  seedQualifyingExam,
} from '../src/seed.js';

test('seedQualifyingExam creates master exam and 10 questions with answer keys', async () => {
  let createdExam = null;
  let createdQuestions = [];

  const mockPrisma = {
    exam: {
      upsert: async ({ create }) => {
        createdExam = create;
        return create;
      },
    },
    question: {
      deleteMany: async () => ({ count: createdQuestions.length }),
      createMany: async ({ data }) => {
        createdQuestions = data;
        return { count: data.length };
      },
    },
  };

  const result = await seedQualifyingExam({ prismaClient: mockPrisma });

  assert.equal(result.examId, QUALIFYING_EXAM_ID);
  assert.equal(result.questionCount, 10);
  assert.equal(createdExam.id, QUALIFYING_EXAM_ID);
  assert.equal(createdQuestions.length, 10);

  // Check each question has prompt, options, answer with correctIndex
  createdQuestions.forEach((q, idx) => {
    assert.equal(q.examId, QUALIFYING_EXAM_ID);
    assert.equal(q.prompt, QUALIFYING_EXAM_QUESTIONS[idx].prompt);
    assert.deepEqual(q.options, QUALIFYING_EXAM_QUESTIONS[idx].options);
    assert.equal(q.answer.correctIndex, QUALIFYING_EXAM_QUESTIONS[idx].correctIndex);
    assert.equal(q.order, idx + 1);
  });
});
