import bcrypt from 'bcrypt';
import prisma from '../../db/prisma.js';
import { assertPlaintextPassword } from '../auth/passwords.js';

/**
 * AUTHORIZATION AUTHORITY for coordinator scope.
 *
 * Every scope decision in the system resolves through this map: the request
 * middleware (`nstp.authorization.js` → `getCurrentCoordinator`) derives a
 * coordinator's `allowedComponentIds` from it, each write is re-checked against
 * it (`requireAllowedComponent`), and the websocket fan-out filters on it. It is
 * imported, never re-declared, so no caller can hold a divergent copy, and it is
 * frozen so a later import cannot widen a coordinator's scope at runtime.
 *
 * A scope that is missing from this map is refused (400/403) — it is never
 * defaulted to CWTS or to any other component, because a guessed scope would
 * hand one program's records to another program's coordinator.
 *
 * `frontend/src/services/staff.ts` keeps a deliberate DISPLAY-ONLY copy
 * (`SCOPE_COMPONENT_TYPES`) so forms can offer the right options offline; it
 * grants nothing and is re-validated here on every request. The two are not
 * merged into a shared module because that would either ship server
 * authorization code to the browser or make the server read from the frontend
 * workspace. `backend/test/scope-mapping-drift.test.js` compares them as text
 * and fails if they drift.
 */
export const COORDINATOR_SCOPE_TYPES = Object.freeze({
  CWTS: ['CWTS', 'CWTS_COAST_GUARD'],
  MTS: ['MTS_ARMY', 'MTS_NAVY'],
  LTS: ['LTS'],
});

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function handleUniqueError(error) {
  if (error?.code === 'P2002') throw httpError('The email or employee number is already in use.', 409);
  throw error;
}

const coordinatorInclude = {
  user: { select: { id: true, name: true, email: true, status: true, data: true, createdAt: true, updatedAt: true } },
  _count: { select: { facilitators: true } },
};

const facilitatorInclude = {
  user: { select: { id: true, name: true, email: true, status: true, data: true, createdAt: true, updatedAt: true } },
  component: { select: { id: true, type: true, name: true } },
};

function coordinatorDto(profile) {
  return {
    id: profile.user.id,
    profileId: profile.id,
    name: profile.user.name,
    email: profile.user.email,
    status: profile.user.status,
    employeeNumber: profile.employeeNumber,
    scope: profile.scope,
    title: profile.user.data?.title || '',
    contactNumber: profile.user.data?.contactNumber || '',
    facilitatorCount: profile._count?.facilitators || 0,
    createdAt: profile.user.createdAt,
    updatedAt: profile.user.updatedAt,
  };
}

function facilitatorDto(profile) {
  return {
    id: profile.user.id,
    profileId: profile.id,
    name: profile.user.name,
    email: profile.user.email,
    status: profile.user.status,
    employeeNumber: profile.employeeNumber,
    title: profile.title || '',
    contactNumber: profile.user.data?.contactNumber || '',
    componentId: profile.componentId,
    component: profile.component?.type || null,
    componentName: profile.component?.name || null,
    municipalities: profile.municipalities,
    createdAt: profile.user.createdAt,
    updatedAt: profile.user.updatedAt,
  };
}

async function audit(tx, actorId, action, detail) {
  await tx.auditLogEntry.create({
    data: { id: crypto.randomUUID(), actor: actorId, action, detail: JSON.stringify(detail) },
  });
}

export async function componentIdsForScope(client, scope) {
  const types = COORDINATOR_SCOPE_TYPES[scope];
  if (!types) throw httpError('Coordinator scope is invalid.', 400);
  const components = await client.nSTPComponent.findMany({ where: { type: { in: types } }, select: { id: true, type: true } });
  if (components.length !== types.length) throw httpError('One or more NSTP components for this coordinator scope are not configured.', 409);
  return components;
}

async function requireAllowedComponent(client, scope, type) {
  if (!COORDINATOR_SCOPE_TYPES[scope]?.includes(type)) throw httpError('The selected facilitator component is outside your coordinator scope.', 403);
  const component = await client.nSTPComponent.findUnique({ where: { type }, select: { id: true, type: true, name: true } });
  if (!component) throw httpError('The selected NSTP component is not configured.', 409);
  return component;
}

