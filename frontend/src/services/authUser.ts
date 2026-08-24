// Single canonical shape for the authenticated user.
//
// The backend exposes the signed-in identity through two different envelopes:
//
//   POST /auth/login  -> { id, name, email, role, ...User.data, studentId,
//                          coordinatorScope, component, municipalities }
//   GET  /auth/me     -> { id, name, email, role, data: {...}, studentProfile,
//                          coordinatorProfile: { scope }, instructorProfile }
//
// Coordinator scope therefore arrives as `coordinatorScope` on login and as
// `coordinatorProfile.scope` (or `data.coordinatorScope`) on session restore.
// Every screen must read the same field, so the flattening happens here once
// instead of being re-guessed by each component.
//
// The result is a discriminated union on `role`, not one permissive shape with an
// index signature. Each workspace declares the fields it actually has, so an
// invalid assumption about the current session — reading enrolment flags off a
// coordinator, or a scope off a student — is a compile error rather than a
// runtime `undefined`. `normalizeAuthenticatedUser` fails closed: a payload whose
// role it cannot classify produces `null`, never a default workspace.
//
// Authorisation is NOT derived from this object. The API re-derives coordinator
// scope from the database on every request (see
// backend/src/modules/nstp/nstp.authorization.js). This normalisation only
// decides what the UI is allowed to *offer*; the server remains the authority.

// Both value imports come from the dependency-free `data/nstpComponents` leaf,
// and the type-only import from `data/nstpData` is erased at compile time. That
// is deliberate: this module has no runtime dependency on the API client or the
// browser, so the normaliser below can be executed by a plain Node test runner
// instead of only being inspected as source.
import { COORDINATOR_SCOPES, toCoordinatorScope, toNstpComponent } from '../data/nstpComponents';
import type { CoordinatorScope, NstpComponent, NstpRole } from '../data/nstpData';

// The scope vocabulary and its validator live in that same leaf so the snapshot
// layer can validate a cached scope without importing this service (which
// imports it). Re-exported unchanged: this module is where the rest of the
// client expects to find them.
export { COORDINATOR_SCOPES, toCoordinatorScope };

/**
 * The role vocabulary the API speaks, mapped onto the four workspaces this
 * client implements.
 *
 * `UserRole` in prisma/schema.prisma is ADMIN | COORDINATOR | INSTRUCTOR |
 * STUDENT and /auth/login lower-cases it, so a facilitator account arrives as
 * `'instructor'` while every screen here switches on `'facilitator'`. Without
 * the alias those accounts matched no branch in App.tsx and fell through to the
 * student workspace — including the facilitators a coordinator creates, which
 * are written as INSTRUCTOR rows by
 * backend/src/modules/staff/staff.service.js#createOwnedFacilitator. The map is
 * the mirror image of the backend's own `toUserRole`
 * (backend/src/modules/nstp/nstp.service.js), which accepts
 * instructor/facilitator/speaker for that same enum member.
 */
const ROLE_ALIASES: Readonly<Record<string, NstpRole>> = Object.freeze({
  admin: 'admin',
  coordinator: 'coordinator',
  student: 'student',
  facilitator: 'facilitator',
  instructor: 'facilitator',
  speaker: 'facilitator',
});

/**
 * Resolves the workspace role, or `null` when the value is not one this client
 * knows how to serve.
 *
 * `null` is deliberate and must stay fail-closed: an unmapped role used to be
 * carried around as a plain lowercase string, match none of the `role === ...`
 * checks, and land on the *student* workspace. Refusing to build a session at
 * all is the only safe answer, because there is no workspace whose data such an
 * account is known to be entitled to.
 */
export function toAuthenticatedRole(value: unknown): NstpRole | null {
  if (typeof value !== 'string') return null;
  return ROLE_ALIASES[value.trim().toLowerCase()] ?? null;
}

/**
 * Fields every signed-in identity has, whatever its role.
 *
 * There is deliberately no `[key: string]: any` index signature. The object does
 * carry the rest of the `User.data` blob at runtime — that is what `data` is —
 * but an index signature made every undeclared read type as `any` and spread
 * that `any` onward, which is how ad-hoc fields ended up being consulted by
 * screens that have no business knowing about them. A field that a screen
 * genuinely needs belongs on the variant that genuinely has it.
 */
type SessionIdentity = {
  id: string;
  name: string;
  email: string;
  /** `AccountStatus` from the User row: 'ACTIVE' | 'SUSPENDED'. */
  status?: string;
  /** Staff title held in `User.data` (for example 'Program Head'). */
  title?: string;
  /**
   * The sanitised `User.data` blob, verbatim apart from the credential and raw
   * scope keys `withoutSensitiveKeys` removes. Typed `unknown` per key so a
   * caller has to narrow before using anything that is not declared above.
   */
  data?: Record<string, unknown>;
};

