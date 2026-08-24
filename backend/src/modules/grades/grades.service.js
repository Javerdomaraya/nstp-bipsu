import prisma from '../../db/prisma.js';
import { evaluateGrade, resolveGradeInput } from './grade.policy.js';

const gradeInclude = {
  student: { select: { id: true, studentNumber: true, user: { select: { name: true, email: true } } } },
  component: { select: { id: true, type: true, name: true } },
};

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function withGradeDatabase(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error?.statusCode) throw error;
    if (error?.code === 'P2002') throw httpError('A grade already exists for this semester.', 409);
    if (/database|connection|connect|timed out|timeout/i.test(error?.message || '') || /^P10\d\d$/.test(error?.code || '') || error?.code === 'P2024') {
      throw httpError('The grades data service is temporarily unavailable.', 503);
    }
    throw error;
  }
}

function dto(grade) {
  let conversion = null;
  if (grade.inputType && grade.inputValue !== null && grade.inputValue !== undefined) {
    conversion = resolveGradeInput(grade.inputType, Number(grade.inputValue));
  }
  return {
    ...grade,
    inputValue: grade.inputValue === null || grade.inputValue === undefined ? null : Number(grade.inputValue),
    percentGrade: grade.percentGrade === null || grade.percentGrade === undefined ? null : Number(grade.percentGrade),
    numericalGrade: grade.numericalGrade === null || grade.numericalGrade === undefined ? null : Number(grade.numericalGrade),
    percentEquivalent: conversion?.percentEquivalent || (grade.percentGrade === null || grade.percentGrade === undefined ? '—' : `${grade.percentGrade}%`),
    numericalEquivalent: conversion?.numericalEquivalent || (grade.numericalGrade === null || grade.numericalGrade === undefined ? '—' : Number(grade.numericalGrade).toFixed(1)),
  };
}

function convertedGradeData(gradeInput) {
  const conversion = resolveGradeInput(gradeInput.inputType, gradeInput.inputValue);
  return {
    inputType: conversion.inputType,
    inputValue: conversion.inputValue,
    gradeScaleVersion: conversion.gradeScaleVersion,
    percentGrade: conversion.percentGrade,
    numericalGrade: conversion.numericalGrade,
    classification: conversion.classification,
  };
}

async function audit(tx, actorId, action, detail) {
  await tx.auditLogEntry.create({
    data: { id: crypto.randomUUID(), actor: actorId, action, detail: JSON.stringify(detail) },
  });
}

function gradeIdentity(data) {
  return {
    studentId_componentId_schoolYear_semester: {
      studentId: data.studentId,
      componentId: data.componentId,
      schoolYear: data.schoolYear,
      semester: data.semester,
    },
  };
}

