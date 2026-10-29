// Keep authentication fields out of every API-facing user shape. Prisma
// selections are exported so callers cannot accidentally return raw User rows.
export const adminAccountSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  instructorProfile: {
    select: {
      id: true, employeeNumber: true, department: true, title: true,
      coordinatorId: true, componentId: true, municipalities: true,
      component: { select: { type: true, name: true } },
    },
  },
  coordinatorProfile: {
    select: { id: true, employeeNumber: true, componentId: true, scope: true },
  },
};

export const studentSelfSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  data: true,
  createdAt: true,
  updatedAt: true,
  studentProfile: {
    select: {
      id: true, studentNumber: true, yearLevel: true, course: true,
      sectionId: true, componentId: true, data: true, createdAt: true, updatedAt: true,
    },
  },
  coordinatorProfile: { select: { id: true, employeeNumber: true, scope: true } },
  instructorProfile: { select: { id: true, employeeNumber: true, componentId: true, municipalities: true, component: { select: { type: true, name: true } } } },
};

export const rosterUserSelect = {
  id: true,
  name: true,
  email: true,
};

export const adminStudentSelect = {
  id: true,
  userId: true,
  studentNumber: true,
  yearLevel: true,
  course: true,
  sectionId: true,
  componentId: true,
  data: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true, email: true, data: true } },
  component: { select: { id: true, name: true, type: true } },
  section: { select: { id: true, code: true, name: true, schoolYear: true, semester: true } },
};

export const pendingRegistrationSelect = {
  id: true, studentId: true, surname: true, firstName: true, middleName: true,
  name: true, email: true, school: true, department: true, degreeProgram: true,
  yearLevel: true, major: true, gender: true, birthdate: true, houseStreetPurok: true,
  barangay: true, province: true, currentAddress: true, cityAddress: true,
  provincialAddress: true, contactNumber: true, municipality: true,
  assignedMunicipality: true, createdAt: true,
};

export function toAdminAccountDto(user) {
  if (!user) return user;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    ...(user.status ? { status: user.status } : {}),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    instructorProfile: user.instructorProfile || null,
    coordinatorProfile: user.coordinatorProfile || null,
  };
}

export function toStudentSelfProfileDto(user) {
  if (!user) return user;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    data: user.data || {},
    studentProfile: user.studentProfile || null,
    coordinatorProfile: user.coordinatorProfile || null,
    instructorProfile: user.instructorProfile || null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function toAdminStudentDto(student) {
  if (!student) return student;
  const user = student.user || {};
  const userData = (user.data && typeof user.data === 'object' && !Array.isArray(user.data)) ? user.data : {};
  const studentData = (student.data && typeof student.data === 'object' && !Array.isArray(student.data)) ? student.data : {};
  const mergedData = { ...userData, ...studentData };

  const componentName = student.component?.name || (student.component?.type ? student.component.type : null);

  return {
    id: student.id,
    userId: user.id || student.userId,
    studentId: student.studentNumber,
    studentNumber: student.studentNumber,
    surname: mergedData.surname || '',
    firstName: mergedData.firstName || '',
    middleName: mergedData.middleName || '',
    name: user.name || mergedData.name || `${mergedData.firstName || ''} ${mergedData.surname || ''}`.trim() || 'Student',
    email: user.email || mergedData.email || '',
    school: mergedData.school || '',
    department: mergedData.department || '',
    course: student.course || mergedData.course || mergedData.degreeProgram || '',
    degreeProgram: student.course || mergedData.degreeProgram || '',
    yearLevel: student.yearLevel || mergedData.yearLevel || '',
    major: mergedData.major || '',
    gender: mergedData.gender || '',
    birthdate: mergedData.birthdate || '',
    houseStreetPurok: mergedData.houseStreetPurok || '',
    barangay: mergedData.barangay || '',
    province: mergedData.province || 'Biliran',
    currentAddress: mergedData.currentAddress || '',
    cityAddress: mergedData.cityAddress || '',
    provincialAddress: mergedData.provincialAddress || '',
    contactNumber: mergedData.contactNumber || '',
    sectionId: student.sectionId,
    section: student.section,
    componentId: student.componentId || student.component?.id,
    component: componentName,
    canonicalComponent: student.component?.type || null,
    status: mergedData.status || (student.sectionId || student.componentId ? 'active' : 'pending'),
    municipality: mergedData.municipality || undefined,
    assignedMunicipality: mergedData.assignedMunicipality || mergedData.municipality || undefined,
    progress: typeof mergedData.progress === 'number' ? mergedData.progress : 0,
    assessments: typeof mergedData.assessments === 'number' ? mergedData.assessments : 0,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      data: userData,
    },
    data: mergedData,
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
  };
}
