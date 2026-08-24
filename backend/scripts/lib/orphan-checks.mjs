// Referential-integrity relationship definitions and runner for the orphan gate.
//
// PostgreSQL enforces these relationships via physical foreign keys, but this
// repository has in-repo proof that DDL has silently failed to apply in at least
// one deployment (see 20260803170000_repair_coordinator_role_enum). A missing FK
// is invisible to `prisma migrate status`, so orphan rows are possible even
// though the Prisma schema declares the relation. This gate checks the data
// directly rather than trusting migration history.
//
// Samples project the row id and the dangling key value only. Those are the two
// things an operator needs to locate and fix the row; anything else would put
// names, titles, or grades into a deployment log.

import {
  CHECK_STATUS,
  SEVERITY,
  SAMPLE_LIMIT,
  isBootstrapDatabase,
  summarize,
} from './release-gate.mjs';

// Every declared relation in schema.prisma that stores a foreign key column.
// `required: true` means the relationship must be verifiable: if the table or
// column is absent the gate blocks rather than reporting success.
export const FOREIGN_KEY_RELATIONSHIPS = Object.freeze([
  ['student_profile', 'userId', 'user'],
  ['student_profile', 'sectionId', 'section'],
  ['student_profile', 'componentId', 'nstp_component'],
  ['instructor_profile', 'userId', 'user'],
  ['instructor_profile', 'coordinatorId', 'coordinator_profile'],
  ['instructor_profile', 'componentId', 'nstp_component'],
  ['coordinator_profile', 'userId', 'user'],
  ['coordinator_profile', 'componentId', 'nstp_component'],
  ['section', 'componentId', 'nstp_component'],
  ['section', 'instructorId', 'instructor_profile'],
  ['module', 'componentId', 'nstp_component'],
  ['module', 'instructorId', 'instructor_profile'],
  ['lesson', 'moduleId', 'module'],
  ['quiz', 'moduleId', 'module'],
  ['question', 'quizId', 'quiz'],
  ['question', 'examId', 'exam'],
  ['assignment', 'moduleId', 'module'],
  ['exam', 'moduleId', 'module'],
  ['submission', 'studentId', 'student_profile'],
  ['submission', 'lessonId', 'lesson'],
  ['submission', 'quizId', 'quiz'],
  ['submission', 'assignmentId', 'assignment'],
  ['submission', 'examId', 'exam'],
  ['enrollment', 'studentId', 'student_profile'],
  ['enrollment', 'componentId', 'nstp_component'],
  ['enrollment', 'sectionId', 'section'],
  ['grade', 'studentId', 'student_profile'],
  ['grade', 'componentId', 'nstp_component'],
  ['grade', 'moduleId', 'module'],
  ['grade', 'quizId', 'quiz'],
  ['grade', 'assignmentId', 'assignment'],
  ['grade', 'examId', 'exam'],
  ['follow', 'followerId', 'user'],
  ['follow', 'targetUserId', 'user'],
  ['payment', 'userId', 'user'],
  ['payment', 'targetEnrollmentId', 'enrollment'],
  // module_progress declares both foreign keys inline in its creating migration
  // (module_progress_studentId_fkey, module_progress_moduleId_fkey, both
  // CASCADE), so it is covered here for completeness rather than suspicion.
  ['module_progress', 'studentId', 'student_profile'],
  ['module_progress', 'moduleId', 'module'],
].map(([child, column, parent]) => Object.freeze({
  name: `${child}.${column} -> ${parent}.id`,
  child,
  column,
  parent,
  severity: SEVERITY.BLOCKER,
})));

// Legacy-data observations that need a human decision rather than a hard stop.
export const LEGACY_REVIEWS = Object.freeze([
  {
    name: 'assessments_using_placeholder_module_ids',
    severity: SEVERITY.REVIEW,
    issue: 'Assessments using legacy placeholder module IDs require administrator review.',
    tables: ['quiz'],
    columns: ['quiz.moduleId'],
    sql: `SELECT "id", "moduleId" FROM "quiz" WHERE "moduleId" IN ('m1', 'unknown')`,
  },
  {
    name: 'assessments_with_embedded_question_definitions',
    severity: SEVERITY.REVIEW,
    issue:
      'Legacy assessments still use embedded question definitions; editing them will migrate questions into relational rows.',
    tables: ['quiz', 'question'],
    columns: ['quiz.data', 'question.quizId'],
    sql: `SELECT quiz_row."id" FROM "quiz" quiz_row
      WHERE jsonb_array_length(
        CASE WHEN jsonb_typeof(quiz_row."data"->'questions') = 'array'
          THEN quiz_row."data"->'questions' ELSE '[]'::jsonb END
      ) > 0
      AND NOT EXISTS (
        SELECT 1 FROM "question" question_row WHERE question_row."quizId" = quiz_row."id"
      )`,
  },
]);

