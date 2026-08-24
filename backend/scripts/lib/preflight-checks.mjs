// Read-only production preflight check definitions and runner.
//
// Every check is a SELECT that returns candidate row identifiers only. Names,
// email addresses, grades, and credentials are never projected -- the report is
// safe to paste into a deployment ticket.
//
// Each check's `sql` selects a single "id" column and carries no ORDER BY or
// LIMIT; the runner wraps it to produce an accurate total alongside a bounded
// sample. Keeping the limit out of the check definitions removes the fragile
// regex the previous implementation used to strip it back off.

import {
  CHECK_STATUS,
  SEVERITY,
  SAMPLE_LIMIT,
  isBootstrapDatabase,
  missingRequirements,
  summarize,
} from './release-gate.mjs';

// The scope mapping below is duplicated from the migration on purpose: preflight
// must catch every condition the migration would abort on, before the migration
// runs. Keep these two in sync -- see test/release-gate.test.js, which asserts
// the mapping matches COORDINATOR_SCOPE_TYPES.
const SCOPE_MAPPING_SQL = `CASE component."type"
          WHEN 'MTS_ARMY' THEN 'MTS'
          WHEN 'MTS_NAVY' THEN 'MTS'
          WHEN 'LTS' THEN 'LTS'
          WHEN 'CWTS' THEN 'CWTS'
          WHEN 'CWTS_COAST_GUARD' THEN 'CWTS'
        END`;

const MAPPED_COMPONENT_TYPES = "'CWTS', 'CWTS_COAST_GUARD', 'LTS', 'MTS_ARMY', 'MTS_NAVY'";