export async function listCoordinators({ search, scope, status, page, pageSize }) {
  const where = {
    ...(scope ? { scope } : {}),
    ...(status ? { user: { is: { status } } } : {}),
    ...(search ? { OR: [
      { employeeNumber: { contains: search, mode: 'insensitive' } },
      { user: { is: { name: { contains: search, mode: 'insensitive' } } } },
      { user: { is: { email: { contains: search, mode: 'insensitive' } } } },
    ] } : {}),
  };
  const [records, total] = await prisma.$transaction([
    prisma.coordinatorProfile.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' }, include: coordinatorInclude }),
    prisma.coordinatorProfile.count({ where }),
  ]);
  return { items: records.map(coordinatorDto), pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) } };
}

export async function createCoordinator(actorId, payload) {
  assertPlaintextPassword(payload.password);
  const passwordHash = await bcrypt.hash(payload.password, 10);
  try {
    return await prisma.$transaction(async (tx) => {
      const duplicate = await tx.user.findUnique({ where: { email: payload.email }, select: { id: true } });
      if (duplicate) throw httpError('An account with this email already exists.', 409);
      const employee = await tx.coordinatorProfile.findUnique({ where: { employeeNumber: payload.employeeNumber }, select: { id: true } });
      if (employee) throw httpError('This employee number is already assigned.', 409);
      const user = await tx.user.create({ data: {
        name: payload.name, email: payload.email, passwordHash, role: 'COORDINATOR', status: 'ACTIVE',
        data: { title: payload.title || '', contactNumber: payload.contactNumber || '', coordinatorScope: payload.scope },
      }, select: { id: true } });
      const profile = await tx.coordinatorProfile.create({
        data: { userId: user.id, employeeNumber: payload.employeeNumber, scope: payload.scope },
        include: coordinatorInclude,
      });
      await audit(tx, actorId, 'COORDINATOR_CREATED', { coordinatorId: user.id, scope: payload.scope });
      return coordinatorDto(profile);
    });
  } catch (error) { return handleUniqueError(error); }
}

export async function updateCoordinator(actorId, id, payload) {
  const passwordHash = payload.password ? (assertPlaintextPassword(payload.password), await bcrypt.hash(payload.password, 10)) : undefined;
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.coordinatorProfile.findUnique({ where: { userId: id }, include: coordinatorInclude });
      if (!existing) throw httpError('Coordinator not found.', 404);
      if (payload.scope && payload.scope !== existing.scope) {
        const assignments = await tx.instructorProfile.findMany({
          where: { coordinatorId: existing.id },
          select: { component: { select: { type: true } } },
        });
        const allowedTypes = COORDINATOR_SCOPE_TYPES[payload.scope];
        if (assignments.some((assignment) => !assignment.component?.type || !allowedTypes.includes(assignment.component.type))) {
          throw httpError('Reassign or remove facilitators outside the new coordinator program before changing its scope.', 409);
        }
      }
      const profile = await tx.coordinatorProfile.update({
        where: { userId: id },
        data: { ...(payload.employeeNumber !== undefined ? { employeeNumber: payload.employeeNumber } : {}), ...(payload.scope ? { scope: payload.scope } : {}) },
        include: coordinatorInclude,
      });
      if (payload.name !== undefined || payload.email !== undefined || passwordHash || payload.title !== undefined || payload.contactNumber !== undefined || payload.scope) {
        const previousData = existing.user.data || {};
        await tx.user.update({ where: { id }, data: {
          ...(payload.name !== undefined ? { name: payload.name } : {}),
          ...(payload.email !== undefined ? { email: payload.email } : {}),
          ...(passwordHash ? { passwordHash } : {}),
          data: { ...previousData, ...(payload.title !== undefined ? { title: payload.title } : {}), ...(payload.contactNumber !== undefined ? { contactNumber: payload.contactNumber } : {}), ...(payload.scope ? { coordinatorScope: payload.scope } : {}) },
        } });
      }
      await audit(tx, actorId, 'COORDINATOR_UPDATED', { coordinatorId: id, scope: payload.scope || existing.scope });
      return coordinatorDto(await tx.coordinatorProfile.findUnique({ where: { userId: id }, include: coordinatorInclude }));
    });
  } catch (error) { return handleUniqueError(error); }
}

