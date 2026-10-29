import 'dotenv/config';
import bcrypt from 'bcrypt';
import prisma from '../src/db/prisma.js';
import {
  BIPSU_PROGRAMS,
  BIPSU_SCHOOLS,
  isCriminologyProgram,
  isTeacherEducationProgram,
} from '../src/constants/bipsuPrograms.js';

export const DEMO_PASSWORD = 'Password123!';

export async function runSeed() {
  console.log('🚀 Running idempotent comprehensive Prisma seed script against Neon PostgreSQL...');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ============================================================
  // 1. NSTP COMPONENTS (5 Classification Tracks)
  // ============================================================
  console.log('\n--- 1. Upserting 5 NSTP Classification Tracks ---');
  const componentsData = [
    {
      id: 'system-component-cwts',
      type: 'CWTS',
      name: 'CWTS',
      description: 'Civic Welfare Training Service',
    },
    {
      id: 'system-component-lts',
      type: 'LTS',
      name: 'LTS',
      description: 'Literacy Training Service',
    },
    {
      id: 'system-component-mts-army',
      type: 'MTS_ARMY',
      name: 'MTS (Army)',
      description: 'Military Training Service - Philippine Army (ROTC)',
    },
    {
      id: 'system-component-mts-navy',
      type: 'MTS_NAVY',
      name: 'MTS (Navy)',
      description: 'Military Training Service - Philippine Navy (ROTC)',
    },
    {
      id: 'system-component-cwts-coast-guard',
      type: 'CWTS_COAST_GUARD',
      name: 'CWTS (Coast Guard)',
      description: 'Civic Welfare Training Service - Coast Guard Auxiliary',
    },
  ];

  const componentsMap = {};
  for (const comp of componentsData) {
    const record = await prisma.nSTPComponent.upsert({
      where: { type: comp.type },
      update: { name: comp.name, description: comp.description },
      create: comp,
    });
    componentsMap[comp.type] = record;
  }
  console.log('✅ All 5 NSTP components upserted successfully.');

  // ============================================================
  // 2. COMPONENT APPLICATION STATE (AY 2025-2026 Slot Limits)
  // ============================================================
  console.log('\n--- 2. Upserting Component Application State ---');
  const slotLimits = {
    CWTS: 450,
    LTS: 300,
    'MTS (Army)': 250,
    'MTS (Navy)': 150,
    'CWTS (Coast Guard)': 100,
    MTS_ARMY: 250,
    MTS_NAVY: 150,
    CWTS_COAST_GUARD: 100,
  };

  await prisma.componentApplicationState.upsert({
    where: { id: 'app-state-default' },
    update: {
      qualifyingScore: 75,
      applicationClosed: false,
      isCurrent: true,
      schoolYear: '2025-2026',
      semester: 'FIRST',
      slotLimits,
    },
    create: {
      id: 'app-state-default',
      qualifyingScore: 75,
      applicationClosed: false,
      isCurrent: true,
      schoolYear: '2025-2026',
      semester: 'FIRST',
      slotLimits,
    },
  });
  console.log('✅ Component Application State upserted.');

  // ============================================================
  // 3. ADMINISTRATOR (Director) ACCOUNTS
  // ============================================================
  console.log('\n--- 3. Upserting Administrator Account ---');
  const directorUser = await prisma.user.upsert({
    where: { email: 'director@bipsu.edu.ph' },
    update: {
      name: 'Dr. NSTP Director',
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      data: {
        title: 'NSTP Director',
        department: 'Office of the National Service Training Program',
        contactNumber: '09123456780',
      },
    },
    create: {
      id: 'user-admin-director',
      name: 'Dr. NSTP Director',
      email: 'director@bipsu.edu.ph',
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      data: {
        title: 'NSTP Director',
        department: 'Office of the National Service Training Program',
        contactNumber: '09123456780',
      },
    },
  });
  console.log(`✅ Director account upserted: ${directorUser.email}`);

  const adminLegacy = await prisma.user.upsert({
    where: { email: 'admin@bipsu.edu.ph' },
    update: {
      name: 'Dr. Reynold G. Bustillo',
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      data: {
        title: 'NSTP Director & Dean',
        department: 'Office of the National Service Training Program',
        contactNumber: '09123456789',
      },
    },
    create: {
      id: 'user-admin-001',
      name: 'Dr. Reynold G. Bustillo',
      email: 'admin@bipsu.edu.ph',
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      data: {
        title: 'NSTP Director & Dean',
        department: 'Office of the National Service Training Program',
        contactNumber: '09123456789',
      },
    },
  });
  console.log(`✅ Admin alias upserted: ${adminLegacy.email}`);

  // ============================================================
  // 4. COMPONENT COORDINATORS (3 Tracks: CWTS, LTS, MTS)
  // ============================================================
  console.log('\n--- 4. Upserting 3 Component Coordinators ---');
  const coordinatorsConfig = [
    {
      email: 'coord.cwts@bipsu.edu.ph',
      name: 'Prof. Maria Santos',
      scope: 'CWTS',
      componentType: 'CWTS',
      employeeNumber: 'EMP-COORD-CWTS-01',
      title: 'CWTS Program Coordinator',
      aliasEmail: 'coordinator.cwts@bipsu.edu.ph',
    },
    {
      email: 'coord.lts@bipsu.edu.ph',
      name: 'Prof. Elena Rivera',
      scope: 'LTS',
      componentType: 'LTS',
      employeeNumber: 'EMP-COORD-LTS-01',
      title: 'LTS Program Coordinator',
      aliasEmail: 'coordinator.lts@bipsu.edu.ph',
    },
    {
      email: 'coord.mts@bipsu.edu.ph',
      name: 'Maj. Roberto Garcia',
      scope: 'MTS',
      componentType: 'MTS_ARMY',
      employeeNumber: 'EMP-COORD-MTS-01',
      title: 'MTS / ROTC Unit Coordinator',
      aliasEmail: 'coordinator.mts@bipsu.edu.ph',
    },
  ];

  const coordinatorProfiles = {};
  for (const c of coordinatorsConfig) {
    const comp = componentsMap[c.componentType];
    const user = await prisma.user.upsert({
      where: { email: c.email },
      update: {
        name: c.name,
        passwordHash,
        role: 'COORDINATOR',
        status: 'ACTIVE',
        data: {
          title: c.title,
          department: `NSTP ${c.scope} Component Unit`,
          coordinatorScope: c.scope,
          contactNumber: '09123456781',
        },
      },
      create: {
        name: c.name,
        email: c.email,
        passwordHash,
        role: 'COORDINATOR',
        status: 'ACTIVE',
        data: {
          title: c.title,
          department: `NSTP ${c.scope} Component Unit`,
          coordinatorScope: c.scope,
          contactNumber: '09123456781',
        },
      },
    });

    const prof = await prisma.coordinatorProfile.upsert({
      where: { userId: user.id },
      update: {
        employeeNumber: c.employeeNumber,
        scope: c.scope,
        componentId: comp.id,
      },
      create: {
        userId: user.id,
        employeeNumber: c.employeeNumber,
        scope: c.scope,
        componentId: comp.id,
      },
    });
    coordinatorProfiles[c.scope] = prof;
    console.log(`✅ Coordinator upserted: ${c.email} (${c.scope})`);

    if (c.aliasEmail) {
      const aliasUser = await prisma.user.upsert({
        where: { email: c.aliasEmail },
        update: {
          name: c.name,
          passwordHash,
          role: 'COORDINATOR',
          status: 'ACTIVE',
          data: {
            title: c.title,
            department: `NSTP ${c.scope} Component Unit`,
            coordinatorScope: c.scope,
          },
        },
        create: {
          name: c.name,
          email: c.aliasEmail,
          passwordHash,
          role: 'COORDINATOR',
          status: 'ACTIVE',
          data: {
            title: c.title,
            department: `NSTP ${c.scope} Component Unit`,
            coordinatorScope: c.scope,
          },
        },
      });

      await prisma.coordinatorProfile.upsert({
        where: { userId: aliasUser.id },
        update: {
          employeeNumber: `ALIAS-${c.employeeNumber}`,
          scope: c.scope,
          componentId: comp.id,
        },
        create: {
          userId: aliasUser.id,
          employeeNumber: `ALIAS-${c.employeeNumber}`,
          scope: c.scope,
          componentId: comp.id,
        },
      });
    }
  }

  // ============================================================
  // 5. 8 MUNICIPALITY FACILITATORS (INSTRUCTOR) & SECTIONS & TRAINING GROUPS
  // ============================================================
  console.log('\n--- 5. Upserting 8 Municipality Facilitators & Sections ---');
  const municipalitiesConfig = [
    {
      municipality: 'Naval',
      email: 'facilitator.naval@bipsu.edu.ph',
      name: 'Engr. Juan Dela Cruz',
      componentType: 'CWTS',
      coordScope: 'CWTS',
      sectionCode: 'CWTS-NAVAL-1A',
      sectionName: 'CWTS Section 1A - Naval (Main Campus)',
      department: 'School of Technology and Computer Studies (STCS)',
      programHandles: ['BS in Computer Science', 'BS in Information Systems'],
    },
    {
      municipality: 'Almeria',
      email: 'facilitator.almeria@bipsu.edu.ph',
      name: 'Prof. Rosa Almeria',
      componentType: 'LTS',
      coordScope: 'LTS',
      sectionCode: 'LTS-ALMERIA-1A',
      sectionName: 'LTS Section 1A - Almeria Outreach',
      department: 'School of Teacher Education (STE - Naval & Biliran Campuses)',
      programHandles: ['Bachelor of Elementary Education (BEEd)', 'Bachelor of Secondary Education (BSEd)'],
    },
    {
      municipality: 'Biliran',
      email: 'facilitator.biliran@bipsu.edu.ph',
      name: 'Prof. Carlos Biliran',
      componentType: 'CWTS',
      coordScope: 'CWTS',
      sectionCode: 'CWTS-BILIRAN-1A',
      sectionName: 'CWTS Section 1A - Biliran Municipality',
      department: 'School of Arts and Sciences (SAS)',
      programHandles: ['Bachelor of Arts in Communication', 'Bachelor of Arts in Economics'],
    },
    {
      municipality: 'Cabucgayan',
      email: 'facilitator.cabucgayan@bipsu.edu.ph',
      name: 'Prof. Danilo Cabucgayan',
      componentType: 'MTS_ARMY',
      coordScope: 'MTS',
      sectionCode: 'MTS-CABUCGAYAN-1A',
      sectionName: 'MTS Army Section 1A - Cabucgayan Training Group',
      department: 'School of Criminal Justice Education (SCJE)',
      programHandles: ['BS in Criminology', 'BS in Industrial Technology'],
    },
    {
      municipality: 'Caibiran',
      email: 'facilitator.caibiran@bipsu.edu.ph',
      name: 'Prof. Teresa Caibiran',
      componentType: 'CWTS_COAST_GUARD',
      coordScope: 'CWTS',
      sectionCode: 'CWTS-CG-CAIBIRAN-1A',
      sectionName: 'CWTS Coast Guard Section 1A - Caibiran Maritime',
      department: 'School of Engineering (SOE)',
      programHandles: ['BS in Civil Engineering', 'BS in Mechanical Engineering'],
    },
    {
      municipality: 'Culaba',
      email: 'facilitator.culaba@bipsu.edu.ph',
      name: 'Prof. Marco Culaba',
      componentType: 'LTS',
      coordScope: 'LTS',
      sectionCode: 'LTS-CULABA-1A',
      sectionName: 'LTS Section 1A - Culaba Literacy Center',
      department: 'School of Teacher Education (STE - Naval & Biliran Campuses)',
      programHandles: ['Bachelor of Early Childhood Education (BECEd)', 'Bachelor of Special Needs Education (BSNEd)'],
    },
    {
      municipality: 'Kawayan',
      email: 'facilitator.kawayan@bipsu.edu.ph',
      name: 'Prof. Angela Kawayan',
      componentType: 'CWTS',
      coordScope: 'CWTS',
      sectionCode: 'CWTS-KAWAYAN-1A',
      sectionName: 'CWTS Section 1A - Kawayan Community Unit',
      department: 'School of Business Management / Management and Entrepreneurship (SBM)',
      programHandles: ['BS in Business Administration', 'Bachelor of Hospitality Management'],
    },
    {
      municipality: 'Maripipi',
      email: 'facilitator.maripipi@bipsu.edu.ph',
      name: 'Prof. Roberto Maripipi',
      componentType: 'MTS_NAVY',
      coordScope: 'MTS',
      sectionCode: 'MTS-NAVY-MARIPIPI-1A',
      sectionName: 'MTS Navy Section 1A - Maripipi Island Detachment',
      department: 'School of Criminal Justice Education (SCJE)',
      programHandles: ['BS in Criminology', 'BS in Electrical Engineering'],
    },
  ];

  const municipalityFacilitators = {};
  const municipalitySections = {};

  for (const m of municipalitiesConfig) {
    const comp = componentsMap[m.componentType];
    const coord = coordinatorProfiles[m.coordScope];

    const user = await prisma.user.upsert({
      where: { email: m.email },
      update: {
        name: m.name,
        passwordHash,
        role: 'INSTRUCTOR',
        status: 'ACTIVE',
        data: {
          title: `NSTP Field Facilitator (${m.municipality})`,
          department: m.department,
          municipalities: [m.municipality],
          component: comp.name,
          contactNumber: '09123456783',
        },
      },
      create: {
        name: m.name,
        email: m.email,
        passwordHash,
        role: 'INSTRUCTOR',
        status: 'ACTIVE',
        data: {
          title: `NSTP Field Facilitator (${m.municipality})`,
          department: m.department,
          municipalities: [m.municipality],
          component: comp.name,
          contactNumber: '09123456783',
        },
      },
    });

    const prof = await prisma.instructorProfile.upsert({
      where: { userId: user.id },
      update: {
        employeeNumber: `EMP-FAC-${m.municipality.toUpperCase()}-01`,
        title: `NSTP Field Facilitator (${m.municipality})`,
        department: m.department,
        coordinatorId: coord?.id,
        componentId: comp.id,
        municipalities: [m.municipality],
      },
      create: {
        userId: user.id,
        employeeNumber: `EMP-FAC-${m.municipality.toUpperCase()}-01`,
        title: `NSTP Field Facilitator (${m.municipality})`,
        department: m.department,
        coordinatorId: coord?.id,
        componentId: comp.id,
        municipalities: [m.municipality],
      },
    });
    municipalityFacilitators[m.municipality] = { user, profile: prof };

    const section = await prisma.section.upsert({
      where: { code: m.sectionCode },
      update: {
        name: m.sectionName,
        schoolYear: '2025-2026',
        semester: 'FIRST',
        componentId: comp.id,
        instructorId: prof.id,
      },
      create: {
        code: m.sectionCode,
        name: m.sectionName,
        schoolYear: '2025-2026',
        semester: 'FIRST',
        componentId: comp.id,
        instructorId: prof.id,
      },
    });
    municipalitySections[m.municipality] = section;

    await prisma.trainingGroup.upsert({
      where: { id: `tg-${m.municipality.toLowerCase()}-01` },
      update: {
        schoolYear: '2025-2026',
        semester: 'FIRST',
        component: comp.name,
        facilitatorName: m.name,
        facilitatorId: prof.id,
        municipality: m.municipality,
        studentCount: 4,
        maxRecommendedLoad: 50,
        programHandles: m.programHandles,
      },
      create: {
        id: `tg-${m.municipality.toLowerCase()}-01`,
        schoolYear: '2025-2026',
        semester: 'FIRST',
        component: comp.name,
        facilitatorName: m.name,
        facilitatorId: prof.id,
        municipality: m.municipality,
        studentCount: 4,
        maxRecommendedLoad: 50,
        programHandles: m.programHandles,
        sourceDocument: `BiPSU-NSTP-${m.componentType}-${m.municipality}-Deployment.pdf`,
      },
    });

    console.log(`✅ Facilitator & Section & TrainingGroup upserted: ${m.name} (${m.municipality} - ${m.sectionCode})`);
  }

  // Also maintain CWTS-1A and instructor.cwts alias for test compatibility
  const navalFac = municipalityFacilitators['Naval'];
  const cwts1ASection = await prisma.section.upsert({
    where: { code: 'CWTS-1A' },
    update: {
      name: 'CWTS Section 1A - Naval',
      schoolYear: '2025-2026',
      semester: 'FIRST',
      componentId: componentsMap['CWTS'].id,
      instructorId: navalFac.profile.id,
    },
    create: {
      code: 'CWTS-1A',
      name: 'CWTS Section 1A - Naval',
      schoolYear: '2025-2026',
      semester: 'FIRST',
      componentId: componentsMap['CWTS'].id,
      instructorId: navalFac.profile.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'instructor.cwts@bipsu.edu.ph' },
    update: {
      name: 'Engr. Juan Dela Cruz',
      passwordHash,
      role: 'INSTRUCTOR',
      status: 'ACTIVE',
      data: {
        title: 'CWTS Senior Facilitator',
        department: 'School of Technology and Computer Studies (STCS)',
        municipalities: ['Naval'],
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
        title: 'CWTS Senior Facilitator',
        department: 'School of Technology and Computer Studies (STCS)',
        municipalities: ['Naval'],
        component: 'CWTS',
      },
    },
  });

  // ============================================================
  // 6. 32 STUDENTS SPREAD ACROSS 8 SCHOOLS, 8 MUNICIPALITIES & PIPELINE STAGES
  // ============================================================
  console.log('\n--- 6. Upserting 32 Students with BiPSU Schools, Automatic Track Routing & Pipeline Stages ---');

  const studentFirstNames = [
    'Javer', 'Althea Marie', 'Christian Paul', 'Jessica',
    'Mark Anthony', 'Rhea Mae', 'Joshua', 'Princess Diane',
    'Angelo', 'Kimberly', 'Gabriel', 'Bea Nicole',
    'Daniel', 'Patricia', 'Nathaniel', 'Camille Joyce',
    'John Carlo', 'Samantha', 'Ethan Paul', 'Hannah Grace',
    'Michael Dave', 'Alyssa Ashley', 'Jerome', 'Marian Joy',
    'Kevin Ray', 'Clarisse', 'Vince Ryan', 'Trisha Mae',
    'Adrian', 'Stephanie', 'Francis Joseph', 'Katrina Mae',
  ];

  const studentLastNames = [
    'Domaraya', 'Mendoza', 'Delos Reyes', 'Velasco',
    'Tan', 'Espina', 'Caneja', 'Lim',
    'Sabitsana', 'Mocorro', 'Chong', 'Cordeta',
    'Bernadas', 'Gervacio', 'Parac', 'Morillo',
    'Montes', 'Casas', 'Baticados', 'Rosales',
    'Solite', 'Jadulco', 'Perez', 'Balondo',
    'Dacillo', 'Corpin', 'Verunque', 'Baring',
    'Amador', 'Enage', 'Alvarado', 'Salatandre',
  ];

  // 32 student profile definitions matching exact 8 BiPSU Schools & Programs and Pipeline Stages
  const studentDefinitions = [
    // NAVAL (4) - Stage: Common Module (In Progress)
    {
      municipality: 'Naval',
      school: 'School of Technology and Computer Studies (STCS)',
      degreeProgram: 'BS in Computer Science',
      track: 'CWTS',
      stage: 'Common Module (In Progress)',
      geComplete: false,
      examTaken: false,
      completedModules: ['mod-nstp-001', 'mod-nstp-002'], // 10 hrs
    },
    {
      municipality: 'Naval',
      school: 'School of Teacher Education (STE - Naval & Biliran Campuses)',
      degreeProgram: 'Bachelor of Elementary Education (BEEd)',
      track: 'LTS', // Locked to LTS
      stage: 'Common Module (In Progress)',
      geComplete: false,
      examTaken: false,
      completedModules: ['mod-nstp-001'], // 5 hrs
    },
    {
      municipality: 'Naval',
      school: 'School of Criminal Justice Education (SCJE)',
      degreeProgram: 'BS in Criminology',
      track: 'MTS_ARMY', // Locked to MTS
      stage: 'Common Module (In Progress)',
      geComplete: false,
      examTaken: false,
      completedModules: ['mod-nstp-001', 'mod-nstp-002'], // 10 hrs
    },
    {
      municipality: 'Naval',
      school: 'School of Engineering (SOE)',
      degreeProgram: 'BS in Civil Engineering',
      track: 'MTS_NAVY',
      stage: 'Common Module (In Progress)',
      geComplete: false,
      examTaken: false,
      completedModules: ['mod-nstp-001'], // 5 hrs
    },

    // ALMERIA (4) - 2 In-Progress, 2 Qualifying Exam
    {
      municipality: 'Almeria',
      school: 'School of Arts and Sciences (SAS)',
      degreeProgram: 'Bachelor of Arts in Communication',
      track: 'CWTS',
      stage: 'Common Module (In Progress)',
      geComplete: false,
      examTaken: false,
      completedModules: ['mod-nstp-001', 'mod-nstp-002'], // 10 hrs
    },
    {
      municipality: 'Almeria',
      school: 'School of Teacher Education (STE - Naval & Biliran Campuses)',
      degreeProgram: 'Bachelor of Secondary Education (BSEd)',
      track: 'LTS', // Locked to LTS
      stage: 'Common Module (In Progress)',
      geComplete: false,
      examTaken: false,
      completedModules: ['mod-nstp-001', 'mod-nstp-002'], // 10 hrs
    },
    {
      municipality: 'Almeria',
      school: 'School of Criminal Justice Education (SCJE)',
      degreeProgram: 'BS in Criminology',
      track: 'MTS_ARMY', // Locked to MTS
      stage: 'Qualifying Exam / Track Selection',
      geComplete: true,
      examTaken: false,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'], // 25 hrs
    },
    {
      municipality: 'Almeria',
      school: 'School of Business Management / Management and Entrepreneurship (SBM)',
      degreeProgram: 'BS in Business Administration',
      track: 'CWTS',
      stage: 'Qualifying Exam / Track Selection',
      geComplete: true,
      examTaken: false,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'], // 25 hrs
    },

    // BILIRAN (4) - 2 Qualifying Exam, 2 Enrolled & Active
    {
      municipality: 'Biliran',
      school: 'School of Nursing and Health Sciences (SNHS)',
      degreeProgram: 'Bachelor of Science in Nursing',
      track: 'CWTS',
      stage: 'Qualifying Exam / Track Selection',
      geComplete: true,
      examTaken: false,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },
    {
      municipality: 'Biliran',
      school: 'School of Teacher Education (STE - Naval & Biliran Campuses)',
      degreeProgram: 'Bachelor of Early Childhood Education (BECEd)',
      track: 'LTS', // Locked to LTS
      stage: 'Qualifying Exam / Track Selection',
      geComplete: true,
      examTaken: false,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },
    {
      municipality: 'Biliran',
      school: 'School of Criminal Justice Education (SCJE)',
      degreeProgram: 'BS in Criminology',
      track: 'MTS_NAVY', // Locked to MTS
      stage: 'Enrolled & Active in Grade Book',
      geComplete: true,
      examTaken: true,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },
    {
      municipality: 'Biliran',
      school: 'School of Engineering (SOE)',
      degreeProgram: 'BS in Mechanical Engineering',
      track: 'CWTS',
      stage: 'Enrolled & Active in Grade Book',
      geComplete: true,
      examTaken: true,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },

    // CABUCGAYAN (4) - Enrolled & Active
    {
      municipality: 'Cabucgayan',
      school: 'School of Technology and Computer Studies (STCS)',
      degreeProgram: 'BS in Information Systems',
      track: 'CWTS',
      stage: 'Enrolled & Active in Grade Book',
      geComplete: true,
      examTaken: true,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },
    {
      municipality: 'Cabucgayan',
      school: 'School of Teacher Education (STE - Naval & Biliran Campuses)',
      degreeProgram: 'Bachelor of Special Needs Education (BSNEd)',
      track: 'LTS', // Locked to LTS
      stage: 'Enrolled & Active in Grade Book',
      geComplete: true,
      examTaken: true,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },
    {
      municipality: 'Cabucgayan',
      school: 'School of Criminal Justice Education (SCJE)',
      degreeProgram: 'BS in Criminology',
      track: 'MTS_ARMY', // Locked to MTS
      stage: 'Enrolled & Active in Grade Book',
      geComplete: true,
      examTaken: true,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },
    {
      municipality: 'Cabucgayan',
      school: 'School of Business Management / Management and Entrepreneurship (SBM)',
      degreeProgram: 'Bachelor of Tourism Management',
      track: 'CWTS_COAST_GUARD',
      stage: 'Enrolled & Active in Grade Book',
      geComplete: true,
      examTaken: true,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },

    // CAIBIRAN (4) - Enrolled & Active
    {
      municipality: 'Caibiran',
      school: 'School of Arts and Sciences (SAS)',
      degreeProgram: 'Bachelor of Arts in Economics',
      track: 'CWTS',
      stage: 'Enrolled & Active in Grade Book',
      geComplete: true,
      examTaken: true,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },
    {
      municipality: 'Caibiran',
      school: 'School of Teacher Education (STE - Naval & Biliran Campuses)',
      degreeProgram: 'Bachelor of Physical Education (BPEd)',
      track: 'LTS', // Locked to LTS
      stage: 'Enrolled & Active in Grade Book',
      geComplete: true,
      examTaken: true,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },
    {
      municipality: 'Caibiran',
      school: 'School of Criminal Justice Education (SCJE)',
      degreeProgram: 'BS in Criminology',
      track: 'MTS_ARMY', // Locked to MTS
      stage: 'Enrolled & Active in Grade Book',
      geComplete: true,
      examTaken: true,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },
    {
      municipality: 'Caibiran',
      school: 'School of Engineering (SOE)',
      degreeProgram: 'BS in Electrical Engineering',
      track: 'CWTS_COAST_GUARD',
      stage: 'Enrolled & Active in Grade Book',
      geComplete: true,
      examTaken: true,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },

    // CULABA (4) - Enrolled & Active
    {
      municipality: 'Culaba',
      school: 'School of Technology and Computer Studies (STCS)',
      degreeProgram: 'BS in Industrial Technology',
      track: 'CWTS',
      stage: 'Enrolled & Active in Grade Book',
      geComplete: true,
      examTaken: true,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },
    {
      municipality: 'Culaba',
      school: 'School of Teacher Education (STE - Naval & Biliran Campuses)',
      degreeProgram: 'Bachelor of Technology and Livelihood Education (BTLEd)',
      track: 'LTS', // Locked to LTS
      stage: 'Enrolled & Active in Grade Book',
      geComplete: true,
      examTaken: true,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },
    {
      municipality: 'Culaba',
      school: 'School of Criminal Justice Education (SCJE)',
      degreeProgram: 'BS in Criminology',
      track: 'MTS_NAVY', // Locked to MTS
      stage: 'Enrolled & Active in Grade Book',
      geComplete: true,
      examTaken: true,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },
    {
      municipality: 'Culaba',
      school: 'School of Business Management / Management and Entrepreneurship (SBM)',
      degreeProgram: 'Bachelor of Hospitality Management',
      track: 'CWTS',
      stage: 'Enrolled & Active in Grade Book',
      geComplete: true,
      examTaken: true,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },

    // KAWAYAN (4) - Enrolled & Active
    {
      municipality: 'Kawayan',
      school: 'School of Engineering (SOE)',
      degreeProgram: 'BS in Computer Engineering',
      track: 'CWTS',
      stage: 'Enrolled & Active in Grade Book',
      geComplete: true,
      examTaken: true,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },
    {
      municipality: 'Kawayan',
      school: 'School of Teacher Education (STE - Naval & Biliran Campuses)',
      degreeProgram: 'Bachelor of Elementary Education (BEEd)',
      track: 'LTS', // Locked to LTS
      stage: 'Enrolled & Active in Grade Book',
      geComplete: true,
      examTaken: true,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },
    {
      municipality: 'Kawayan',
      school: 'School of Criminal Justice Education (SCJE)',
      degreeProgram: 'BS in Criminology',
      track: 'MTS_ARMY', // Locked to MTS
      stage: 'Enrolled & Active in Grade Book',
      geComplete: true,
      examTaken: true,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },
    {
      municipality: 'Kawayan',
      school: 'School of Graduate Studies',
      degreeProgram: 'Master in Public Management',
      track: 'CWTS_COAST_GUARD',
      stage: 'Enrolled & Active in Grade Book',
      geComplete: true,
      examTaken: true,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },

    // MARIPIPI (4) - Enrolled & Active
    {
      municipality: 'Maripipi',
      school: 'School of Nursing and Health Sciences (SNHS)',
      degreeProgram: 'Bachelor of Science in Nursing',
      track: 'CWTS',
      stage: 'Enrolled & Active in Grade Book',
      geComplete: true,
      examTaken: true,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },
    {
      municipality: 'Maripipi',
      school: 'School of Teacher Education (STE - Naval & Biliran Campuses)',
      degreeProgram: 'Bachelor of Secondary Education (BSEd)',
      track: 'LTS', // Locked to LTS
      stage: 'Enrolled & Active in Grade Book',
      geComplete: true,
      examTaken: true,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },
    {
      municipality: 'Maripipi',
      school: 'School of Criminal Justice Education (SCJE)',
      degreeProgram: 'BS in Criminology',
      track: 'MTS_NAVY', // Locked to MTS
      stage: 'Enrolled & Active in Grade Book',
      geComplete: true,
      examTaken: true,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },
    {
      municipality: 'Maripipi',
      school: 'School of Technology and Computer Studies (STCS)',
      degreeProgram: 'BS in Computer Science',
      track: 'MTS_NAVY',
      stage: 'Enrolled & Active in Grade Book',
      geComplete: true,
      examTaken: true,
      completedModules: ['mod-nstp-001', 'mod-nstp-002', 'mod-nstp-003', 'mod-nstp-004', 'mod-nstp-005'],
    },
  ];

  const allSeededStudents = [];

  for (let idx = 0; idx < studentDefinitions.length; idx++) {
    const def = studentDefinitions[idx];
    const idNumStr = String(idx + 1).padStart(4, '0');
    const studentNumber = `2026-${idNumStr}`;
    const email = `student.${def.municipality.toLowerCase()}${(idx % 4) + 1}@bipsu.edu.ph`;
    const firstName = studentFirstNames[idx];
    const lastName = studentLastNames[idx];
    const fullName = `${firstName} ${lastName}`;
    const section = municipalitySections[def.municipality];
    const componentRecord = componentsMap[def.track];

    const isFullyEnrolled = def.stage === 'Enrolled & Active in Grade Book';
    const componentIdToAssign = isFullyEnrolled ? componentRecord.id : null;
    const sectionIdToAssign = isFullyEnrolled ? section.id : null;

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name: fullName,
        passwordHash,
        role: 'STUDENT',
        status: 'ACTIVE',
        data: {
          firstName,
          surname: lastName,
          studentId: studentNumber,
          municipality: def.municipality,
          province: 'Biliran',
          school: def.school,
          department: def.school,
          degreeProgram: def.degreeProgram,
          yearLevel: '1st Year',
          preferredComponent: componentRecord.name,
          generalEducationComplete: def.geComplete,
          examTaken: def.examTaken,
          examScore: def.examTaken ? 82 + ((idx * 3) % 16) : null,
          pipelineStage: def.stage,
        },
      },
      create: {
        name: fullName,
        email,
        passwordHash,
        role: 'STUDENT',
        status: 'ACTIVE',
        data: {
          firstName,
          surname: lastName,
          studentId: studentNumber,
          municipality: def.municipality,
          province: 'Biliran',
          school: def.school,
          department: def.school,
          degreeProgram: def.degreeProgram,
          yearLevel: '1st Year',
          preferredComponent: componentRecord.name,
          generalEducationComplete: def.geComplete,
          examTaken: def.examTaken,
          examScore: def.examTaken ? 82 + ((idx * 3) % 16) : null,
          pipelineStage: def.stage,
        },
      },
    });

    const profile = await prisma.studentProfile.upsert({
      where: { userId: user.id },
      update: {
        studentNumber,
        yearLevel: '1st Year',
        course: def.degreeProgram,
        sectionId: sectionIdToAssign,
        componentId: componentIdToAssign,
        data: {
          studentId: studentNumber,
          school: def.school,
          degreeProgram: def.degreeProgram,
          municipality: def.municipality,
          province: 'Biliran',
          pipelineStage: def.stage,
        },
      },
      create: {
        userId: user.id,
        studentNumber,
        yearLevel: '1st Year',
        course: def.degreeProgram,
        sectionId: sectionIdToAssign,
        componentId: componentIdToAssign,
        data: {
          studentId: studentNumber,
          school: def.school,
          degreeProgram: def.degreeProgram,
          municipality: def.municipality,
          province: 'Biliran',
          pipelineStage: def.stage,
        },
      },
    });

    if (isFullyEnrolled) {
      await prisma.enrollment.upsert({
        where: {
          studentId_componentId_sectionId: {
            studentId: profile.id,
            componentId: componentRecord.id,
            sectionId: section.id,
          },
        },
        update: {
          status: 'ACTIVE',
          schoolYear: '2025-2026',
          semester: 'FIRST',
        },
        create: {
          studentId: profile.id,
          componentId: componentRecord.id,
          sectionId: section.id,
          schoolYear: '2025-2026',
          semester: 'FIRST',
          status: 'ACTIVE',
          enrolledAt: new Date(),
        },
      });
    }

    allSeededStudents.push({
      user,
      profile,
      studentNumber,
      email,
      fullName,
      municipality: def.municipality,
      school: def.school,
      degreeProgram: def.degreeProgram,
      component: componentRecord,
      section,
      stage: def.stage,
      geComplete: def.geComplete,
      examTaken: def.examTaken,
      completedModules: def.completedModules,
      isFullyEnrolled,
    });
  }
  console.log(`✅ Upserted ${allSeededStudents.length} students across 8 BiPSU schools and pipeline stages.`);

  // Legacy student alias support (student.cwts@bipsu.edu.ph)
  const legacyStudent1 = await prisma.user.upsert({
    where: { email: 'student.cwts@bipsu.edu.ph' },
    update: {
      name: 'Javer Domaraya',
      passwordHash,
      role: 'STUDENT',
      status: 'ACTIVE',
      data: {
        studentId: '21-10042',
        municipality: 'Naval',
        province: 'Biliran',
        school: 'School of Technology and Computer Studies (STCS)',
        degreeProgram: 'BS in Computer Science',
        preferredComponent: 'CWTS',
        generalEducationComplete: true,
        examTaken: true,
        examScore: 92,
        pipelineStage: 'Enrolled & Active in Grade Book',
      },
    },
    create: {
      id: 'user-stud-cwts-001',
      name: 'Javer Domaraya',
      email: 'student.cwts@bipsu.edu.ph',
      passwordHash,
      role: 'STUDENT',
      status: 'ACTIVE',
      data: {
        studentId: '21-10042',
        municipality: 'Naval',
        province: 'Biliran',
        school: 'School of Technology and Computer Studies (STCS)',
        degreeProgram: 'BS in Computer Science',
        preferredComponent: 'CWTS',
        generalEducationComplete: true,
        examTaken: true,
        examScore: 92,
        pipelineStage: 'Enrolled & Active in Grade Book',
      },
    },
  });

  const legacyProfile1 = await prisma.studentProfile.upsert({
    where: { userId: legacyStudent1.id },
    update: {
      studentNumber: '21-10042',
      yearLevel: '1st Year',
      course: 'BS in Computer Science',
      sectionId: cwts1ASection.id,
      componentId: componentsMap['CWTS'].id,
    },
    create: {
      id: 'prof-stud-cwts-001',
      userId: legacyStudent1.id,
      studentNumber: '21-10042',
      yearLevel: '1st Year',
      course: 'BS in Computer Science',
      sectionId: cwts1ASection.id,
      componentId: componentsMap['CWTS'].id,
    },
  });

  await prisma.enrollment.upsert({
    where: {
      studentId_componentId_sectionId: {
        studentId: legacyProfile1.id,
        componentId: componentsMap['CWTS'].id,
        sectionId: cwts1ASection.id,
      },
    },
    update: { status: 'ACTIVE' },
    create: {
      id: 'enr-stud-cwts-001',
      studentId: legacyProfile1.id,
      componentId: componentsMap['CWTS'].id,
      sectionId: cwts1ASection.id,
      status: 'ACTIVE',
      enrolledAt: new Date(),
    },
  });

  // 3 Pending Registration applicants for enrollment verification testing (Pipeline Stage 1)
  const pendingApplicants = [
    {
      id: 'reg-pending-001',
      studentId: '2026-0091',
      surname: 'Cruz',
      firstName: 'Juanito',
      name: 'Juanito Cruz',
      email: 'student.applicant1@bipsu.edu.ph',
      school: 'School of Criminal Justice Education (SCJE)',
      department: 'School of Criminal Justice Education (SCJE)',
      degreeProgram: 'BS in Criminology',
      yearLevel: '1st Year',
      municipality: 'Naval',
      assignedMunicipality: 'Naval',
      province: 'Biliran',
      contactNumber: '09123456791',
      status: 'PENDING',
    },
    {
      id: 'reg-pending-002',
      studentId: '2026-0092',
      surname: 'Verification',
      firstName: 'Maria Teresa',
      name: 'Maria Teresa Verification',
      email: 'student.applicant2@bipsu.edu.ph',
      school: 'School of Teacher Education (STE - Naval & Biliran Campuses)',
      department: 'School of Teacher Education (STE - Naval & Biliran Campuses)',
      degreeProgram: 'Bachelor of Elementary Education (BEEd)',
      yearLevel: '1st Year',
      municipality: 'Biliran',
      assignedMunicipality: 'Biliran',
      province: 'Biliran',
      contactNumber: '09123456792',
      status: 'PENDING',
    },
    {
      id: 'reg-pending-003',
      studentId: '2026-0093',
      surname: 'Santos',
      firstName: 'Antonio',
      name: 'Antonio Santos',
      email: 'student.applicant3@bipsu.edu.ph',
      school: 'School of Engineering (SOE)',
      department: 'School of Engineering (SOE)',
      degreeProgram: 'BS in Civil Engineering',
      yearLevel: '1st Year',
      municipality: 'Maripipi',
      assignedMunicipality: 'Maripipi',
      province: 'Biliran',
      contactNumber: '09123456793',
      status: 'PENDING',
    },
  ];

  for (const p of pendingApplicants) {
    await prisma.pendingRegistration.upsert({
      where: { id: p.id },
      update: p,
      create: p,
    });
  }
  console.log('✅ 3 PendingRegistration records upserted for Enrollment Verification testing.');

  // ============================================================
  // 7. COMMON MODULES (Published, Totaling 25 Hours) & LESSONS
  // ============================================================
  console.log('\n--- 7. Upserting Common Modules (25 Hours Total) & Lessons ---');
  const commonModulesConfig = [
    {
      id: 'mod-nstp-001',
      title: 'Citizenship Training & RA 9163 Legal Foundations',
      description: 'Orientation on the 1987 Constitution, Good Citizenship Values, and the National Service Training Program Act of 2001.',
      hours: 5,
      order: 1,
      lessons: [
        {
          id: 'les-mod1-01',
          title: 'Republic Act 9163 Framework & Guiding Principles',
          content: 'Thorough examination of the NSTP Act of 2001, youth empowerment, civic engagement, and tripartite component structures.',
          order: 1,
        },
        {
          id: 'les-mod1-02',
          title: 'The 16 Good Citizenship Values (Preamble Clusters)',
          content: 'Exploration of Pagkamaka-Diyos, Pagkamaka-Tao, Pagkamaka-Bayan, and Pagkamaka-Kalikasan in community service.',
          order: 2,
        },
      ],
    },
    {
      id: 'mod-nstp-002',
      title: 'Drug Education & Substance Abuse Prevention (RA 9165)',
      description: 'Comprehensive study of the Dangerous Drugs Act of 2002, physiological hazards of narcotics, and youth anti-drug advocacy.',
      hours: 5,
      order: 2,
      lessons: [
        {
          id: 'les-mod2-01',
          title: 'Classification of Controlled Substances & RA 9165 Penalties',
          content: 'Legal aspects, drug testing guidelines in higher education institutions, and role of PDEA & PNP in community defense.',
          order: 1,
        },
        {
          id: 'les-mod2-02',
          title: 'Community-Based Drug Rehabilitation & Barangay Advocacy',
          content: 'Facilitating youth prevention campaigns, peer counseling techniques, and sports development alternatives in Biliran.',
          order: 2,
        },
      ],
    },
    {
      id: 'mod-nstp-003',
      title: 'Disaster Risk Reduction and Management (DRRM) & Climate Change',
      description: 'Philippine Disaster Risk Reduction and Management Act (RA 10121), community vulnerability assessment, and basic life support.',
      hours: 5,
      order: 3,
      lessons: [
        {
          id: 'les-mod3-01',
          title: 'RA 10121 Thematic Pillars & Barangay Hazard Mapping',
          content: 'Prevention, mitigation, preparedness, response, and rehabilitation frameworks adapted for coastal Biliran municipalities.',
          order: 1,
        },
        {
          id: 'les-mod3-02',
          title: 'Basic Life Support (BLS) & Standard First Aid Protocols',
          content: 'Hands-on adult CPR protocols, choking relief, pressure bandaging, and casualty triage under incident command.',
          order: 2,
        },
      ],
    },
    {
      id: 'mod-nstp-004',
      title: 'Environmental Protection & Coastal Resource Management',
      description: 'Solid Waste Management (RA 9003), Clean Air Act (RA 8749), marine sanctuary stewardship, and tree parenting.',
      hours: 5,
      order: 4,
      lessons: [
        {
          id: 'les-mod4-01',
          title: 'Ecological Solid Waste Management & Marine Protection',
          content: 'Waste segregation at source, zero-plastic initiatives, and preserving coral reef ecosystems in Biliran coastal waters.',
          order: 1,
        },
        {
          id: 'les-mod4-02',
          title: 'Mangrove Reforestation & Watershed Protection Projects',
          content: 'Techniques for sustainable mangrove planting, seedling survival monitoring, and youth-led watershed patrols.',
          order: 2,
        },
      ],
    },
    {
      id: 'mod-nstp-005',
      title: 'National Security Concerns & Peace Education',
      description: 'Concept of national security, territorial integrity, cyber security literacy, culture of peace, and internal conflict resolution.',
      hours: 5,
      order: 5,
      lessons: [
        {
          id: 'les-mod5-01',
          title: 'Human Security Dimensions & Territorial Sovereignty',
          content: 'Non-military threats to human security: food, economic, environmental, health, personal, community, and political security.',
          order: 1,
        },
        {
          id: 'les-mod5-02',
          title: 'Digital Resilience, Anti-Disinformation & Cyber Defense',
          content: 'Cyber hygiene for college students, recognizing fake news, counter-radicalization, and fostering peaceful dialogue.',
          order: 2,
        },
      ],
    },
  ];

  for (const m of commonModulesConfig) {
    const modRecord = await prisma.module.upsert({
      where: { id: m.id },
      update: {
        title: m.title,
        description: m.description,
        order: m.order,
        hours: m.hours,
        isPublished: true,
        status: 'PUBLISHED',
        componentId: null,
      },
      create: {
        id: m.id,
        title: m.title,
        description: m.description,
        order: m.order,
        hours: m.hours,
        isPublished: true,
        status: 'PUBLISHED',
        componentId: null,
      },
    });

    for (const l of m.lessons) {
      await prisma.lesson.upsert({
        where: { id: l.id },
        update: {
          title: l.title,
          content: l.content,
          order: l.order,
          moduleId: modRecord.id,
        },
        create: {
          id: l.id,
          title: l.title,
          content: l.content,
          order: l.order,
          moduleId: modRecord.id,
        },
      });
    }
  }
  console.log('✅ 5 Common Modules (total 25 hours) & Lessons upserted.');

  // Student Module Progress for all seeded students according to their pipeline stage
  for (const s of allSeededStudents) {
    for (const modId of s.completedModules) {
      await prisma.moduleProgress.upsert({
        where: {
          studentId_moduleId: {
            studentId: s.profile.id,
            moduleId: modId,
          },
        },
        update: { completedAt: new Date(Date.now() - 7 * 86400000) },
        create: {
          studentId: s.profile.id,
          moduleId: modId,
          completedAt: new Date(Date.now() - 7 * 86400000),
        },
      });
    }
  }
  console.log('✅ Student module progress seeded according to pipeline stage.');

  // ============================================================
  // 8. ASSESSMENTS: QUALIFYING EXAM & MODULE QUIZZES (8 QUESTIONS EACH)
  // ============================================================
  console.log('\n--- 8. Upserting Qualifying Exam & Quizzes (8 Questions Each) ---');

  const qualifyingExam = await prisma.exam.upsert({
    where: { id: 'exam-qualifying-001' },
    update: {
      title: 'BiPSU NSTP Track Qualifying Assessment & Component Diagnostic',
      instructions: 'Complete all 8 diagnostic questions to assess your aptitude and track suitability for CWTS, LTS, or MTS (ROTC).',
      totalPoints: 80,
      startsAt: new Date(Date.now() - 30 * 86400000),
      endsAt: new Date(Date.now() + 60 * 86400000),
    },
    create: {
      id: 'exam-qualifying-001',
      title: 'BiPSU NSTP Track Qualifying Assessment & Component Diagnostic',
      instructions: 'Complete all 8 diagnostic questions to assess your aptitude and track suitability for CWTS, LTS, or MTS (ROTC).',
      totalPoints: 80,
      startsAt: new Date(Date.now() - 30 * 86400000),
      endsAt: new Date(Date.now() + 60 * 86400000),
    },
  });

  const qualifyingQuestions = [
    {
      id: 'q-exam-01',
      prompt: 'What is the primary statutory purpose of Republic Act No. 9163 (NSTP Act of 2001)?',
      options: [
        'Mandating compulsory military conscription for all college graduates',
        'Enhancing civic consciousness and defense preparedness in the Filipino youth',
        'Replacing all physical education and sports courses in tertiary curriculum',
        'Providing student labor for government infrastructure projects',
      ],
      answer: { correctIndex: 1 },
      points: 10,
      order: 1,
    },
    {
      id: 'q-exam-02',
      prompt: 'Which NSTP component is designed to train students in teaching literacy and numeracy to school children and out-of-school youth?',
      options: ['CWTS', 'LTS', 'MTS Army', 'CWTS Coast Guard'],
      answer: { correctIndex: 1 },
      points: 10,
      order: 2,
    },
    {
      id: 'q-exam-03',
      prompt: 'Under the Philippine Constitution, what is the prime duty of the Government and its citizens regarding national defense?',
      options: [
        'To defend the State, rendering personal, military, or civil service when called upon',
        'To engage solely in international commercial trade',
        'To establish private armies in every municipality',
        'To delegate national defense exclusively to foreign peacekeeping troops',
      ],
      answer: { correctIndex: 0 },
      points: 10,
      order: 3,
    },
    {
      id: 'q-exam-04',
      prompt: 'Which core Good Citizenship Value is demonstrated through tree planting, coastal cleanups, and solid waste segregation?',
      options: ['Pagkamaka-Diyos', 'Pagkamaka-Tao', 'Pagkamaka-Bayan', 'Pagkamaka-Kalikasan'],
      answer: { correctIndex: 3 },
      points: 10,
      order: 4,
    },
    {
      id: 'q-exam-05',
      prompt: 'What is the minimum passing score required for the BiPSU NSTP Track Qualifying Assessment?',
      options: ['50%', '60%', '75%', '90%'],
      answer: { correctIndex: 2 },
      points: 10,
      order: 5,
    },
    {
      id: 'q-exam-06',
      prompt: 'In Disaster Risk Reduction and Management (RA 10121), which phase focuses on restoring damaged basic facilities and livelihoods?',
      options: ['Disaster Prevention', 'Disaster Preparedness', 'Disaster Response', 'Disaster Rehabilitation & Recovery'],
      answer: { correctIndex: 3 },
      points: 10,
      order: 6,
    },
    {
      id: 'q-exam-07',
      prompt: 'What law penalizes the improper handling and disrespect of the National Flag and Anthem of the Philippines?',
      options: ['Republic Act 8491', 'Republic Act 9165', 'Republic Act 10121', 'Republic Act 7160'],
      answer: { correctIndex: 0 },
      points: 10,
      order: 7,
    },
    {
      id: 'q-exam-08',
      prompt: 'Graduates of the non-ROTC components (CWTS and LTS) belong to which national reserve corps?',
      options: [
        'Armed Forces of the Philippines Reserve Command (AFPRESCOM)',
        'National Service Reserve Corps (NSRC)',
        'Philippine Coast Guard Auxiliary (PCGA)',
        'Philippine National Police Special Action Force',
      ],
      answer: { correctIndex: 1 },
      points: 10,
      order: 8,
    },
  ];

  for (const q of qualifyingQuestions) {
    await prisma.question.upsert({
      where: { id: q.id },
      update: {
        examId: qualifyingExam.id,
        prompt: q.prompt,
        options: q.options,
        answer: q.answer,
        points: q.points,
        order: q.order,
      },
      create: {
        id: q.id,
        examId: qualifyingExam.id,
        prompt: q.prompt,
        options: q.options,
        answer: q.answer,
        points: q.points,
        order: q.order,
      },
    });
  }
  console.log('✅ Qualifying Exam with 8 questions upserted.');

  // Quizzes for the 5 Common Modules
  const moduleQuizzesConfig = [
    {
      quizId: 'quiz-mod-001',
      moduleId: 'mod-nstp-001',
      title: 'Module 1 Assessment: Citizenship & Constitutional Literacy',
      questions: [
        { id: 'q-m1-01', prompt: 'In what year was Republic Act 9163 enacted into law by the Philippine Congress?', options: ['1998', '2001', '2004', '2010'], ans: 1 },
        { id: 'q-m1-02', prompt: 'Which article of the 1987 Philippine Constitution outlines the Bill of Rights?', options: ['Article I', 'Article II', 'Article III', 'Article IV'], ans: 2 },
        { id: 'q-m1-03', prompt: 'How many Good Citizenship Values are clustered under the Preamble of the Philippine Constitution?', options: ['8', '12', '16', '20'], ans: 2 },
        { id: 'q-m1-04', prompt: 'Under R.A. 8491, how should a damaged Philippine flag be respectfully disposed of?', options: ['Thrown in regular waste bins', 'Buried in public cemetery', 'Burned solemnly to avoid desecration', 'Recycled as cleaning cloth'], ans: 2 },
        { id: 'q-m1-05', prompt: 'What is the required semester duration for each NSTP program component?', options: ['1 semester', '2 consecutive semesters', '3 semesters', '4 semesters'], ans: 1 },
        { id: 'q-m1-06', prompt: 'Which government agency oversees the implementation of CWTS and LTS across universities?', options: ['CHED and TESDA', 'DND and AFP', 'DepEd and DSWD', 'DOH and DILG'], ans: 0 },
        { id: 'q-m1-07', prompt: 'What cluster of values includes truth, justice, freedom, and love for fellow citizens?', options: ['Pagkamaka-Diyos', 'Pagkamaka-Tao', 'Pagkamaka-Bayan', 'Pagkamaka-Kalikasan'], ans: 1 },
        { id: 'q-m1-08', prompt: 'True or False: Male and female students have equal obligation and opportunity to enroll in any NSTP component.', options: ['True', 'False, males must do ROTC only', 'False, females cannot join MTS', 'False, only state scholars take NSTP'], ans: 0 },
      ],
    },
    {
      quizId: 'quiz-mod-002',
      moduleId: 'mod-nstp-002',
      title: 'Module 2 Assessment: Drug Awareness & Substance Abuse Prevention',
      questions: [
        { id: 'q-m2-01', prompt: 'What is the official title of Republic Act No. 9165?', options: ['Comprehensive Dangerous Drugs Act of 2002', 'Anti-Substance Abuse Law of 1995', 'National Drug Rehabilitation Code', 'Philippine Narcotics Interdiction Act'], ans: 0 },
        { id: 'q-m2-02', prompt: 'What is the lead policy-making and strategy formulating government body in drug prevention?', options: ['Dangerous Drugs Board (DDB)', 'Department of Health', 'Bureau of Customs', 'Philippine Red Cross'], ans: 0 },
        { id: 'q-m2-03', prompt: 'Which agency serves as the lead operating arm for drug enforcement in the country?', options: ['PDEA', 'NBI', 'MMDA', 'LTO'], ans: 0 },
        { id: 'q-m2-04', prompt: 'Which category of drugs speeds up central nervous system activity, causing heightened alertness?', options: ['Depressants', 'Stimulants', 'Hallucinogens', 'Inhalants'], ans: 1 },
        { id: 'q-m2-05', prompt: 'What is the physiological state where a person requires larger drug doses to produce the same effect?', options: ['Addiction', 'Tolerance', 'Withdrawal', 'Overdose'], ans: 1 },
        { id: 'q-m2-06', prompt: 'Under RA 9165, random drug testing in colleges and universities is primarily conducted for what purpose?', options: ['Immediate criminal prosecution', 'Public shaming', 'Rehabilitative and preventive intervention', 'Academic expulsion'], ans: 2 },
        { id: 'q-m2-07', prompt: 'What is the primary community-level committee responsible for anti-drug programs in barangays?', options: ['BADAC', 'BPAT', 'BDRRMC', 'SK Council'], ans: 0 },
        { id: 'q-m2-08', prompt: 'Which protective factor strengthens student resistance against illegal substance initiation?', options: ['Peer pressure from gang members', 'Strong family communication and academic engagement', 'Easy access to prescription tranquilizers', 'Unsupervised late night street gatherings'], ans: 1 },
      ],
    },
    {
      quizId: 'quiz-mod-003',
      moduleId: 'mod-nstp-003',
      title: 'Module 3 Assessment: Disaster Risk Reduction & Basic Life Support',
      questions: [
        { id: 'q-m3-01', prompt: 'What law mandates the Philippine Disaster Risk Reduction and Management System?', options: ['Republic Act 10121', 'Republic Act 9163', 'Republic Act 7160', 'Republic Act 8749'], ans: 0 },
        { id: 'q-m3-02', prompt: 'What is the standard chest compression to rescue breath ratio in adult single-rescuer CPR?', options: ['15 compressions to 2 breaths', '30 compressions to 2 breaths', '50 compressions to 5 breaths', '100 compressions without pause'], ans: 1 },
        { id: 'q-m3-03', prompt: 'What is the universal recommended action during an earthquake when inside a building?', options: ['Duck, Cover, and Hold', 'Run outside immediately', 'Stand beside glass windows', 'Take the passenger elevator'], ans: 0 },
        { id: 'q-m3-04', prompt: 'What does the acronym NDRRMC stand for?', options: ['National Disaster Risk Reduction and Management Council', 'National Defense Relief and Rescue Medical Center', 'Naval Disaster Reconnaissance and Recovery Commission', 'National Direct Resource and Response Corps'], ans: 0 },
        { id: 'q-m3-05', prompt: 'Which emergency procedure is used to relieve a choking person suffering from severe airway obstruction?', options: ['Heimlich Maneuver (Abdominal Thrusts)', 'Cardiopulmonary Resuscitation', 'Recovery Position', 'Head-Tilt Chin-Lift'], ans: 0 },
        { id: 'q-m3-06', prompt: 'What is the target rate of chest compressions per minute for effective CPR?', options: ['60-80 per min', '80-100 per min', '100-120 per min', '140-160 per min'], ans: 2 },
        { id: 'q-m3-07', prompt: 'Which color in medical disaster triage denotes immediate, life-threatening emergency care needed?', options: ['Green', 'Yellow', 'Red', 'Black'], ans: 2 },
        { id: 'q-m3-08', prompt: 'What document maps local hazards, evacuation routes, and safe zones at the barangay level?', options: ['Barangay Hazard and Contingency Map', 'Municipal Tax Register', 'Building Permit Blueprint', 'Voters Masterlist'], ans: 0 },
      ],
    },
    {
      quizId: 'quiz-mod-004',
      moduleId: 'mod-nstp-004',
      title: 'Module 4 Assessment: Environmental Protection & Ecological Stewardship',
      questions: [
        { id: 'q-m4-01', prompt: 'What is the Philippine Ecological Solid Waste Management Act of 2000?', options: ['RA 9003', 'RA 8749', 'RA 9275', 'RA 7586'], ans: 0 },
        { id: 'q-m4-02', prompt: 'Which of the following is considered biodegradable organic waste?', options: ['Plastic bottle caps', 'Banana peelings and food scraps', 'Styrofoam food containers', 'Aluminum beverage cans'], ans: 1 },
        { id: 'q-m4-03', prompt: 'What is the ecological purpose of mangrove forests in coastal Biliran municipalities?', options: ['Buffer against storm surges and breeding ground for marine fish', 'Commercial sand quarrying zone', 'Deep harbor dredging area', 'Dumping area for municipal compost'], ans: 0 },
        { id: 'q-m4-04', prompt: 'Which national statute governs clean air standards and regulates vehicle emissions?', options: ['Clean Air Act of 1999 (RA 8749)', 'Toxic Substances Act (RA 6969)', 'Clean Water Act (RA 9275)', 'Climate Change Act (RA 9729)'], ans: 0 },
        { id: 'q-m4-05', prompt: 'What is the concept of tree parenting as opposed to mere tree planting?', options: ['Nurturing and monitoring planted seedlings until maturity', 'Selling saplings to private timber companies', 'Harvesting firewood from protected forests', 'Taking photos with saplings and leaving immediately'], ans: 0 },
        { id: 'q-m4-06', prompt: 'Which phenomenon causes the gradual warming of the Earth due to trapped greenhouse gases?', options: ['Global Warming & Climate Change', 'Tectonic Subduction', 'Geomagnetic Inversion', 'Oceanic Tide Surge'], ans: 0 },
        { id: 'q-m4-07', prompt: 'What practice violates R.A. 9003 and is strictly prohibited in barangays?', options: ['Open burning of garbage (siga)', 'Backyard composting of leaves', 'Recycling plastic bottles into eco-bricks', 'Separating glass bottles from cans'], ans: 0 },
        { id: 'q-m4-08', prompt: 'What is an effective way college students can advocate for zero-waste campuses?', options: ['Bringing reusable tumblers and eating utensils', 'Ordering single-use plastics daily', 'Disposing electronic batteries in garden soil', 'Leaving trash under lecture hall armchairs'], ans: 0 },
      ],
    },
    {
      quizId: 'quiz-mod-005',
      moduleId: 'mod-nstp-005',
      title: 'Module 5 Assessment: National Security & Peace Education',
      questions: [
        { id: 'q-m5-01', prompt: 'In contemporary Philippine doctrine, how is National Security defined?', options: ['Protection of sovereignty, territorial integrity, and well-being of the Filipino people', 'Military rule across all civilian universities', 'Isolationism from foreign trade alliances', 'Total censorship of all social media channels'], ans: 0 },
        { id: 'q-m5-02', prompt: 'Which dimension of human security involves access to adequate nutrition and clean drinking water?', options: ['Food Security', 'Military Security', 'Border Security', 'Cyber Security'], ans: 0 },
        { id: 'q-m5-03', prompt: 'What is the culture of peace in the context of community conflict resolution?', options: ['Resolving disputes through dialogue, justice, mutual respect, and non-violence', 'Enforcing obedience through fear of police arrest', 'Ignoring community friction until it disappears', 'Mandating armed retaliation against rival groups'], ans: 0 },
        { id: 'q-m5-04', prompt: 'What law penalizes unauthorized computer access, phishing, and online identity theft in the Philippines?', options: ['Cybercrime Prevention Act of 2012 (RA 10175)', 'Data Privacy Act of 2012 (RA 10173)', 'Electronic Commerce Act (RA 8792)', 'Anti-Wiretapping Act (RA 4200)'], ans: 0 },
        { id: 'q-m5-05', prompt: 'How can students safeguard their digital identity and combat disinformation online?', options: ['Fact-checking sources before sharing and enabling two-factor authentication', 'Sharing sensational headlines without reading articles', 'Using weak passwords like 123456 across accounts', 'Clicking unknown hyperlinks sent by anonymous profiles'], ans: 0 },
        { id: 'q-m5-06', prompt: 'What peaceful role can youth leaders play in barangay peace and order councils?', options: ['Organizing sports, literacy programs, and conflict mediation seminars', 'Patrolling communities with firearms', 'Running underground detention facilities', 'Arresting neighborhood suspects without warrants'], ans: 0 },
        { id: 'q-m5-07', prompt: 'Which United Nations Sustainable Development Goal (SDG) promotes peace, justice, and strong institutions?', options: ['SDG 16', 'SDG 1', 'SDG 5', 'SDG 13'], ans: 0 },
        { id: 'q-m5-08', prompt: 'What is the prime role of the National Service Reserve Corps (NSRC) in nation-building?', options: ['Assisting the state in disaster risk reduction, civic welfare, and national emergencies', 'Conducting combat surveillance missions abroad', 'Acting as corporate private security guards', 'Managing commercial tollways and airports'], ans: 0 },
      ],
    },
  ];

  for (const qz of moduleQuizzesConfig) {
    const quiz = await prisma.quiz.upsert({
      where: { id: qz.quizId },
      update: {
        moduleId: qz.moduleId,
        title: qz.title,
        instructions: 'Answer all 8 questions. A passing score of 75% (6 out of 8 correct) is required.',
        totalPoints: 80,
        status: 'PUBLISHED',
      },
      create: {
        id: qz.quizId,
        moduleId: qz.moduleId,
        title: qz.title,
        instructions: 'Answer all 8 questions. A passing score of 75% (6 out of 8 correct) is required.',
        totalPoints: 80,
        status: 'PUBLISHED',
      },
    });

    for (let i = 0; i < qz.questions.length; i++) {
      const q = qz.questions[i];
      await prisma.question.upsert({
        where: { id: q.id },
        update: {
          quizId: quiz.id,
          prompt: q.prompt,
          options: q.options,
          answer: { correctIndex: q.ans },
          points: 10,
          order: i + 1,
        },
        create: {
          id: q.id,
          quizId: quiz.id,
          prompt: q.prompt,
          options: q.options,
          answer: { correctIndex: q.ans },
          points: 10,
          order: i + 1,
        },
      });
    }
  }
  console.log('✅ 5 Quizzes (8 questions each) upserted.');

  // Qualifying Exam Results & Attempts for Seeded Students who reached qualifying / enrolled stage
  for (let idx = 0; idx < allSeededStudents.length; idx++) {
    const s = allSeededStudents[idx];
    if (!s.examTaken && s.stage !== 'Qualifying Exam / Track Selection') continue;

    const score = s.examTaken ? 78 + ((idx * 5) % 20) : null;

    if (s.examTaken) {
      await prisma.qualifyingExamResult.upsert({
        where: { id: `qer-${s.studentNumber}` },
        update: {
          userId: s.user.id,
          userName: s.fullName,
          userEmail: s.email,
          preferredComponent: s.component.name,
          assignedComponent: s.component.name,
          score: score || 80,
          rank: idx + 1,
          status: 'assigned-preferred',
          timestamp: new Date().toISOString(),
        },
        create: {
          id: `qer-${s.studentNumber}`,
          userId: s.user.id,
          userName: s.fullName,
          userEmail: s.email,
          preferredComponent: s.component.name,
          assignedComponent: s.component.name,
          score: score || 80,
          rank: idx + 1,
          status: 'assigned-preferred',
          timestamp: new Date().toISOString(),
        },
      });

      // Sample Submissions for Quiz 1
      await prisma.submission.upsert({
        where: { id: `sub-q1-${s.studentNumber}` },
        update: {
          score: 80,
          status: 'GRADED',
          submittedAt: new Date(Date.now() - 10 * 86400000),
          gradedAt: new Date(Date.now() - 10 * 86400000),
          content: { answers: [1, 2, 2, 2, 1, 0, 1, 0], percentage: 100, passed: true },
        },
        create: {
          id: `sub-q1-${s.studentNumber}`,
          studentId: s.profile.id,
          quizId: 'quiz-mod-001',
          score: 80,
          status: 'GRADED',
          submittedAt: new Date(Date.now() - 10 * 86400000),
          gradedAt: new Date(Date.now() - 10 * 86400000),
          content: { answers: [1, 2, 2, 2, 1, 0, 1, 0], percentage: 100, passed: true },
        },
      });
    }
  }
  console.log('✅ Qualifying exam results & sample student submissions upserted.');

  // ============================================================
  // 9. SATURDAY ATTENDANCE SESSIONS & ATTENDANCE RECORDS
  // ============================================================
  console.log('\n--- 9. Upserting Saturday Attendance Sessions & Records (For Enrolled Students) ---');
  const saturdaySessions = [
    {
      id: 'att-sess-2025-09-06',
      date: '2025-09-06',
      title: 'Saturday Training Session 1: NSTP Orientation & Citizenship Training',
    },
    {
      id: 'att-sess-2025-09-13',
      date: '2025-09-13',
      title: 'Saturday Training Session 2: Drug Prevention & Public Safety Seminar',
    },
    {
      id: 'att-sess-2025-09-20',
      date: '2025-09-20',
      title: 'Saturday Training Session 3: DRRM & Basic Life Support Hands-on Drill',
    },
    {
      id: 'att-sess-2025-09-27',
      date: '2025-09-27',
      title: 'Saturday Training Session 4: Coastal Cleanup & Mangrove Tree Parenting',
    },
  ];

  for (const sess of saturdaySessions) {
    await prisma.attendanceSession.upsert({
      where: { id: sess.id },
      update: {
        date: sess.date,
        title: sess.title,
        facilitatorId: navalFac.profile.id,
      },
      create: {
        id: sess.id,
        date: sess.date,
        title: sess.title,
        facilitatorId: navalFac.profile.id,
      },
    });

    // Attendance records for fully enrolled students in active grade book
    for (let i = 0; i < allSeededStudents.length; i++) {
      const student = allSeededStudents[i];
      if (!student.isFullyEnrolled) continue;

      const status = i % 9 === 0 ? 'late' : i % 15 === 0 ? 'absent' : 'present';
      await prisma.attendanceRecord.upsert({
        where: { id: `att-rec-${sess.id}-${student.studentNumber}` },
        update: {
          studentId: student.profile.id,
          sessionId: sess.id,
          status,
          facilitatorId: navalFac.profile.id,
        },
        create: {
          id: `att-rec-${sess.id}-${student.studentNumber}`,
          studentId: student.profile.id,
          sessionId: sess.id,
          status,
          facilitatorId: navalFac.profile.id,
        },
      });
    }
  }
  console.log('✅ Saturday Attendance Sessions and Records upserted for enrolled students.');

  // ============================================================
  // 10. OFFICIAL SEMESTER GRADES (Draft & Released for Grade Book & Reports)
  // ============================================================
  console.log('\n--- 10. Upserting Student Grades (For Enrolled Students) ---');
  let gradeIndex = 0;
  for (let i = 0; i < allSeededStudents.length; i++) {
    const s = allSeededStudents[i];
    if (!s.isFullyEnrolled) continue;

    gradeIndex++;
    const isReleased = gradeIndex <= 14; // 14 released, rest draft
    const prelim = 85 + (i % 12);
    const midterm = 87 + ((i * 2) % 11);
    const finalScore = 88 + ((i * 3) % 10);
    const percentGrade = Number(((prelim * 0.3) + (midterm * 0.3) + (finalScore * 0.4)).toFixed(1));
    const numericalGrade = percentGrade >= 95 ? 1.0 : percentGrade >= 90 ? 1.25 : percentGrade >= 85 ? 1.5 : 1.75;
    const classification = percentGrade >= 95 ? 'EXCELLENT' : percentGrade >= 90 ? 'VERY_GOOD' : 'GOOD';

    await prisma.grade.upsert({
      where: {
        id: `grd-${s.studentNumber}`,
      },
      update: {
        studentId: s.profile.id,
        componentId: s.component.id,
        schoolYear: '2025-2026',
        semester: 'FIRST',
        prelim,
        midterm,
        final: finalScore,
        percentGrade,
        numericalGrade,
        classification,
        inputType: 'PERCENT',
        inputValue: percentGrade,
        remarks: 'Passed',
        isReleased,
        releasedAt: isReleased ? new Date(Date.now() - 3 * 86400000) : null,
        releasedById: isReleased ? coordinatorProfiles['CWTS']?.id : null,
        createdById: navalFac.profile.id,
      },
      create: {
        id: `grd-${s.studentNumber}`,
        studentId: s.profile.id,
        componentId: s.component.id,
        schoolYear: '2025-2026',
        semester: 'FIRST',
        prelim,
        midterm,
        final: finalScore,
        percentGrade,
        numericalGrade,
        classification,
        inputType: 'PERCENT',
        inputValue: percentGrade,
        remarks: 'Passed',
        isReleased,
        releasedAt: isReleased ? new Date(Date.now() - 3 * 86400000) : null,
        releasedById: isReleased ? coordinatorProfiles['CWTS']?.id : null,
        createdById: navalFac.profile.id,
      },
    });
  }
  console.log(`✅ Semester Grades upserted for ${gradeIndex} enrolled students.`);

  // ============================================================
  // 11. PROFILE EXPORT TEMPLATES & AUDIT LOGS & ANNOUNCEMENTS
  // ============================================================
  console.log('\n--- 11. Upserting Templates, Audit Logs & Announcements ---');
  await prisma.profileExportTemplate.upsert({
    where: {
      templateKey_version: {
        templateKey: 'student-profile',
        version: 1,
      },
    },
    update: {
      name: 'CHED Annex A - BiPSU NSTP Official Masterlist & Profile',
      status: 'PUBLISHED',
      isActive: true,
      configuration: {
        layout: 'classic',
        pageSize: 'a4',
        orientation: 'portrait',
        republicLine: 'Republic of the Philippines',
        schoolName: 'BILIRAN PROVINCE STATE UNIVERSITY',
        certificationLine: 'ISO 9001:2015 CERTIFIED',
        officeName: 'OFFICE OF THE NATIONAL SERVICE TRAINING PROGRAM',
        formTitle: 'OFFICIAL STUDENT NSTP MASTERLIST & PROFILE',
        academicPeriod: 'Academic Year 2025-2026, First Semester',
        selectedFields: ['surname', 'firstName', 'middleName', 'studentId', 'degreeProgram', 'yearLevel', 'municipality', 'province', 'contactNumber', 'email'],
      },
    },
    create: {
      id: 'tmpl-ched-annex-a',
      templateKey: 'student-profile',
      name: 'CHED Annex A - BiPSU NSTP Official Masterlist & Profile',
      version: 1,
      status: 'PUBLISHED',
      isActive: true,
      configuration: {
        layout: 'classic',
        pageSize: 'a4',
        orientation: 'portrait',
        republicLine: 'Republic of the Philippines',
        schoolName: 'BILIRAN PROVINCE STATE UNIVERSITY',
        certificationLine: 'ISO 9001:2015 CERTIFIED',
        officeName: 'OFFICE OF THE NATIONAL SERVICE TRAINING PROGRAM',
        formTitle: 'OFFICIAL STUDENT NSTP MASTERLIST & PROFILE',
        academicPeriod: 'Academic Year 2025-2026, First Semester',
        selectedFields: ['surname', 'firstName', 'middleName', 'studentId', 'degreeProgram', 'yearLevel', 'municipality', 'province', 'contactNumber', 'email'],
      },
      createdById: directorUser.id,
      updatedById: directorUser.id,
    },
  });

  const auditEntries = [
    {
      id: 'audit-seed-001',
      actor: 'Dr. NSTP Director',
      action: 'SYSTEM_INITIALIZATION',
      detail: 'Configured AY 2025-2026 NSTP parameters and verified active components.',
    },
    {
      id: 'audit-seed-002',
      actor: 'Prof. Maria Santos (CWTS Coordinator)',
      action: 'FIELD_DEPLOYMENT_APPROVED',
      detail: 'Approved Training Groups across Naval, Almeria, and Biliran municipalities.',
    },
  ];

  for (const a of auditEntries) {
    await prisma.auditLogEntry.upsert({
      where: { id: a.id },
      update: a,
      create: a,
    });
  }

  const announcements = [
    {
      id: 'ann-seed-001',
      title: 'Welcome to BiPSU NSTP AY 2025-2026!',
      message: 'All incoming first-year students are requested to complete the 25-hour Common Modules and take the Track Qualifying Assessment.',
      audience: 'all',
      priority: 'high',
      createdBy: directorUser.id,
    },
    {
      id: 'ann-seed-002',
      title: 'Saturday Community Immersion Uniform Policy',
      message: 'Proper NSTP shirts and Biliran LGU field credentials are mandatory during all Saturday community service deployments.',
      audience: 'students',
      priority: 'normal',
      createdBy: directorUser.id,
    },
  ];

  for (const ann of announcements) {
    await prisma.announcement.upsert({
      where: { id: ann.id },
      update: {
        title: ann.title,
        message: ann.message,
        audience: ann.audience,
        priority: ann.priority,
        createdBy: ann.createdBy,
      },
      create: {
        id: ann.id,
        title: ann.title,
        message: ann.message,
        audience: ann.audience,
        priority: ann.priority,
        createdBy: ann.createdBy,
      },
    });
  }
  console.log('✅ Announcements, Audit logs & Templates upserted.');

  // ============================================================
  // 12. PROVINCES, MUNICIPALITIES & OFFICIAL BILIRAN BARANGAYS
  // ============================================================
  console.log('\n--- 12. Upserting Eastern Visayas Provinces, Biliran Municipalities & Official Barangays ---');

  const seededProvinces = [
    { code: '0807800000', name: 'Biliran' },
    { code: '0803700000', name: 'Leyte' },
    { code: '0806400000', name: 'Southern Leyte' },
    { code: '0806000000', name: 'Samar' },
    { code: '0802600000', name: 'Eastern Samar' },
    { code: '0804800000', name: 'Northern Samar' },
  ];

  for (const prov of seededProvinces) {
    await prisma.province.upsert({
      where: { code: prov.code },
      update: { name: prov.name },
      create: prov,
    });
  }

  const seededMunicipalities = [
    // 8 Biliran Municipalities
    { code: '0807801000', name: 'Almeria', provinceCode: '0807800000' },
    { code: '0807802000', name: 'Biliran', provinceCode: '0807800000' },
    { code: '0807803000', name: 'Cabucgayan', provinceCode: '0807800000' },
    { code: '0807804000', name: 'Caibiran', provinceCode: '0807800000' },
    { code: '0807805000', name: 'Culaba', provinceCode: '0807800000' },
    { code: '0807806000', name: 'Kawayan', provinceCode: '0807800000' },
    { code: '0807807000', name: 'Maripipi', provinceCode: '0807800000' },
    { code: '0807808000', name: 'Naval', provinceCode: '0807800000' },

    // Neighboring Region VIII Municipalities
    { code: '0803747000', name: 'Tacloban City', provinceCode: '0803700000' },
    { code: '0803738000', name: 'Ormoc City', provinceCode: '0803700000' },
    { code: '0803706000', name: 'Baybay City', provinceCode: '0803700000' },
    { code: '0803739000', name: 'Palo', provinceCode: '0803700000' },
    { code: '0803748000', name: 'Tanauan', provinceCode: '0803700000' },
    { code: '0803714000', name: 'Carigara', provinceCode: '0803700000' },
    { code: '0806407000', name: 'Maasin City', provinceCode: '0806400000' },
    { code: '0806416000', name: 'Sogod', provinceCode: '0806400000' },
    { code: '0806003000', name: 'Catbalogan City', provinceCode: '0806000000' },
    { code: '0806002000', name: 'Calbayog City', provinceCode: '0806000000' },
    { code: '0802605000', name: 'Borongan City', provinceCode: '0802600000' },
    { code: '0802608000', name: 'Guiuan', provinceCode: '0802600000' },
    { code: '0804805000', name: 'Catarman', provinceCode: '0804800000' },
  ];

  for (const mun of seededMunicipalities) {
    await prisma.municipality.upsert({
      where: { code: mun.code },
      update: { name: mun.name, provinceCode: mun.provinceCode },
      create: mun,
    });
  }

  // Official Barangays for all 8 Biliran Municipalities
  const biliranBarangays = {
    // Almeria (13)
    '0807801000': [
      'Caucab', 'Iyusan', 'Jamorawon', 'Lo-ok', 'Matanga', 'Pili',
      'Poblacion', 'Pulangbato', 'Salangi', 'Sampao', 'Tabunan',
      'Talahid', 'Tamarindo',
    ],
    // Biliran (11)
    '0807802000': [
      'Bato', 'Burabod', 'Busali', 'Hugpa', 'Julita', 'Canila',
      'Pinangomhan', 'San Isidro', 'San Roque', 'Sanggalang', 'Villa Enage',
    ],
    // Cabucgayan (13)
    '0807803000': [
      'Balaquid', 'Baso', 'Bunga', 'Caanibongan', 'Casiawan', 'Esperanza',
      'Langgao', 'Libertad', 'Looc', 'Magbangon', 'Pawikan', 'Salawad', 'Talibong',
    ],
    // Caibiran (17)
    '0807804000': [
      'Alegria', 'Asug', 'Bari-is', 'Binohangan', 'Cabibihan', 'Kawayanon',
      'Looc', 'Manlabang', 'Caulangohan', 'Maurang', 'Palanay', 'Palengke',
      'Tomalistis', 'Union', 'Uson', 'Victory', 'Villa Vicenta',
    ],
    // Culaba (17)
    '0807805000': [
      'Acaban', 'Bacolod', 'Binongtoan', 'Bool Central', 'Bool East', 'Bool West',
      'Calipayan', 'Guindapunan', 'Habuhab', 'Looc', 'Marvel', 'Patag',
      'Pinamihagan', 'Culaba Central', 'Salvacion', 'San Roque', 'Virginia',
    ],
    // Kawayan (20)
    '0807806000': [
      'Baganito', 'Balacson', 'Bilwang', 'Bulalacao', 'Burabod', 'Inasuyan',
      'Kansanok', 'Mada-o', 'Mapuyo', 'Masagaosao', 'Masagongsong', 'Palañas',
      'Poblacion', 'San Lorenzo', 'Tabunan North', 'Tubig Guinoo', 'Tucdao',
      'Ungale', 'Villa Cornejo', 'Villa Victor',
    ],
    // Maripipi (15)
    '0807807000': [
      'Agutay', 'Banlas', 'Bato', 'Binalayan East', 'Binalayan West', 'Binongto-an',
      'Burabod', 'Calbani', 'Canduhao', 'Casibang', 'Danao', 'Ermita',
      'Ol-og', 'Trabugan', 'Viga',
    ],
    // Naval (26)
    '0807808000': [
      'Agpangi', 'Anislagan', 'Atipolo', 'Borac', 'Cabungaan', 'Calumpang',
      'Capiñahan', 'Caraycaray', 'Catmon', 'Haguikhikan', 'Imelda', 'Larrazabal',
      'Libertad', 'Libtong', 'Lico', 'Lucsoon', 'Mabini',
      'Padre Inocentes Garcia (Pob.)', 'Padre Sergio Eamiguel', 'Sabang',
      'San Pablo', 'Santo Niño', 'Santissimo Rosario Pob.', 'Smo. Rosario',
      'Talustusan', 'Villa Caneja', 'Villa Consuelo',
    ],
  };

  const seededBarangays = [];
  for (const [munCode, bNames] of Object.entries(biliranBarangays)) {
    bNames.forEach((name, index) => {
      const brgyCode = `${munCode.slice(0, 7)}${String(index + 1).padStart(3, '0')}`;
      seededBarangays.push({
        code: brgyCode,
        name,
        municipalityCode: munCode,
      });
    });
  }

  // Also include sample barangays for neighboring Leyte hub (Tacloban City)
  const taclobanBarangays = ['Barangay 1 (Poblacion)', 'Barangay 2', 'Barangay 3', 'Downtown', 'San Jose', 'Marasbaras', 'Abucay', 'Sagkahan'];
  taclobanBarangays.forEach((name, index) => {
    seededBarangays.push({
      code: `0803747${String(index + 1).padStart(3, '0')}`,
      name,
      municipalityCode: '0803747000',
    });
  });

  for (const brgy of seededBarangays) {
    await prisma.barangay.upsert({
      where: { code: brgy.code },
      update: { name: brgy.name, municipalityCode: brgy.municipalityCode },
      create: brgy,
    });
  }
  console.log(`✅ Upserted ${seededProvinces.length} provinces, ${seededMunicipalities.length} municipalities, and ${seededBarangays.length} official barangays.`);

  console.log('\n============================================================');
  console.log('🎉 COMPREHENSIVE PRISMA SEED COMPLETED SUCCESSFULLY!');
  console.log('============================================================\n');
}

runSeed()
  .catch((err) => {
    console.error('❌ Error during Prisma seed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
