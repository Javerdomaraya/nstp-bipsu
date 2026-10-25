import { enforceTestDatabase } from './test-db-guard.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/nstp_test';
enforceTestDatabase();

const { default: prisma } = await import('../src/db/prisma.js');
const {
  createProfileTemplateDraft,
  publishProfileTemplate,
  recordProfileExportEvent,
} = await import('../src/modules/profileTemplates/profileTemplates.service.js');
const { profileTemplateConfigurationSchema } = await import('../src/modules/profileTemplates/profileTemplates.validation.js');

const originalTransaction = prisma.$transaction;
const originalAuditCreate = prisma.auditLogEntry.create;

afterEach(() => {
  prisma.$transaction = originalTransaction;
  prisma.auditLogEntry.create = originalAuditCreate;
});

const configuration = {
  layout: 'classic', pageSize: 'a4', orientation: 'portrait',
  republicLine: 'Republic of the Philippines', schoolName: 'BiPSU', certificationLine: '',
  officeName: 'NSTP Office', formTitle: 'Student Profile', academicPeriod: 'AY 2026-2027',
  fieldHeader: 'Field', valueHeader: 'Value', accentColor: '#1d4ed8', leftCopyLabel: '',
  rightCopyLabel: '', studentSignatureLabel: 'Student signature',
  signatoryName: 'Dr. Reynold G. Bustillo', signatoryTitle: 'NSTP DIRECTOR',
  signatureSpacing: 48, fieldOrder: ['studentId', 'email'], showFieldBorders: true, repeatHeader: true,
};

test('profile layout drafts receive a server-generated sequential version and audit event', async () => {
  let createData;
  const auditEntries = [];
  const tx = {
    profileExportTemplate: {
      aggregate: async () => ({ _max: { version: 4 } }),
      create: async ({ data }) => { createData = data; return { id: 'template-5', ...data }; },
    },
    auditLogEntry: { create: async ({ data }) => { auditEntries.push(data); return data; } },
  };
  prisma.$transaction = async (operation) => operation(tx);

  const result = await createProfileTemplateDraft('admin-1', 'Official profile', configuration);

  assert.equal(result.version, 5);
  assert.equal(createData.status, 'DRAFT');
  assert.equal(createData.isActive, undefined);
  assert.equal(createData.createdById, 'admin-1');
  assert.equal(auditEntries[0].action, 'PROFILE_TEMPLATE_DRAFT_CREATED');
  assert.equal(auditEntries[0].detail.includes('signatoryName'), false);
});

test('publishing atomically replaces the active layout', async () => {
  const calls = [];
  const tx = {
    profileExportTemplate: {
      findFirst: async () => ({ id: 'draft-2', version: 2, status: 'DRAFT' }),
      updateMany: async (args) => { calls.push(['deactivate', args]); return { count: 1 }; },
      update: async (args) => { calls.push(['publish', args]); return { id: 'draft-2', version: 2, status: 'PUBLISHED', isActive: true }; },
    },
    auditLogEntry: { create: async ({ data }) => { calls.push(['audit', data]); return data; } },
  };
  prisma.$transaction = async (operation) => operation(tx);

  const result = await publishProfileTemplate('admin-1', 'draft-2');

  assert.equal(result.isActive, true);
  assert.deepEqual(calls.map(([name]) => name), ['deactivate', 'publish', 'audit']);
  assert.deepEqual(calls[1][1].data, { status: 'PUBLISHED', isActive: true, updatedById: 'admin-1' });
});

test('published layouts cannot be published again', async () => {
  const tx = {
    profileExportTemplate: { findFirst: async () => ({ id: 'published-1', status: 'PUBLISHED' }) },
    auditLogEntry: { create: async () => assert.fail('replay must not be audited as successful') },
  };
  prisma.$transaction = async (operation) => operation(tx);
  await assert.rejects(() => publishProfileTemplate('admin-1', 'published-1'), /only a draft/i);
});

test('strict template validation rejects unknown fields, duplicate rows, and unsafe header protocols', () => {
  assert.equal(profileTemplateConfigurationSchema.safeParse({ ...configuration, unexpected: true }).success, false);
  assert.equal(profileTemplateConfigurationSchema.safeParse({ ...configuration, fieldOrder: ['email', 'email'] }).success, false);
  assert.equal(profileTemplateConfigurationSchema.safeParse({ ...configuration, headerImageDataUrl: 'data:text/html;base64,PHNjcmlwdD4=' }).success, false);
  assert.equal(profileTemplateConfigurationSchema.safeParse(configuration).success, true);
});

test('profile export audits contain only actor, student identifier, and format', async () => {
  let auditData;
  prisma.auditLogEntry.create = async ({ data }) => { auditData = data; return data; };

  assert.deepEqual(await recordProfileExportEvent('admin-1', 'student-1', 'PDF'), { recorded: true });
  assert.equal(auditData.actor, 'admin-1');
  assert.equal(auditData.action, 'PROFILE_EXPORTED');
  assert.deepEqual(JSON.parse(auditData.detail), { studentId: 'student-1', format: 'PDF' });
});