export async function setCoordinatorStatus(actorId, id, status) {
  return prisma.$transaction(async (tx) => {
    const profile = await tx.coordinatorProfile.findUnique({ where: { userId: id }, select: { id: true, scope: true } });
    if (!profile) throw httpError('Coordinator not found.', 404);
    await tx.user.update({ where: { id }, data: { status } });
    await audit(tx, actorId, `COORDINATOR_${status}`, { coordinatorId: id, scope: profile.scope });
    return { id, status };
  });
}

export async function listOwnedFacilitators(coordinatorId) {
  const records = await prisma.instructorProfile.findMany({ where: { coordinatorId }, orderBy: { createdAt: 'desc' }, include: facilitatorInclude });
  return records.map(facilitatorDto);
}

export async function createOwnedFacilitator(actorId, coordinator, payload) {
  assertPlaintextPassword(payload.password);
  const passwordHash = await bcrypt.hash(payload.password, 10);
  try {
    return await prisma.$transaction(async (tx) => {
      const component = await requireAllowedComponent(tx, coordinator.scope, payload.component);
      if (await tx.user.findUnique({ where: { email: payload.email }, select: { id: true } })) throw httpError('An account with this email already exists.', 409);
      const user = await tx.user.create({ data: {
        name: payload.name, email: payload.email, passwordHash, role: 'INSTRUCTOR', status: 'ACTIVE',
        data: { title: payload.title || '', contactNumber: payload.contactNumber || '', component: component.name, municipalities: payload.municipalities },
      }, select: { id: true } });
      const profile = await tx.instructorProfile.create({ data: {
        userId: user.id, employeeNumber: payload.employeeNumber, title: payload.title || null,
        coordinatorId: coordinator.id, componentId: component.id, municipalities: payload.municipalities,
      }, include: facilitatorInclude });
      await audit(tx, actorId, 'FACILITATOR_CREATED', { facilitatorId: user.id, coordinatorId: coordinator.id, component: component.type });
      return facilitatorDto(profile);
    });
  } catch (error) { return handleUniqueError(error); }
}

export async function updateOwnedFacilitator(actorId, coordinator, id, payload) {
  const passwordHash = payload.password ? (assertPlaintextPassword(payload.password), await bcrypt.hash(payload.password, 10)) : undefined;
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.instructorProfile.findFirst({ where: { userId: id, coordinatorId: coordinator.id }, include: facilitatorInclude });
      if (!existing) throw httpError('Facilitator not found or is not assigned to you.', 404);
      const component = payload.component ? await requireAllowedComponent(tx, coordinator.scope, payload.component) : existing.component;
      const municipalities = payload.municipalities || existing.municipalities;
      await tx.instructorProfile.update({ where: { userId: id }, data: {
        ...(payload.employeeNumber !== undefined ? { employeeNumber: payload.employeeNumber } : {}),
        ...(payload.title !== undefined ? { title: payload.title || null } : {}),
        ...(component ? { componentId: component.id } : {}), municipalities,
      } });
      const previousData = existing.user.data || {};
      await tx.user.update({ where: { id }, data: {
        ...(payload.name !== undefined ? { name: payload.name } : {}), ...(payload.email !== undefined ? { email: payload.email } : {}),
        ...(passwordHash ? { passwordHash } : {}),
        data: { ...previousData, ...(payload.title !== undefined ? { title: payload.title } : {}), ...(payload.contactNumber !== undefined ? { contactNumber: payload.contactNumber } : {}), ...(component ? { component: component.name } : {}), municipalities },
      } });
      await audit(tx, actorId, 'FACILITATOR_UPDATED', { facilitatorId: id, coordinatorId: coordinator.id, component: component?.type });
      return facilitatorDto(await tx.instructorProfile.findUnique({ where: { userId: id }, include: facilitatorInclude }));
    });
  } catch (error) { return handleUniqueError(error); }
}

export async function setOwnedFacilitatorStatus(actorId, coordinatorId, id, status) {
  return prisma.$transaction(async (tx) => {
    const profile = await tx.instructorProfile.findFirst({ where: { userId: id, coordinatorId }, select: { id: true, componentId: true } });
    if (!profile) throw httpError('Facilitator not found or is not assigned to you.', 404);
    await tx.user.update({ where: { id }, data: { status } });
    await audit(tx, actorId, `FACILITATOR_${status}`, { facilitatorId: id, coordinatorId, componentId: profile.componentId });
    return { id, status };
  });
}