/**
 * The component a session is attached to, for display.
 *
 * Declared for every role because the shell renders it generically (an
 * administrator simply has none). It is never an authorization input: coordinator
 * scope comes from `CoordinatorUser.coordinatorScope`, and every endpoint
 * re-derives the allowed components server-side regardless.
 */
type ComponentMembership = {
  component?: NstpComponent;
  componentId?: string;
  municipality?: string;
  municipalities?: string[];
};

export type AdminUser = SessionIdentity & ComponentMembership & { role: 'admin' };

export type CoordinatorUser = SessionIdentity & ComponentMembership & {
  role: 'coordinator';
  /**
   * Present only for coordinators, and only when the API reported one of the
   * three programs. Declared on this variant alone so no other role's payload
   * can be mined for a scope — see `coordinatorScopeOf`.
   */
  coordinatorScope?: CoordinatorScope;
};

export type FacilitatorUser = SessionIdentity & ComponentMembership & { role: 'facilitator' };

export type StudentUser = SessionIdentity & ComponentMembership & {
  role: 'student';
  studentId?: string;
  /**
   * Enrolment state, declared on this variant alone. The shell gates the
   * General Education → component preference → qualifying exam → pending
   * assignment funnel on these flags, so reading them off a non-student session
   * (which is what an untyped session object allowed) routed staff accounts into
   * the student enrolment flow.
   */
  preferredComponent?: NstpComponent;
  generalEducationComplete?: boolean;
  examTaken?: boolean;
  examScore?: number;
  componentAccessStatus?: string;
};

/**
 * Discriminated on `role`, so the compiler — not a convention — decides which
 * fields a screen may read for the session it actually has.
 */
export type AuthenticatedUser = AdminUser | CoordinatorUser | FacilitatorUser | StudentUser;

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const CREDENTIAL_KEYS: readonly string[] = ['password', 'passwordHash', 'token'];

/**
 * Removes credential fields and the raw, unvalidated `coordinatorScope` key from
 * one object level.
 *
 * Both exclusions matter. Credentials must not survive into the object the UI
 * keeps in memory. And `coordinatorScope` must not survive *unvalidated*: the
 * canonical field is re-added by `normalizeAuthenticatedUser` only after it
 * passes `toCoordinatorScope`, so any copy that bypasses that check — including
 * one nested inside `User.data`, which is spread into the result — would make
 * the optional `CoordinatorScope` type a lie and let a screen act on a bogus
 * scope such as 'ROTC'.
 */
function withoutSensitiveKeys(record: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(record)) {
    if (CREDENTIAL_KEYS.includes(key) || key === 'coordinatorScope') continue;
    clean[key] = value;
  }
  return clean;
}

/**
 * `toCoordinatorScope` (re-exported above) accepts only the three scopes the
 * backend enum defines. Anything else — missing, null, misspelled, a stale value
 * from an older client — resolves to `undefined` so callers can render an
 * explicit "scope unknown" state. It deliberately never falls back to CWTS.
 */

/**
 * The only supported way to read a coordinator scope off a session.
 *
 * Going through the role discriminant first is the point: a non-coordinator
 * session has no `coordinatorScope` property at all under this type model, so
 * "scope" questions cannot accidentally be answered for a student or facilitator
 * payload that happens to carry a stray key.
 */
export function coordinatorScopeOf(
  user: AuthenticatedUser | null | undefined,
): CoordinatorScope | undefined {
  if (!user || user.role !== 'coordinator') return undefined;
  return toCoordinatorScope(user.coordinatorScope);
}

/** True when the user is a coordinator whose scope the API has confirmed. */
export function hasResolvedCoordinatorScope(user: AuthenticatedUser | null | undefined): boolean {
  return coordinatorScopeOf(user) !== undefined;
}

/** Trimmed string, or `undefined` for anything blank or non-string. */
function asText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Coerces a flag that may arrive as a real boolean or as a JSON-ish stand-in
 * from the `User.data` blob. Absent stays absent so callers can distinguish
 * "not recorded" from "recorded as false"; everything else keeps the truthiness
 * the previous pass-through spread gave it.
 */
function asFlag(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === '' || text === 'false' || text === '0') return false;
    return true;
  }
  return Boolean(value);
}