export const PRODUCTION_CHECKS = Object.freeze([
  {
    name: 'orphan_coordinator_profiles',
    severity: SEVERITY.BLOCKER,
    description: 'coordinator_profile.userId references a user row that does not exist.',
    tables: ['coordinator_profile', 'user'],
    columns: ['coordinator_profile.userId'],
    sql: `SELECT coordinator."id"
      FROM "coordinator_profile" coordinator
      LEFT JOIN "user" account ON account."id" = coordinator."userId"
      WHERE account."id" IS NULL`,
  },
  {
    name: 'dangling_coordinator_component_references',
    severity: SEVERITY.BLOCKER,
    description:
      'coordinator_profile.componentId is set but references an nstp_component row that does not exist. Such a row is invisible to both the component-derived and metadata-derived scope backfills and would retain the historical DEFAULT CWTS.',
    tables: ['coordinator_profile', 'nstp_component'],
    columns: ['coordinator_profile.componentId'],
    sql: `SELECT coordinator."id"
      FROM "coordinator_profile" coordinator
      LEFT JOIN "nstp_component" component ON component."id" = coordinator."componentId"
      WHERE coordinator."componentId" IS NOT NULL
        AND component."id" IS NULL`,
  },
  {
    name: 'coordinator_component_type_unmapped',
    severity: SEVERITY.BLOCKER,
    description:
      'A coordinator references an NSTP component type with no explicit CoordinatorScope mapping. Guards against a future sixth enum value silently mapping to CWTS.',
    tables: ['coordinator_profile', 'nstp_component'],
    columns: ['coordinator_profile.componentId', 'nstp_component.type'],
    sql: `SELECT coordinator."id"
      FROM "coordinator_profile" coordinator
      JOIN "nstp_component" component ON component."id" = coordinator."componentId"
      WHERE component."type"::text NOT IN (${MAPPED_COMPONENT_TYPES})`,
  },
  {
    name: 'coordinator_profiles_linked_to_non_coordinators',
    severity: SEVERITY.BLOCKER,
    description: 'A coordinator_profile is attached to a user whose role is not COORDINATOR.',
    tables: ['coordinator_profile', 'user'],
    columns: ['coordinator_profile.userId', 'user.role'],
    sql: `SELECT coordinator."id"
      FROM "coordinator_profile" coordinator
      JOIN "user" account ON account."id" = coordinator."userId"
      WHERE account."role"::text <> 'COORDINATOR'`,
  },
  {
    name: 'unmappable_coordinator_scopes',
    severity: SEVERITY.BLOCKER,
    description:
      'A coordinator has no component relation and no usable coordinatorScope metadata, so no program can be derived without guessing.',
    tables: ['coordinator_profile', 'user', 'nstp_component'],
    columns: [
      'coordinator_profile.userId',
      'coordinator_profile.componentId',
      'user.data',
      'nstp_component.type',
    ],
    sql: `SELECT coordinator."id"
      FROM "coordinator_profile" coordinator
      JOIN "user" account ON account."id" = coordinator."userId"
      LEFT JOIN "nstp_component" component ON component."id" = coordinator."componentId"
      WHERE component."type" IS NULL
        AND COALESCE(account."data"->>'coordinatorScope', '') NOT IN ('CWTS', 'LTS', 'MTS')`,
  },
  {
    name: 'conflicting_coordinator_scope_sources',
    severity: SEVERITY.BLOCKER,
    description:
      'A coordinator component relation and coordinatorScope metadata disagree about the program.',
    tables: ['coordinator_profile', 'user', 'nstp_component'],
    columns: [
      'coordinator_profile.userId',
      'coordinator_profile.componentId',
      'user.data',
      'nstp_component.type',
    ],
    sql: `SELECT coordinator."id"
      FROM "coordinator_profile" coordinator
      JOIN "user" account ON account."id" = coordinator."userId"
      JOIN "nstp_component" component ON component."id" = coordinator."componentId"
      WHERE account."data"->>'coordinatorScope' IN ('CWTS', 'LTS', 'MTS')
        AND account."data"->>'coordinatorScope' <> ${SCOPE_MAPPING_SQL}`,
  },
  {
    name: 'duplicate_facilitator_user_profiles',
    severity: SEVERITY.BLOCKER,
    description: 'More than one instructor_profile row shares a userId.',
    tables: ['instructor_profile'],
    columns: ['instructor_profile.userId'],
    sql: `SELECT MIN("id") AS "id" FROM "instructor_profile"
      GROUP BY "userId" HAVING COUNT(*) > 1`,
  },
  {
    name: 'duplicate_facilitator_employee_numbers',
    severity: SEVERITY.BLOCKER,
    description: 'More than one instructor_profile row shares an employeeNumber.',
    tables: ['instructor_profile'],
    columns: ['instructor_profile.employeeNumber'],
    sql: `SELECT MIN("id") AS "id" FROM "instructor_profile"
      WHERE "employeeNumber" IS NOT NULL
      GROUP BY "employeeNumber" HAVING COUNT(*) > 1`,
  },
  {
    name: 'legacy_facilitator_component_metadata_invalid',
    severity: SEVERITY.BLOCKER,
    description: 'A facilitator account carries a component name outside the known component set.',
    tables: ['instructor_profile', 'user'],
    columns: ['instructor_profile.userId', 'user.data'],
    sql: `SELECT instructor."id" FROM "instructor_profile" instructor
      JOIN "user" account ON account."id" = instructor."userId"
      WHERE COALESCE(account."data"->>'component', '') NOT IN
        ('CWTS', 'LTS', 'MTS (Army)', 'MTS (Navy)', 'CWTS (Coast Guard)')`,
  },
  {
    name: 'legacy_facilitator_ownership_not_unique',
    severity: SEVERITY.REVIEW,
    description:
      'A facilitator scope maps to zero or multiple coordinators, so ownership cannot be inferred unambiguously.',
    tables: ['instructor_profile', 'coordinator_profile', 'user', 'nstp_component'],
    columns: [
      'instructor_profile.userId',
      'coordinator_profile.userId',
      'coordinator_profile.componentId',
      'user.data',
      'nstp_component.type',
    ],
    sql: `WITH coordinator_scopes AS (
        SELECT coordinator."id", COALESCE(
          ${SCOPE_MAPPING_SQL},
          CASE WHEN account."data"->>'coordinatorScope' IN ('CWTS', 'LTS', 'MTS')
            THEN account."data"->>'coordinatorScope' END
        ) AS scope
        FROM "coordinator_profile" coordinator
        JOIN "user" account ON account."id" = coordinator."userId"
        LEFT JOIN "nstp_component" component ON component."id" = coordinator."componentId"
      ), facilitator_scopes AS (
        SELECT instructor."id", CASE account."data"->>'component'
          WHEN 'MTS (Army)' THEN 'MTS' WHEN 'MTS (Navy)' THEN 'MTS'
          WHEN 'LTS' THEN 'LTS' WHEN 'CWTS' THEN 'CWTS'
          WHEN 'CWTS (Coast Guard)' THEN 'CWTS' END AS scope
        FROM "instructor_profile" instructor
        JOIN "user" account ON account."id" = instructor."userId"
      )
      SELECT facilitator."id" FROM facilitator_scopes facilitator
      WHERE facilitator.scope IS NOT NULL
        AND (SELECT COUNT(*) FROM coordinator_scopes coordinator
             WHERE coordinator.scope = facilitator.scope) <> 1`,
  },
  {
    name: 'facilitators_without_coordinator',
    severity: SEVERITY.REVIEW,
    description: 'A facilitator has no owning coordinator.',
    tables: ['instructor_profile'],
    columns: ['instructor_profile.coordinatorId'],
    sql: `SELECT "id" FROM "instructor_profile" WHERE "coordinatorId" IS NULL`,
  },
  {
    name: 'facilitators_without_valid_component',
    severity: SEVERITY.BLOCKER,
    description: 'instructor_profile.componentId does not resolve to an nstp_component row.',
    tables: ['instructor_profile', 'nstp_component'],
    columns: ['instructor_profile.componentId'],
    sql: `SELECT instructor."id" FROM "instructor_profile" instructor
      LEFT JOIN "nstp_component" component ON component."id" = instructor."componentId"
      WHERE component."id" IS NULL`,
  },
  {
    name: 'students_without_valid_component',
    severity: SEVERITY.BLOCKER,
    description: 'student_profile.componentId does not resolve to an nstp_component row.',
    tables: ['student_profile', 'nstp_component'],
    columns: ['student_profile.componentId'],
    sql: `SELECT student."id" FROM "student_profile" student
      LEFT JOIN "nstp_component" component ON component."id" = student."componentId"
      WHERE component."id" IS NULL`,
  },
  {
    name: 'training_groups_with_invalid_component',
    severity: SEVERITY.BLOCKER,
    description: 'A training group names a component outside the known component set.',
    tables: ['training_group'],
    columns: ['training_group.component'],
    sql: `SELECT "id" FROM "training_group"
      WHERE "component" IS NULL
        OR BTRIM("component") NOT IN (
          'CWTS', 'LTS', 'MTS (Army)', 'MTS (Navy)', 'CWTS (Coast Guard)',
          'MTS_ARMY', 'MTS_NAVY', 'CWTS_COAST_GUARD'
        )`,
  },
  {
    name: 'legacy_grades_outside_percent_range',
    severity: SEVERITY.BLOCKER,
    description: 'A legacy grade value is outside 0-100 or is NaN.',
    tables: ['grade'],
    columns: ['grade.score', 'grade.prelim', 'grade.midterm', 'grade.final'],
    sql: `SELECT "id" FROM "grade" WHERE
      ("score" IS NOT NULL AND ("score" < 0 OR "score" > 100 OR "score"::text = 'NaN')) OR
      ("prelim" IS NOT NULL AND ("prelim" < 0 OR "prelim" > 100 OR "prelim"::text = 'NaN')) OR
      ("midterm" IS NOT NULL AND ("midterm" < 0 OR "midterm" > 100 OR "midterm"::text = 'NaN')) OR
      ("final" IS NOT NULL AND ("final" < 0 OR "final" > 100 OR "final"::text = 'NaN'))`,
  },
  {
    name: 'duplicate_semester_grade_keys',
    severity: SEVERITY.BLOCKER,
    description:
      'Duplicate (studentId, componentId, schoolYear, semester) grade rows would violate the unique index created by semester_grade_records.',
    tables: ['grade'],
    columns: [
      'grade.studentId',
      'grade.componentId',
      'grade.schoolYear',
      'grade.semester',
    ],
    sql: `SELECT MIN("id") AS "id" FROM "grade"
      WHERE "componentId" IS NOT NULL AND "schoolYear" IS NOT NULL AND "semester" IS NOT NULL
      GROUP BY "studentId", "componentId", "schoolYear", "semester"
      HAVING COUNT(*) > 1`,
  },
]);

