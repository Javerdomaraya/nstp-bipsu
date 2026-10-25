import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';

const { countDistinctPlacedStudents } = await import('../src/modules/nstp/nstp.service.js');

test('countDistinctPlacedStudents queries single source StudentProfile.componentId', async () => {
  let queriedWhere = null;
  const mockTx = {
    nSTPComponent: {
      findFirst: async () => ({ id: 'comp-cwts', type: 'CWTS' }),
    },
    studentProfile: {
      count: async ({ where }) => {
        queriedWhere = where;
        return 5;
      },
    },
  };

  const count = await countDistinctPlacedStudents(mockTx, {
    canonicalComponent: 'CWTS',
    currentStudentId: 'sp-current',
    currentUserId: 'user-current',
  });

  assert.equal(count, 5);
  assert.equal(queriedWhere.componentId, 'comp-cwts');
  assert.equal(queriedWhere.id.not, 'sp-current');
  assert.equal(queriedWhere.userId.not, 'user-current');
  assert.equal(queriedWhere.enrollments, undefined);
});

test('countDistinctPlacedStudents applies term-aware enrollment filter when schoolYear and semester are provided', async () => {
  let queriedWhere = null;
  const mockTx = {
    nSTPComponent: {
      findFirst: async () => ({ id: 'comp-lts', type: 'LTS' }),
    },
    studentProfile: {
      count: async ({ where }) => {
        queriedWhere = where;
        return 3;
      },
    },
  };

  const count = await countDistinctPlacedStudents(mockTx, {
    canonicalComponent: 'LTS',
    schoolYear: 'SY 2025-2026',
    semester: 'FIRST',
  });

  assert.equal(count, 3);
  assert.equal(queriedWhere.componentId, 'comp-lts');
  assert.deepEqual(queriedWhere.enrollments, {
    some: {
      status: 'ACTIVE',
      section: {
        schoolYear: 'SY 2025-2026',
        semester: 'FIRST',
      },
    },
  });
});