export async function listAdminSemesterGrades(filters) {
  const { page, pageSize, search, status, componentIds, ...direct } = filters;
  const where = {
    schoolYear: { not: null }, semester: { not: null },
    ...(direct.schoolYear ? { schoolYear: direct.schoolYear } : {}),
    ...(direct.semester ? { semester: direct.semester } : {}),
    ...(Array.isArray(componentIds) ? { componentId: { in: componentIds } } : direct.componentId ? { componentId: direct.componentId } : {}),
    ...(status ? { isReleased: status === 'RELEASED' } : {}),
    ...(search ? { student: { OR: [
      { studentNumber: { contains: search, mode: 'insensitive' } },
      { user: { name: { contains: search, mode: 'insensitive' } } },
    ] } } : {}),
  };
  return withGradeDatabase(async () => {
    const rows = await prisma.grade.findMany({ where, include: gradeInclude, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize });
    const total = await prisma.grade.count({ where });
    return { records: rows.map(dto), pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  });
}

export async function listAdminGradeRoster(filters) {
  const { page, pageSize, search, schoolYear, semester, componentId, status } = filters;
  const where = {
    ...(componentId ? { componentId } : {}),
    ...(search ? { OR: [
      { studentNumber: { contains: search, mode: 'insensitive' } },
      { user: { name: { contains: search, mode: 'insensitive' } } },
    ] } : {}),
  };
  return withGradeDatabase(async () => {
    const students = await prisma.studentProfile.findMany({
      where,
      select: {
        id: true, studentNumber: true, componentId: true,
        user: { select: { name: true, email: true } },
        component: { select: { id: true, type: true, name: true } },
        grades: {
          where: { schoolYear, semester, ...(status ? { isReleased: status === 'RELEASED' } : {}) },
          orderBy: { updatedAt: 'desc' }, take: 1,
        },
      },
      orderBy: [{ user: { name: 'asc' } }, { studentNumber: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const total = await prisma.studentProfile.count({ where });
    return {
      records: students.map(({ grades, ...student }) => ({ student, grade: grades[0] ? dto(grades[0]) : null })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  });
}

export async function listInstructorGradeRoster(section, filters) {
  const { page, pageSize, search, schoolYear, semester } = filters;
  const where = {
    sectionId: section.id,
    ...(search ? { OR: [
      { studentNumber: { contains: search, mode: 'insensitive' } },
      { user: { name: { contains: search, mode: 'insensitive' } } },
    ] } : {}),
  };
  return withGradeDatabase(async () => {
    const students = await prisma.studentProfile.findMany({
      where,
      select: {
        id: true, studentNumber: true, componentId: true,
        user: { select: { name: true, email: true } },
        component: { select: { id: true, type: true, name: true } },
        grades: { where: { schoolYear, semester }, orderBy: { updatedAt: 'desc' }, take: 1 },
      },
      orderBy: [{ user: { name: 'asc' } }, { studentNumber: 'asc' }],
      skip: (page - 1) * pageSize, take: pageSize,
    });
    const total = await prisma.studentProfile.count({ where });
    return {
      records: students.map(({ grades, ...student }) => ({ student, grade: grades[0] ? dto(grades[0]) : null })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  });
}

async function requireStudentComponent(client, studentId, componentId) {
  const [student, component] = await Promise.all([
    client.studentProfile.findUnique({ where: { id: studentId }, select: { id: true, componentId: true } }),
    client.nSTPComponent.findUnique({ where: { id: componentId }, select: { id: true } }),
  ]);
  if (!student) throw httpError('Student profile not found.', 404);
  if (!component) throw httpError('NSTP component not found.', 404);
  if (student.componentId && student.componentId !== componentId) throw httpError('Student is not assigned to the selected component.', 409);
  return student;
}

export async function createSemesterGrade(actorId, payload) {
  const { gradeInput, ...identityAndRemarks } = payload;
  const converted = convertedGradeData(gradeInput);
  return withGradeDatabase(() => prisma.$transaction(async (tx) => {
    await requireStudentComponent(tx, payload.studentId, payload.componentId);
    const existing = await tx.grade.findUnique({ where: gradeIdentity(payload), select: { id: true } });
    if (existing) throw httpError('A grade already exists for this student, component, school year, and semester.', 409);
    const grade = await tx.grade.create({ data: { ...identityAndRemarks, ...converted, createdById: actorId, updatedById: actorId }, include: gradeInclude });
    await audit(tx, actorId, 'SEMESTER_GRADE_CREATED', { gradeId: grade.id, studentId: grade.studentId, schoolYear: grade.schoolYear, semester: grade.semester });
    return dto(grade);
  }));
}

/**
 * `scope` is an administrator-only widening point: the only route that reaches
 * this function is `PATCH /admin/grades/:id` (ADMIN role), so the default `{}`
 * means "no component restriction" by design. If a coordinator write path is
 * ever added it must pass `{ componentIds: [...] }` explicitly — an omitted list
 * must never be read as unrestricted for a scoped role.
 */
export async function updateSemesterGrade(actorId, id, patch, scope = {}) {
  return withGradeDatabase(() => prisma.$transaction(async (tx) => {
    const existing = await tx.grade.findFirst({ where: { id, ...(Array.isArray(scope.componentIds) ? { componentId: { in: scope.componentIds } } : {}) } });
    if (!existing || !existing.semester || !existing.schoolYear) throw httpError('Semester grade not found.', 404);
    if (existing.isReleased) throw httpError('Return the grade to hold before editing it.', 409);
    const { gradeInput, ...otherPatch } = patch;
    const converted = gradeInput ? convertedGradeData(gradeInput) : {};
    const grade = await tx.grade.update({ where: { id }, data: { ...otherPatch, ...converted, updatedById: actorId }, include: gradeInclude });
    await audit(tx, actorId, 'SEMESTER_GRADE_UPDATED', {
      gradeId: id, gradeScaleVersion: grade.gradeScaleVersion,
      previous: { inputType: existing.inputType, inputValue: existing.inputValue === null ? null : Number(existing.inputValue), percentGrade: existing.percentGrade, numericalGrade: existing.numericalGrade === null ? null : Number(existing.numericalGrade), classification: existing.classification, remarks: existing.remarks },
      next: { inputType: grade.inputType, inputValue: grade.inputValue === null ? null : Number(grade.inputValue), percentGrade: grade.percentGrade, numericalGrade: grade.numericalGrade === null ? null : Number(grade.numericalGrade), classification: grade.classification, remarks: grade.remarks },
    });
    return dto(grade);
  }));
}

export async function releaseSemesterGrade(actorId, id) {
  return withGradeDatabase(() => prisma.$transaction(async (tx) => {
    const existing = await tx.grade.findUnique({ where: { id } });
    if (!existing || !existing.semester || !existing.schoolYear) throw httpError('Semester grade not found.', 404);
    if (existing.isReleased) throw httpError('Grade is already released.', 409);
    if (existing.inputType && existing.inputValue !== null) resolveGradeInput(existing.inputType, Number(existing.inputValue));
    else evaluateGrade(existing.percentGrade, Number(existing.numericalGrade));
    const enrollment = await tx.enrollment.findFirst({ where: { studentId: existing.studentId, componentId: existing.componentId, status: 'ACTIVE' }, select: { id: true } });
    if (!enrollment) throw httpError('An active enrollment is required before releasing this grade.', 409);
    const grade = await tx.grade.update({ where: { id }, data: { isReleased: true, releasedAt: new Date(), releasedById: actorId, updatedById: actorId }, include: gradeInclude });
    await audit(tx, actorId, 'SEMESTER_GRADE_RELEASED', { gradeId: id, studentId: grade.studentId, schoolYear: grade.schoolYear, semester: grade.semester });
    return dto(grade);
  }));
}

export async function holdSemesterGrade(actorId, id) {
  return withGradeDatabase(() => prisma.$transaction(async (tx) => {
    const existing = await tx.grade.findUnique({ where: { id } });
    if (!existing || !existing.semester || !existing.schoolYear) throw httpError('Semester grade not found.', 404);
    if (!existing.isReleased) throw httpError('Grade is already on hold.', 409);
    const grade = await tx.grade.update({ where: { id }, data: { isReleased: false, releasedAt: null, releasedById: null, updatedById: actorId }, include: gradeInclude });
    await audit(tx, actorId, 'SEMESTER_GRADE_HELD', { gradeId: id, studentId: grade.studentId, schoolYear: grade.schoolYear, semester: grade.semester });
    return dto(grade);
  }));
}

export async function saveInstructorSemesterGrade(actorId, instructor, section, payload) {
  if (!instructor.componentId || instructor.componentId !== section.componentId) throw httpError('Your facilitator component does not match this class.', 403);
  const { gradeInput, ...identityAndRemarks } = payload;
  const values = { ...identityAndRemarks, componentId: section.componentId };
  const converted = convertedGradeData(gradeInput);
  return withGradeDatabase(() => prisma.$transaction(async (tx) => {
    const existing = await tx.grade.findUnique({ where: gradeIdentity(values) });
    if (existing?.isReleased) throw httpError('Released grades cannot be changed by a facilitator.', 403);
    const grade = existing
      ? await tx.grade.update({ where: { id: existing.id }, data: { ...converted, remarks: values.remarks, updatedById: actorId }, include: gradeInclude })
      : await tx.grade.create({ data: { ...values, ...converted, createdById: actorId, updatedById: actorId }, include: gradeInclude });
    await audit(tx, actorId, existing ? 'FACILITATOR_SEMESTER_GRADE_UPDATED' : 'FACILITATOR_SEMESTER_GRADE_CREATED', { gradeId: grade.id, studentId: grade.studentId, classId: section.id });
    return dto(grade);
  }));
}

/**
 * Coordinator view of semester grades, restricted in the query to the component
 * ids the server derived for this coordinator.
 *
 * The array is required. `listAdminSemesterGrades` reads "no componentIds" as an
 * administrator's unrestricted request, so passing `undefined`/`null` here would
 * turn a coordinator with an unresolved scope into an unrestricted reader. An
 * empty array stays empty: `in: []` matches no rows, which is the correct
 * reading of "no components authorised".
 */
export async function listCoordinatorSemesterGrades(componentIds, filters) {
  if (!Array.isArray(componentIds)) {
    throw new Error('listCoordinatorSemesterGrades requires an array of authorised component ids.');
  }
  return listAdminSemesterGrades({ ...filters, componentId: undefined, componentIds: componentIds.filter(Boolean) });
}

export async function listReleasedStudentSemesterGrades(studentId) {
  return withGradeDatabase(async () => {
    const rows = await prisma.grade.findMany({
      where: { studentId, isReleased: true, schoolYear: { not: null }, semester: { not: null } },
      include: { component: { select: { id: true, type: true, name: true } } },
      orderBy: [{ schoolYear: 'desc' }, { semester: 'asc' }],
    });
    return rows.map(dto);
  });
}
