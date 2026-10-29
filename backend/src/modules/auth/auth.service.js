import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { studentSelfSelect, toStudentSelfProfileDto } from './user.dto.js';
import { assertPlaintextPassword } from './passwords.js';
import { getAutomaticTrackRouting } from '../../constants/bipsuPrograms.js';

const loginUserSelect = {
  id: true, name: true, email: true, role: true, status: true, passwordHash: true, data: true,
  studentProfile: { select: { studentNumber: true } },
  coordinatorProfile: { select: { scope: true } },
  instructorProfile: { select: { component: { select: { type: true, name: true } }, municipalities: true } },
};

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  );
}

export async function registerUser(payload) {
  return submitPendingRegistration(payload);
  /* Legacy activation logic is intentionally unreachable: registration must
     never create an active account before administrator approval. */
  /*
  const {
    surname, firstName, middleName,
    email, password,
    studentId, school, department, degreeProgram, yearLevel, major,
    gender, birthdate,
    houseStreetPurok, barangay, municipality, province, provincialAddress,
    contactNumber,
  } = payload;

  const name = [firstName, middleName, surname].filter(Boolean).join(' ').trim();
  if (!name || !email || !password || !studentId) {
    const err = new Error('Name, email, password, and student ID are required.');
    err.statusCode = 400;
    throw err;
  }
  assertPlaintextPassword(password);

  const existingEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingEmail) {
    const err = new Error('An account with this email already exists.');
    err.statusCode = 409;
    throw err;
  }

  const existingStudent = await prisma.studentProfile.findUnique({ where: { studentNumber: studentId } });
  if (existingStudent) {
    const err = new Error('This student ID is already registered.');
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: 'STUDENT',
      data: {
        surname,
        firstName,
        middleName,
        school,
        department,
        degreeProgram,
        yearLevel,
        major: major || null,
        gender,
        birthdate,
        houseStreetPurok,
        barangay,
        municipality,
        province,
        provincialAddress,
        contactNumber,
      },
      studentProfile: {
        create: {
          studentNumber: studentId,
          yearLevel,
          course: degreeProgram,
        },
      },
    },
    select: studentSelfSelect,
  });

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.toLowerCase(),
      studentId: user.studentProfile?.studentNumber,
      ...(user.data || {}),
    },
  };
  */
}

export async function submitPendingRegistration(payload) {
  const { email, password, studentId, firstName, middleName, surname, ...details } = payload;
  const name = [firstName, middleName, surname].filter(Boolean).join(' ').trim();
  if (!name || !email || !password || !studentId) {
    const err = new Error('Name, email, password, and student ID are required.');
    err.statusCode = 400;
    throw err;
  }
  assertPlaintextPassword(password);
  const [existingUser, existingStudent, pending] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.studentProfile.findUnique({ where: { studentNumber: studentId }, select: { id: true } }),
    prisma.pendingRegistration.findFirst({ where: { OR: [{ email }, { studentId }] }, select: { id: true } }),
  ]);
  if (existingUser || existingStudent || pending) {
    const err = new Error('An account or registration with this email or student ID already exists.');
    err.statusCode = 409;
    throw err;
  }

  // Enforce automatic track routing at registration stage
  const autoTrack = getAutomaticTrackRouting(details.degreeProgram, details.school || details.department);
  if (autoTrack === 'MTS') {
    const rawPref = String(details.preferredComponent || '').toLowerCase();
    details.preferredComponent = rawPref.includes('navy') ? 'MTS (Navy)' : 'MTS (Army)';
  } else if (autoTrack === 'LTS') {
    details.preferredComponent = 'LTS';
  }

  await prisma.pendingRegistration.create({
    data: {
      id: `pending-${crypto.randomUUID()}`,
      name, email, studentId, surname, firstName, middleName,
      password: await bcrypt.hash(password, 10),
      ...details,
    },
    select: { id: true, createdAt: true },
  });
  return { submitted: true };
}