/** Finite number, or `undefined`. Numeric strings are accepted; junk is not. */
function asScore(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Flattens either login envelope into a role-tagged session object, or returns
 * `null` when the payload cannot be trusted to describe a workspace.
 *
 * Three rules make the returned type honest rather than merely convenient:
 *
 * 1. An unrecognised role yields `null`. There is no "generic user" workspace,
 *    and defaulting an unknown role to the student shell (the old behaviour, by
 *    omission) showed one account's screens to another kind of account.
 * 2. Component labels are validated with `toNstpComponent`, not cast. A bogus
 *    `User.data.component` used to become a typed `NstpComponent`.
 * 3. Only declared fields are copied out. The remaining profile keys stay inside
 *    `data`, so no screen can quietly grow a dependency on an ad-hoc field.
 */
export function normalizeAuthenticatedUser(raw: unknown): AuthenticatedUser | null {
  if (!isRecord(raw)) return null;

  // The raw scope is captured before sanitising so it can still be validated,
  // then every level that gets spread into the result is stripped of it. An
  // earlier version only removed the top-level key, which left
  // `{ data: { coordinatorScope: 'ROTC' } }` free to reach the canonical field
  // through the `...profileData` spread below.
  const rawCoordinatorScope = raw.coordinatorScope;
  const rest = withoutSensitiveKeys(raw);
  const profileData = withoutSensitiveKeys(isRecord(raw.data) ? raw.data : {});
  const coordinatorProfile = isRecord(rest.coordinatorProfile) ? rest.coordinatorProfile : {};
  const instructorProfile = isRecord(rest.instructorProfile) ? rest.instructorProfile : {};
  const studentProfile = isRecord(rest.studentProfile) ? rest.studentProfile : {};

  // Fail closed on the discriminant. Everything downstream keys off it, so a
  // payload we cannot classify is not a session at all.
  const role = toAuthenticatedRole(rest.role ?? profileData.role);
  const id = asText(rest.id);
  if (!role || !id) return null;

  const component = toNstpComponent(rest.component)
    ?? toNstpComponent(isRecord(instructorProfile.component) ? instructorProfile.component.name : undefined)
    ?? toNstpComponent(profileData.component);

  const componentId = asText(rest.componentId)
    ?? asText(studentProfile.componentId)
    ?? asText(instructorProfile.componentId)
    ?? asText(coordinatorProfile.componentId)
    ?? asText(profileData.componentId);

  const municipalities = [rest.municipalities, instructorProfile.municipalities, profileData.municipalities]
    .find((value): value is unknown[] => Array.isArray(value))
    ?.filter((entry): entry is string => typeof entry === 'string');

  const status = asText(rest.status) ?? asText(profileData.status);
  const title = asText(rest.title) ?? asText(profileData.title);
  const municipality = asText(rest.municipality) ?? asText(profileData.municipality);

  const identity = {
    id,
    name: asText(rest.name) ?? asText(profileData.name) ?? '',
    email: asText(rest.email) ?? asText(profileData.email) ?? '',
    ...(status ? { status } : {}),
    ...(title ? { title } : {}),
    // The sanitised blob is the documented home for every profile key this type
    // does not declare, and it replaces `rest.data` — which still points at the
    // original object and would re-expose the credential and raw-scope keys one
    // level down.
    ...(isRecord(raw.data) ? { data: profileData } : {}),
    ...(component ? { component } : {}),
    ...(componentId ? { componentId } : {}),
    ...(municipality ? { municipality } : {}),
    ...(municipalities ? { municipalities } : {}),
  };

  switch (role) {
    case 'admin':
      return { ...identity, role };

    case 'coordinator': {
      const coordinatorScope = toCoordinatorScope(rawCoordinatorScope)
        ?? toCoordinatorScope(coordinatorProfile.scope)
        ?? toCoordinatorScope(isRecord(raw.data) ? raw.data.coordinatorScope : undefined);
      return { ...identity, role, ...(coordinatorScope ? { coordinatorScope } : {}) };
    }

    case 'facilitator':
      return { ...identity, role };

    case 'student': {
      const studentId = asText(rest.studentId)
        ?? asText(studentProfile.studentNumber)
        ?? asText(profileData.studentId);
      const preferredComponent = toNstpComponent(rest.preferredComponent)
        ?? toNstpComponent(profileData.preferredComponent);
      const generalEducationComplete = asFlag(rest.generalEducationComplete ?? profileData.generalEducationComplete);
      const examTaken = asFlag(rest.examTaken ?? profileData.examTaken);
      const examScore = asScore(rest.examScore ?? profileData.examScore);
      const componentAccessStatus = asText(rest.componentAccessStatus)
        ?? asText(profileData.componentAccessStatus);
      return {
        ...identity,
        role,
        ...(studentId ? { studentId } : {}),
        ...(preferredComponent ? { preferredComponent } : {}),
        ...(generalEducationComplete === undefined ? {} : { generalEducationComplete }),
        ...(examTaken === undefined ? {} : { examTaken }),
        ...(examScore === undefined ? {} : { examScore }),
        ...(componentAccessStatus ? { componentAccessStatus } : {}),
      };
    }
  }
}
