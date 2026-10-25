import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Password123!';

async function seedDemoRoles() {
  console.log('🚀 Seeding demo accounts for BiPSU NSTP Platform...');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // 1. Ensure NSTP Components exist
  const components = [
    { id: 'system-component-cwts', type: 'CWTS', name: 'CWTS' },
    { id: 'system-component-lts', type: 'LTS', name: 'LTS' },
    { id: 'system-component-mts-army', type: 'MTS_ARMY', name: 'MTS (Army)' },
    { id: 'system-component-mts-navy', type: 'MTS_NAVY', name: 'MTS (Navy)' },
    { id: 'system-component-cwts-coast-guard', type: 'CWTS_COAST_GUARD', name: 'CWTS (Coast Guard)' },
  ];

  for (const comp of components) {
    await prisma.nSTPComponent.upsert({
      where: { type: comp.type },
      update: { name: comp.name },
      create: { id: comp.id, type: comp.type, name: comp.name },
    });
  }
  console.log('✅ NSTP Components verified');

  const cwtsComp = await prisma.nSTPComponent.findUnique({ where: { type: 'CWTS' } });
  const mtsArmyComp = await prisma.nSTPComponent.findUnique({ where: { type: 'MTS_ARMY' } });

  // 2. ADMIN: Dr. Reynold G. Bustillo
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@bipsu.edu.ph' },
    update: {
      name: 'Dr. Reynold G. Bustillo',
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      data: {
        title: 'NSTP Director',
        subtitle: 'Office of the National Service Training Program',
        contactNumber: '09123456789',
      },
    },
    create: {
      name: 'Dr. Reynold G. Bustillo',
      email: 'admin@bipsu.edu.ph',
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      data: {
        title: 'NSTP Director',
        subtitle: 'Office of the National Service Training Program',
        contactNumber: '09123456789',
      },
    },
  });
  console.log('✅ Admin account seeded:', adminUser.email);

  // 3. COORDINATOR 1 (CWTS): Prof. Maria Santos
  const cwtsCoordUser = await prisma.user.upsert({
    where: { email: 'coordinator.cwts@bipsu.edu.ph' },
    update: {
      name: 'Prof. Maria Santos',
      passwordHash,
      role: 'COORDINATOR',
      status: 'ACTIVE',
      data: {
        title: 'CWTS Program Coordinator',
        contactNumber: '09123456781',
        coordinatorScope: 'CWTS',
      },
    },
    create: {
      name: 'Prof. Maria Santos',
      email: 'coordinator.cwts@bipsu.edu.ph',
      passwordHash,
      role: 'COORDINATOR',
      status: 'ACTIVE',
      data: {
        title: 'CWTS Program Coordinator',
        contactNumber: '09123456781',
        coordinatorScope: 'CWTS',
      },
    },
  });

  const cwtsCoordProfile = await prisma.coordinatorProfile.upsert({
    where: { userId: cwtsCoordUser.id },
    update: {
      scope: 'CWTS',
      employeeNumber: 'EMP-CWTS-001',
      componentId: cwtsComp.id,
    },
    create: {
      userId: cwtsCoordUser.id,
      employeeNumber: 'EMP-CWTS-001',
      scope: 'CWTS',
      componentId: cwtsComp.id,
    },
  });
  console.log('✅ CWTS Coordinator seeded:', cwtsCoordUser.email);

  // 4. COORDINATOR 2 (MTS / ROTC): Maj. Roberto Garcia (for cross-role isolation demo)
  const mtsCoordUser = await prisma.user.upsert({
    where: { email: 'coordinator.mts@bipsu.edu.ph' },
    update: {
      name: 'Maj. Roberto Garcia',
      passwordHash,
      role: 'COORDINATOR',
      status: 'ACTIVE',
      data: {
        title: 'MTS / ROTC Coordinator',
        contactNumber: '09123456782',
        coordinatorScope: 'MTS',
      },
    },
    create: {
      name: 'Maj. Roberto Garcia',
      email: 'coordinator.mts@bipsu.edu.ph',
      passwordHash,
      role: 'COORDINATOR',
      status: 'ACTIVE',
      data: {
        title: 'MTS / ROTC Coordinator',
        contactNumber: '09123456782',
        coordinatorScope: 'MTS',
      },
    },
  });

  await prisma.coordinatorProfile.upsert({
    where: { userId: mtsCoordUser.id },
    update: {
      scope: 'MTS',
      employeeNumber: 'EMP-MTS-001',
      componentId: mtsArmyComp.id,
    },
    create: {
      userId: mtsCoordUser.id,
      employeeNumber: 'EMP-MTS-001',
      scope: 'MTS',
      componentId: mtsArmyComp.id,
    },
  });
  console.log('✅ MTS Coordinator seeded:', mtsCoordUser.email);

  // 5. INSTRUCTOR / FACILITATOR: Engr. Juan Dela Cruz (under Prof. Maria Santos)
  const instructorUser = await prisma.user.upsert({
    where: { email: 'instructor.cwts@bipsu.edu.ph' },
    update: {
      name: 'Engr. Juan Dela Cruz',
      passwordHash,
      role: 'INSTRUCTOR',
      status: 'ACTIVE',
      data: {
        title: 'CWTS Instructor',
        contactNumber: '09123456783',
        municipalities: ['Naval', 'Almeria'],
        component: 'CWTS',
      },
    },
    create: {
      name: 'Engr. Juan Dela Cruz',
      email: 'instructor.cwts@bipsu.edu.ph',
      passwordHash,
      role: 'INSTRUCTOR',
      status: 'ACTIVE',
      data: {
        title: 'CWTS Instructor',
        contactNumber: '09123456783',
        municipalities: ['Naval', 'Almeria'],
        component: 'CWTS',
      },
    },
  });

  const instructorProfile = await prisma.instructorProfile.upsert({
    where: { userId: instructorUser.id },
    update: {
      employeeNumber: 'EMP-INST-001',
      title: 'CWTS Instructor',
      department: 'School of Technology and Computer Studies',
      coordinatorId: cwtsCoordProfile.id,
      componentId: cwtsComp.id,
      municipalities: ['Naval', 'Almeria'],
    },
    create: {
      userId: instructorUser.id,
      employeeNumber: 'EMP-INST-001',
      title: 'CWTS Instructor',
      department: 'School of Technology and Computer Studies',
      coordinatorId: cwtsCoordProfile.id,
      componentId: cwtsComp.id,
      municipalities: ['Naval', 'Almeria'],
    },
  });
  console.log('✅ Instructor seeded:', instructorUser.email);

  // 6. SECTION: CWTS-1A
  const section = await prisma.section.upsert({
    where: { code: 'CWTS-1A' },
    update: {
      name: 'CWTS Section 1A - Naval',
      schoolYear: '2025-2026',
      semester: 'FIRST',
      componentId: cwtsComp.id,
      instructorId: instructorProfile.id,
    },
    create: {
      code: 'CWTS-1A',
      name: 'CWTS Section 1A - Naval',
      schoolYear: '2025-2026',
      semester: 'FIRST',
      componentId: cwtsComp.id,
      instructorId: instructorProfile.id,
    },
  });
  console.log('✅ Class Section seeded:', section.code);

  // 7. STUDENT: Javer Domaraya
  const studentUser = await prisma.user.upsert({
    where: { email: 'student.cwts@bipsu.edu.ph' },
    update: {
      name: 'Javer Domaraya',
      passwordHash,
      role: 'STUDENT',
      status: 'ACTIVE',
      data: {
        firstName: 'Javer',
        surname: 'Domaraya',
        studentId: '21-10042',
        school: 'Biliran Province State University',
        department: 'School of Technology and Computer Studies',
        degreeProgram: 'BS Information Technology',
        yearLevel: '1st Year',
        contactNumber: '09123456784',
        municipality: 'Naval',
        province: 'Biliran',
      },
    },
    create: {
      name: 'Javer Domaraya',
      email: 'student.cwts@bipsu.edu.ph',
      passwordHash,
      role: 'STUDENT',
      status: 'ACTIVE',
      data: {
        firstName: 'Javer',
        surname: 'Domaraya',
        studentId: '21-10042',
        school: 'Biliran Province State University',
        department: 'School of Technology and Computer Studies',
        degreeProgram: 'BS Information Technology',
        yearLevel: '1st Year',
        contactNumber: '09123456784',
        municipality: 'Naval',
        province: 'Biliran',
      },
    },
  });

  const studentProfile = await prisma.studentProfile.upsert({
    where: { userId: studentUser.id },
    update: {
      studentNumber: '21-10042',
      yearLevel: '1st Year',
      course: 'BS Information Technology',
      componentId: cwtsComp.id,
      sectionId: section.id,
    },
    create: {
      userId: studentUser.id,
      studentNumber: '21-10042',
      yearLevel: '1st Year',
      course: 'BS Information Technology',
      componentId: cwtsComp.id,
      sectionId: section.id,
    },
  });
  console.log('✅ Student seeded:', studentUser.email);

  // 8. ENROLLMENT: Enroll student in CWTS-1A
  await prisma.enrollment.upsert({
    where: {
      studentId_componentId_sectionId: {
        studentId: studentProfile.id,
        componentId: cwtsComp.id,
        sectionId: section.id,
      },
    },
    update: {
      status: 'ACTIVE',
    },
    create: {
      studentId: studentProfile.id,
      componentId: cwtsComp.id,
      sectionId: section.id,
      status: 'ACTIVE',
    },
  });
  console.log('✅ Student Enrollment seeded in section:', section.code);

  console.log('\n🎉 ALL DEMO ACCOUNTS CREATED SUCCESSFULLY!\n');
}

seedDemoRoles()
  .catch((err) => {
    console.error('❌ Error seeding demo roles:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