export async function approvePendingRegistration(id, adminId) {
  return prisma.$transaction(async (tx) => {
    const registration = await tx.pendingRegistration.findUnique({ where: { id } });
    if (!registration || registration.status !== 'PENDING') {
      const err = new Error('Registration is not pending approval.'); err.statusCode = 409; throw err;
    }
    const duplicate = await tx.user.findUnique({ where: { email: registration.email }, select: { id: true } });
    const duplicateStudent = registration.studentId
      ? await tx.studentProfile.findUnique({ where: { studentNumber: registration.studentId }, select: { id: true } }) : null;
    if (duplicate || duplicateStudent) { const err = new Error('Registration conflicts with an existing account.'); err.statusCode = 409; throw err; }
    const user = await tx.user.create({ data: {
      name: registration.name, email: registration.email, passwordHash: registration.password,
      role: 'STUDENT', data: {
        surname: registration.surname, firstName: registration.firstName, middleName: registration.middleName,
        school: registration.school, department: registration.department, degreeProgram: registration.degreeProgram,
        yearLevel: registration.yearLevel, major: registration.major, gender: registration.gender,
        birthdate: registration.birthdate, houseStreetPurok: registration.houseStreetPurok,
        barangay: registration.barangay, municipality: registration.municipality, province: registration.province,
        currentAddress: registration.currentAddress, provincialAddress: registration.provincialAddress, contactNumber: registration.contactNumber,
      }, studentProfile: { create: { studentNumber: registration.studentId || `PENDING-${registration.id}`, yearLevel: registration.yearLevel, course: registration.degreeProgram } },
    }, select: { id: true, email: true } });
    await tx.pendingRegistration.update({ where: { id }, data: { status: 'APPROVED', approvedById: adminId, approvedAt: new Date() } });
    await tx.auditLogEntry.create({ data: { id: crypto.randomUUID(), actor: adminId, action: 'REGISTRATION_APPROVED', detail: registration.id } });
    return user;
  });
}

export async function rejectPendingRegistration(id, adminId, reason) {
  const result = await prisma.pendingRegistration.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'REJECTED', rejectionReason: reason || null, approvedById: adminId, rejectedAt: new Date() } });
  if (result.count !== 1) { const err = new Error('Registration is not pending approval.'); err.statusCode = 409; throw err; }
  await prisma.auditLogEntry.create({ data: { id: crypto.randomUUID(), actor: adminId, action: 'REGISTRATION_REJECTED', detail: id } });
}

export async function getUserById(id) {
  const user = await prisma.user.findUnique({ where: { id }, select: studentSelfSelect });
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }
  return toStudentSelfProfileDto(user);
}

export async function updateUserProfile(id, payload) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, data: true },
  });
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }

  const updateData = {};

  if (payload.name !== undefined) updateData.name = payload.name;
  if (payload.email !== undefined) updateData.email = payload.email;
  if (payload.password !== undefined) {
    assertPlaintextPassword(payload.password);
    updateData.passwordHash = await bcrypt.hash(payload.password, 10);
  }

  if (payload.data !== undefined) {
    const existingData = (user.data || {});
    updateData.data = { ...existingData, ...payload.data };
  }

  const updated = await prisma.user.update({
    where: { id },
    data: updateData,
    select: studentSelfSelect,
  });

  return toStudentSelfProfileDto(updated);
}

export async function loginUser(identifier, password) {
  if (!identifier || !password) {
    const err = new Error('Identifier and password are required.');
    err.statusCode = 400;
    throw err;
  }

  const trimmed = identifier.trim();

  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: trimmed, mode: 'insensitive' } },
        { studentProfile: { studentNumber: { equals: trimmed, mode: 'insensitive' } } },
      ],
    },
    select: loginUserSelect,
  });

  if (!user) {
    const pending = await prisma.pendingRegistration.findFirst({
      where: {
        OR: [
          { email: { equals: trimmed, mode: 'insensitive' } },
          { studentId: { equals: trimmed, mode: 'insensitive' } },
        ],
      },
      select: { id: true, status: true, rejectionReason: true },
    });
    if (pending) {
      if (pending.status === 'PENDING') {
        const err = new Error('Your registration is pending administrator verification. Please wait for the NSTP Director to approve your account.');
        err.statusCode = 403;
        throw err;
      }
      if (pending.status === 'REJECTED') {
        const err = new Error(`Your registration was rejected: ${pending.rejectionReason || 'Please contact the NSTP Director.'}`);
        err.statusCode = 403;
        throw err;
      }
    }

    const err = new Error('Invalid credentials.');
    err.statusCode = 401;
    throw err;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const err = new Error('Invalid credentials.');
    err.statusCode = 401;
    throw err;
  }

  if (user.status && String(user.status).toUpperCase() !== 'ACTIVE') {
    const err = new Error('This account is inactive. Contact an administrator.');
    err.statusCode = 403;
    throw err;
  }

  const token = generateToken(user);
  const data = (user.data || {});

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.toLowerCase(),
      ...data,
      studentId: user.studentProfile?.studentNumber,
      coordinatorScope: user.coordinatorProfile?.scope,
      component: user.instructorProfile?.component?.name,
      municipalities: user.instructorProfile?.municipalities,
    },
  };
}