export function buildOrphanQuery({ child, column, parent }, limit = SAMPLE_LIMIT) {
  return `SELECT child."id", child."${column}" AS "danglingValue",
      COUNT(*) OVER()::integer AS "__total"
    FROM "${child}" child
    LEFT JOIN "${parent}" parent ON parent."id" = child."${column}"
    WHERE child."${column}" IS NOT NULL AND parent."id" IS NULL
    ORDER BY child."id"
    LIMIT ${limit}`;
}

export function buildReviewQuery(sql, limit = SAMPLE_LIMIT) {
  return `SELECT candidate.*, COUNT(*) OVER()::integer AS "__total"
    FROM (${sql}) candidate
    LIMIT ${limit}`;
}

function describeError(error) {
  const code = error?.code ? `${error.code}: ` : '';
  return `${code}${String(error?.message ?? error ?? 'unknown error').slice(0, 300)}`;
}

// Explicitly records which schema object is absent, so a skip is always
// attributable. The previous implementation dropped a missing table with a bare
// `continue`, making a run that verified nothing indistinguishable from a clean
// one.
function missingSchemaObjects({ child, column, parent }, tables, columns) {
  const missing = [];
  if (!tables.has(child)) missing.push(`table:${child}`);
  if (!tables.has(parent)) missing.push(`table:${parent}`);
  if (!columns.has(`${child}.${column}`)) missing.push(`column:${child}.${column}`);
  return missing;
}

function missingForReview(check, tables, columns) {
  return [
    ...(check.tables ?? []).filter((table) => !tables.has(table)).map((table) => `table:${table}`),
    ...(check.columns ?? [])
      .filter((column) => !columns.has(column))
      .map((column) => `column:${column}`),
  ];
}

export async function runOrphanChecks({
  relationships = FOREIGN_KEY_RELATIONSHIPS,
  reviews = LEGACY_REVIEWS,
  tables,
  columns,
  runQuery,
  limit = SAMPLE_LIMIT,
}) {
  const bootstrap = isBootstrapDatabase(tables);
  const results = [];

  for (const relationship of relationships) {
    const base = {
      name: relationship.name,
      relation: relationship.name,
      severity: relationship.severity,
    };
    const missing = missingSchemaObjects(relationship, tables, columns);

    if (missing.length) {
      results.push({
        ...base,
        status: CHECK_STATUS.SKIPPED,
        missing,
        reason: bootstrap
          ? 'Database has no tables yet; nothing to verify.'
          : 'Referenced table or column is absent from the current schema, so referential integrity could not be verified.',
      });
      continue;
    }

    try {
      const rows = await runQuery(buildOrphanQuery(relationship, limit));
      const totalCount = rows.length ? Number(rows[0].__total) : 0;
      results.push({
        ...base,
        status: rows.length ? CHECK_STATUS.FOUND : CHECK_STATUS.CLEAR,
        // totalCount is the true number of orphan rows. The previous
        // implementation reported sample.length, which saturated at the sample
        // limit and could not distinguish 100 orphans from 125,000.
        totalCount,
        sample: rows.map(({ id, danglingValue }) => ({ id, danglingValue })),
        sampleLimit: limit,
        truncated: totalCount > rows.length,
      });
    } catch (error) {
      results.push({ ...base, status: CHECK_STATUS.ERROR, error: describeError(error) });
    }
  }

  for (const check of reviews) {
    const base = { name: check.name, issue: check.issue, severity: check.severity };
    const missing = missingForReview(check, tables, columns);

    if (missing.length) {
      results.push({ ...base, status: CHECK_STATUS.SKIPPED, missing });
      continue;
    }

    try {
      const rows = await runQuery(buildReviewQuery(check.sql, limit));
      const totalCount = rows.length ? Number(rows[0].__total) : 0;
      results.push({
        ...base,
        status: rows.length ? CHECK_STATUS.FOUND : CHECK_STATUS.CLEAR,
        totalCount,
        sample: rows.map(({ __total, ...row }) => row),
        sampleLimit: limit,
        truncated: totalCount > rows.length,
      });
    } catch (error) {
      results.push({ ...base, status: CHECK_STATUS.ERROR, error: describeError(error) });
    }
  }

  const summary = summarize(results, { bootstrap });

  return {
    bootstrap,
    results,
    ...summary,
    // Backwards-compatible views over the same results. `findings` and
    // `warnings` being empty is no longer evidence of a clean database --
    // statusCounts and blockingCount are.
    findings: results.filter(
      (result) => result.status === CHECK_STATUS.FOUND && result.severity === SEVERITY.BLOCKER,
    ),
    warnings: results.filter(
      (result) => result.status === CHECK_STATUS.FOUND && result.severity === SEVERITY.REVIEW,
    ),
    skippedChecks: results.filter((result) => result.status === CHECK_STATUS.SKIPPED),
    erroredChecks: results.filter((result) => result.status === CHECK_STATUS.ERROR),
  };
}
