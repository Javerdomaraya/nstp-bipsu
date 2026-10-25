import { enforceTestDatabase } from './test-db-guard.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/nstp_test';
enforceTestDatabase();

const { default: prisma } = await import('../src/db/prisma.js');
const { upsertAdminResource } = await import('../src/modules/nstp/nstp.service.js');
const originalUpsert = prisma.module.upsert;

afterEach(() => {
  prisma.module.upsert = originalUpsert;
});

test('module URLs reject unsafe protocols and unapproved iframe hosts', async () => {
  for (const videoUrl of ['javascript:alert(1)', 'data:text/html,alert(1)', 'file:///etc/passwd', 'https://attacker.example/embed']) {
    await assert.rejects(
      () => upsertAdminResource('modules', { id: 'module-1' }, { id: 'module-1', title: 'Module', videoUrl }),
      /videoUrl/,
    );
  }
  await assert.rejects(
    () => upsertAdminResource('modules', { id: 'module-1' }, {
      id: 'module-1', title: 'Module', data: { documentLink: 'javascript:alert(1)' },
    }),
    /documentLink/,
  );
});

test('module URLs normalize approved HTTPS media and external links', async () => {
  let args;
  prisma.module.upsert = async (input) => { args = input; return input.create; };
  await upsertAdminResource('modules', { id: 'module-1' }, {
    id: 'module-1', title: 'Module',
    videoUrl: 'https://www.youtube.com/watch?v=approved-video',
    documentLink: 'https://drive.google.com/file/d/abc',
    meetingLink: 'https://meet.google.com/abc-defg-hij',
  });
  assert.equal(args.create.data.videoUrl, 'https://www.youtube.com/watch?v=approved-video');
  assert.equal(args.create.data.documentLink, 'https://drive.google.com/file/d/abc');
  assert.equal(args.create.data.meetingLink, 'https://meet.google.com/abc-defg-hij');
});
