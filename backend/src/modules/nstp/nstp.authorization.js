import prisma from '../../db/prisma.js';
import { sendError } from '../../utils/apiResponse.js';
import { COORDINATOR_SCOPE_TYPES } from '../staff/staff.service.js';

export async function getCurrentStudent(req, res, next) {
  const student = await prisma.studentProfile.findUnique({
    where: { userId: req.user.id },
  });

  if (!student) return sendError(res, 'Student profile not found.', 404);
  req.student = student;
  return next();
}

export async function getCurrentInstructor(req, res, next) {
  const instructor = await prisma.instructorProfile.findUnique({
    where: { userId: req.user.id },
    include: { user: { select: { status: true } }, sections: { select: { componentId: true } } },
  });

  if (!instructor || (instructor.user?.status && instructor.user.status !== 'ACTIVE')) return sendError(res, 'Instructor account is not active.', 403);
  req.instructor = instructor;
  return next();
}

export async function getCurrentCoordinator(req, res, next) {
  const coordinator = await prisma.coordinatorProfile.findUnique({
    where: { userId: req.user.id },
    include: { user: { select: { status: true } } },
  });

  if (!coordinator || (coordinator.user?.status && coordinator.user.status !== 'ACTIVE')) return sendError(res, 'Coordinator account is not active.', 403);
  // Legacy single-component coordinators (rows predating the scope column) are
  // still honoured via their explicit componentId. `allowedComponentTypes` is
  // deliberately `null` and not `[]` on this branch: the component *type* is not
  // loaded here, and an empty array is indistinguishable from a real allow-list
  // that permits nothing — a consumer treating it as "no restriction" would be a
  // fail-open. `null` makes the absence explicit, and any caller that tried to
  // use it as an allow-list would throw rather than widen. Nothing in the
  // backend reads it today; `allowedComponentIds` is the scope authority and is
  // never empty (this branch is guarded on a truthy componentId).
  if (!coordinator.scope && coordinator.componentId) {
    req.coordinator = { ...coordinator, allowedComponentIds: [coordinator.componentId], allowedComponentTypes: null };
    return next();
  }
  // The scope map is imported rather than re-declared so this middleware and the
  // staff service can never disagree about which component types a program owns.
  // An unset or unrecognised scope is refused outright: falling through to CWTS
  // would silently grant a coordinator authority over a component they were
  // never assigned.
  const scopeTypes = COORDINATOR_SCOPE_TYPES[coordinator.scope];
  if (!scopeTypes) return sendError(res, 'Coordinator component scope is not assigned. Ask an administrator to set your NSTP component program.', 403);
  const components = await prisma.nSTPComponent.findMany({ where: { type: { in: scopeTypes } }, select: { id: true, type: true } });
  if (components.length !== scopeTypes.length) return sendError(res, 'Coordinator component scope is not fully configured.', 403);
  req.coordinator = { ...coordinator, allowedComponentIds: components.map((component) => component.id), allowedComponentTypes: scopeTypes };
  return next();
}

export async function getCurrentStaffContext(req, res, next) {
  const role = req.user?.role;
  if (role === 'ADMIN') {
    return next();
  }
  if (role === 'COORDINATOR') {
    return getCurrentCoordinator(req, res, next);
  }
  if (role === 'INSTRUCTOR') {
    return getCurrentInstructor(req, res, next);
  }
  return sendError(res, 'Access denied.', 403);
}

export async function requireAssignedSection(req, res, next) {
  const section = await prisma.section.findUnique({ where: { id: req.params.classId } });
  if (!section) return sendError(res, 'Class not found.', 404);
  if (section.instructorId !== req.instructor.id) {
    return sendError(res, 'You are not assigned to this class.', 403);
  }
  req.section = section;
  return next();
}

export async function requireStudentInAssignedSection(req, res, next) {
  const student = await prisma.studentProfile.findUnique({ where: { id: req.body.studentId } });
  if (!student) return sendError(res, 'Student not found.', 404);
  if (student.sectionId !== req.section.id) {
    return sendError(res, 'Student is not enrolled in this class.', 403);
  }
  req.targetStudent = student;
  return next();
}
