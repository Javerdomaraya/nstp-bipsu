import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';

const { countDistinctPlacedStudents } = await import('../src/modules/nstp/nstp.service.js');

test('countDistinctPlacedStudents counts distinct individuals even if duplicate result or enrollment records exist', async () => {
  const mockTx = {
    nSTPComponent: {
      findFirst: async () => ({ id: 'comp-cwts', type: 'CWTS' }),
    },
    // Student A has 2 active enrollment records in CWTS
    enrollment: {
      findMany: async () => [
        { studentId: 'student-A' },
        { studentId: 'student-A' }, // duplicate enrollment
        { studentId: 'student-B' },
      ],
    },
    // Student A and B also have profiles in CWTS
    studentProfile: {
      findMany: async () => [
        { id: 'sp-A', userId: 'student-A' },
        { id: 'sp-B', userId: 'student-B' },
      ],
    },
    // Student A has 2 qualifying result rows in CWTS
    qualifyingExamResult: {
      findMany: async () => [
        { userId: 'student-A', assignedComponent: 'CWTS' },
        { userId: 'student-A', assignedComponent: 'CWTS' }, // duplicate result
        { userId: 'student-B', assignedComponent: 'CWTS' },
      ],
    },
  };

  const count = await countDistinctPlacedStudents(mockTx, {
    canonicalComponent: 'CWTS',
    currentStudentId: 'student-C',
    currentUserId: 'student-C',
  });

  // Despite 7 total rows, only 2 distinct students (student-A, student-B) exist!
  assert.equal(count, 2, 'Must deduplicate placed students and count distinct individuals');
});

test('countDistinctPlacedStudents excludes the current student from the quota count', async () => {
  const mockTx = {
    nSTPComponent: {
      findFirst: async () => ({ id: 'comp-lts', type: 'LTS' }),
    },
    enrollment: {
      findMany: async (args) => {
        // Enforce that current student is filtered out
        assert.ok(args.where.studentId.not === 'student-current');
        return [{ studentId: 'student-other' }];
      },
    },
    studentProfile: {
      findMany: async () => [{ id: 'sp-other', userId: 'student-other' }],
    },
    qualifyingExamResult: {
      findMany: async (args) => {
        assert.ok(args.where.userId.not === 'user-current');
        return [{ userId: 'student-other', assignedComponent: 'LTS' }];
      },
    },
  };

  const count = await countDistinctPlacedStudents(mockTx, {
    canonicalComponent: 'LTS',
    currentStudentId: 'student-current',
    currentUserId: 'user-current',
  });

  assert.equal(count, 1);
});