// Wraps a check body so one round trip yields both an accurate total and a
// bounded sample. COUNT(*) OVER() is evaluated before LIMIT, so totalCount
// reflects every matching row, not just the sampled ones.
export function buildSampledQuery(sql, limit = SAMPLE_LIMIT) {
  return `SELECT candidate."id", COUNT(*) OVER()::integer AS "__total"
    FROM (${sql}) candidate
    ORDER BY candidate."id"
    LIMIT ${limit}`;
}

function describeError(error) {
  const code = error?.code ? `${error.code}: ` : '';
  const message = String(error?.message ?? error ?? 'unknown error');
  // Truncated so an unexpected driver error cannot dump row data into a report.
  return `${code}${message.slice(0, 300)}`;
}

export async function runPreflightChecks({
  checks = PRODUCTION_CHECKS,
  tables,
  columns,
  runQuery,
  limit = SAMPLE_LIMIT,
}) {
  const bootstrap = isBootstrapDatabase(tables);
  const results = [];

  for (const check of checks) {
    const base = {
      name: check.name,
      severity: check.severity,
      description: check.description,
    };

    const missing = missingRequirements(check, tables, columns);
    if (missing.length) {
      results.push({
        ...base,
        status: CHECK_STATUS.SKIPPED,
        missing,
        reason: bootstrap
          ? 'Database has no tables yet; nothing to verify.'
          : 'Required tables or columns are absent from the current schema.',
      });
      continue;
    }

    try {
      const rows = await runQuery(buildSampledQuery(check.sql, limit));
      const totalCount = rows.length ? Number(rows[0].__total) : 0;
      results.push({
        ...base,
        status: rows.length ? CHECK_STATUS.FOUND : CHECK_STATUS.CLEAR,
        totalCount,
        sampleIds: rows.map((row) => row.id),
        sampleLimit: limit,
        truncated: totalCount > rows.length,
      });
    } catch (error) {
      results.push({ ...base, status: CHECK_STATUS.ERROR, error: describeError(error) });
    }
  }

  return { bootstrap, results, ...summarize(results, { bootstrap }) };
}
