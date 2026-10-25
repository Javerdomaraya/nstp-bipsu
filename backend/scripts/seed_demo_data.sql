-- ============================================================
-- BiPSU NSTP Platform: Complete Demo Data for Every Role
-- Populates the actual data created and managed by each role:
-- 1. ADMIN: Component Application State, Export Templates, Audit Logs
-- 2. COORDINATOR: Training Groups, Pending Registration Reviews
-- 3. INSTRUCTOR / FACILITATOR: Modules, Lessons, Quizzes, Questions, Assignments, Attendance, Grades
-- 4. STUDENT: Registrations, Qualifying Exam, Module Progress, Submissions, Payments, Follows
--
-- Password for all accounts: Password123!
-- ============================================================

-- 1. Ensure NSTP Components exist
INSERT INTO "nstp_component" ("id", "type", "name", "description", "createdAt", "updatedAt") VALUES
  ('system-component-cwts', 'CWTS', 'CWTS', 'Civic Welfare Training Service', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('system-component-lts', 'LTS', 'LTS', 'Literacy Training Service', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('system-component-mts-army', 'MTS_ARMY', 'MTS (Army)', 'Military Training Service - Philippine Army', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('system-component-mts-navy', 'MTS_NAVY', 'MTS (Navy)', 'Military Training Service - Philippine Navy', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('system-component-cwts-coast-guard', 'CWTS_COAST_GUARD', 'CWTS (Coast Guard)', 'Civic Welfare Training Service - Coast Guard Auxiliary', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("type") DO UPDATE SET "name" = EXCLUDED."name", "updatedAt" = CURRENT_TIMESTAMP;

-- 2. CORE ACCOUNTS & PROFILES (Required reference entities)
-- Admin
INSERT INTO "user" ("id", "name", "email", "passwordHash", "role", "status", "data", "createdAt", "updatedAt")
VALUES (
  'user-admin-001',
  'Dr. Reynold G. Bustillo',
  'admin@bipsu.edu.ph',
  '$2b$10$wgJ4clT7wGuolcnus2zBaet9AWl79MzJMMAljmka1mxfiOFmfvbVK',
  'ADMIN',
  'ACTIVE',
  '{"title": "NSTP Director", "subtitle": "Office of the National Service Training Program", "contactNumber": "09123456789"}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "passwordHash" = EXCLUDED."passwordHash",
  "role" = 'ADMIN',
  "status" = 'ACTIVE',
  "data" = EXCLUDED."data",
  "updatedAt" = CURRENT_TIMESTAMP;

-- CWTS Coordinator: Prof. Maria Santos
INSERT INTO "user" ("id", "name", "email", "passwordHash", "role", "status", "data", "createdAt", "updatedAt")
VALUES (
  'user-coord-cwts-001',
  'Prof. Maria Santos',
  'coordinator.cwts@bipsu.edu.ph',
  '$2b$10$wgJ4clT7wGuolcnus2zBaet9AWl79MzJMMAljmka1mxfiOFmfvbVK',
  'COORDINATOR',
  'ACTIVE',
  '{"title": "CWTS Program Coordinator", "contactNumber": "09123456781", "coordinatorScope": "CWTS"}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "passwordHash" = EXCLUDED."passwordHash",
  "role" = 'COORDINATOR',
  "status" = 'ACTIVE',
  "data" = EXCLUDED."data",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "coordinator_profile" ("id", "userId", "employeeNumber", "componentId", "scope", "createdAt", "updatedAt")
SELECT
  'prof-coord-cwts-001',
  u."id",
  'EMP-CWTS-001',
  'system-component-cwts',
  'CWTS'::"CoordinatorScope",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "user" u WHERE u."email" = 'coordinator.cwts@bipsu.edu.ph'
ON CONFLICT ("userId") DO UPDATE SET
  "employeeNumber" = EXCLUDED."employeeNumber",
  "componentId" = EXCLUDED."componentId",
  "scope" = EXCLUDED."scope",
  "updatedAt" = CURRENT_TIMESTAMP;

-- MTS Coordinator: Maj. Roberto Garcia
INSERT INTO "user" ("id", "name", "email", "passwordHash", "role", "status", "data", "createdAt", "updatedAt")
VALUES (
  'user-coord-mts-001',
  'Maj. Roberto Garcia',
  'coordinator.mts@bipsu.edu.ph',
  '$2b$10$wgJ4clT7wGuolcnus2zBaet9AWl79MzJMMAljmka1mxfiOFmfvbVK',
  'COORDINATOR',
  'ACTIVE',
  '{"title": "MTS / ROTC Coordinator", "contactNumber": "09123456782", "coordinatorScope": "MTS"}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "passwordHash" = EXCLUDED."passwordHash",
  "role" = 'COORDINATOR',
  "status" = 'ACTIVE',
  "data" = EXCLUDED."data",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "coordinator_profile" ("id", "userId", "employeeNumber", "componentId", "scope", "createdAt", "updatedAt")
SELECT
  'prof-coord-mts-001',
  u."id",
  'EMP-MTS-001',
  'system-component-mts-army',
  'MTS'::"CoordinatorScope",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "user" u WHERE u."email" = 'coordinator.mts@bipsu.edu.ph'
ON CONFLICT ("userId") DO UPDATE SET
  "employeeNumber" = EXCLUDED."employeeNumber",
  "componentId" = EXCLUDED."componentId",
  "scope" = EXCLUDED."scope",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Instructor / Facilitator: Engr. Juan Dela Cruz
INSERT INTO "user" ("id", "name", "email", "passwordHash", "role", "status", "data", "createdAt", "updatedAt")
VALUES (
  'user-inst-cwts-001',
  'Engr. Juan Dela Cruz',
  'instructor.cwts@bipsu.edu.ph',
  '$2b$10$wgJ4clT7wGuolcnus2zBaet9AWl79MzJMMAljmka1mxfiOFmfvbVK',
  'INSTRUCTOR',
  'ACTIVE',
  '{"title": "CWTS Senior Facilitator", "contactNumber": "09123456783", "municipalities": ["Naval", "Almeria"], "component": "CWTS"}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "passwordHash" = EXCLUDED."passwordHash",
  "role" = 'INSTRUCTOR',
  "status" = 'ACTIVE',
  "data" = EXCLUDED."data",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "instructor_profile" ("id", "userId", "employeeNumber", "title", "department", "coordinatorId", "componentId", "municipalities", "createdAt", "updatedAt")
SELECT
  'prof-inst-cwts-001',
  u."id",
  'EMP-INST-001',
  'CWTS Senior Facilitator',
  'School of Technology and Computer Studies',
  'prof-coord-cwts-001',
  'system-component-cwts',
  ARRAY['Naval', 'Almeria']::text[],
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "user" u WHERE u."email" = 'instructor.cwts@bipsu.edu.ph'
ON CONFLICT ("userId") DO UPDATE SET
  "employeeNumber" = EXCLUDED."employeeNumber",
  "title" = EXCLUDED."title",
  "department" = EXCLUDED."department",
  "coordinatorId" = EXCLUDED."coordinatorId",
  "componentId" = EXCLUDED."componentId",
  "municipalities" = EXCLUDED."municipalities",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Class Section: CWTS Section 1A - Naval
INSERT INTO "section" ("id", "code", "name", "schoolYear", "semester", "componentId", "instructorId", "createdAt", "updatedAt")
VALUES (
  'sec-cwts-1a-001',
  'CWTS-1A',
  'CWTS Section 1A - Naval',
  '2025-2026',
  'FIRST',
  'system-component-cwts',
  'prof-inst-cwts-001',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "schoolYear" = EXCLUDED."schoolYear",
  "semester" = EXCLUDED."semester",
  "componentId" = EXCLUDED."componentId",
  "instructorId" = EXCLUDED."instructorId",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Section 2: CWTS Section 1B - Almeria Extension
INSERT INTO "section" ("id", "code", "name", "schoolYear", "semester", "componentId", "instructorId", "createdAt", "updatedAt")
VALUES (
  'sec-cwts-1b-001',
  'CWTS-1B',
  'CWTS Section 1B - Almeria Extension',
  '2025-2026',
  'FIRST',
  'system-component-cwts',
  'prof-inst-cwts-001',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "schoolYear" = EXCLUDED."schoolYear",
  "semester" = EXCLUDED."semester",
  "componentId" = EXCLUDED."componentId",
  "instructorId" = EXCLUDED."instructorId",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Student 1: Javer Domaraya
INSERT INTO "user" ("id", "name", "email", "passwordHash", "role", "status", "data", "createdAt", "updatedAt")
VALUES (
  'user-stud-cwts-001',
  'Javer Domaraya',
  'student.cwts@bipsu.edu.ph',
  '$2b$10$wgJ4clT7wGuolcnus2zBaet9AWl79MzJMMAljmka1mxfiOFmfvbVK',
  'STUDENT',
  'ACTIVE',
  '{"firstName": "Javer", "surname": "Domaraya", "studentId": "21-10042", "school": "Biliran Province State University", "department": "School of Technology and Computer Studies", "degreeProgram": "BS Information Technology", "yearLevel": "1st Year", "contactNumber": "09123456784", "municipality": "Naval", "province": "Biliran"}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "passwordHash" = EXCLUDED."passwordHash",
  "role" = 'STUDENT',
  "status" = 'ACTIVE',
  "data" = EXCLUDED."data",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "student_profile" ("id", "userId", "studentNumber", "yearLevel", "course", "sectionId", "componentId", "data", "createdAt", "updatedAt")
SELECT
  'prof-stud-cwts-001',
  u."id",
  '21-10042',
  '1st Year',
  'BS Information Technology',
  'sec-cwts-1a-001',
  'system-component-cwts',
  '{"studentId": "21-10042", "degreeProgram": "BS Information Technology", "municipality": "Naval", "province": "Biliran"}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "user" u WHERE u."email" = 'student.cwts@bipsu.edu.ph'
ON CONFLICT ("userId") DO UPDATE SET
  "studentNumber" = EXCLUDED."studentNumber",
  "yearLevel" = EXCLUDED."yearLevel",
  "course" = EXCLUDED."course",
  "sectionId" = EXCLUDED."sectionId",
  "componentId" = EXCLUDED."componentId",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "enrollment" ("id", "studentId", "componentId", "sectionId", "status", "enrolledAt", "createdAt", "updatedAt")
VALUES (
  'enr-stud-cwts-001',
  'prof-stud-cwts-001',
  'system-component-cwts',
  'sec-cwts-1a-001',
  'ACTIVE'::"EnrollmentStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("studentId", "componentId", "sectionId") DO UPDATE SET
  "status" = 'ACTIVE'::"EnrollmentStatus",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Student 2: Althea Marie Mendoza
INSERT INTO "user" ("id", "name", "email", "passwordHash", "role", "status", "data", "createdAt", "updatedAt")
VALUES (
  'user-stud-cwts-002',
  'Althea Marie Mendoza',
  'student.althea@bipsu.edu.ph',
  '$2b$10$wgJ4clT7wGuolcnus2zBaet9AWl79MzJMMAljmka1mxfiOFmfvbVK',
  'STUDENT',
  'ACTIVE',
  '{"firstName": "Althea Marie", "surname": "Mendoza", "studentId": "21-10088", "school": "Biliran Province State University", "department": "School of Technology and Computer Studies", "degreeProgram": "BS Information Systems", "yearLevel": "1st Year", "contactNumber": "09123456785", "municipality": "Almeria", "province": "Biliran"}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "passwordHash" = EXCLUDED."passwordHash",
  "role" = 'STUDENT',
  "status" = 'ACTIVE',
  "data" = EXCLUDED."data",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "student_profile" ("id", "userId", "studentNumber", "yearLevel", "course", "sectionId", "componentId", "data", "createdAt", "updatedAt")
SELECT
  'prof-stud-cwts-002',
  u."id",
  '21-10088',
  '1st Year',
  'BS Information Systems',
  'sec-cwts-1a-001',
  'system-component-cwts',
  '{"studentId": "21-10088", "degreeProgram": "BS Information Systems", "municipality": "Almeria", "province": "Biliran"}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "user" u WHERE u."email" = 'student.althea@bipsu.edu.ph'
ON CONFLICT ("userId") DO UPDATE SET
  "studentNumber" = EXCLUDED."studentNumber",
  "yearLevel" = EXCLUDED."yearLevel",
  "course" = EXCLUDED."course",
  "sectionId" = EXCLUDED."sectionId",
  "componentId" = EXCLUDED."componentId",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "enrollment" ("id", "studentId", "componentId", "sectionId", "status", "enrolledAt", "createdAt", "updatedAt")
VALUES (
  'enr-stud-cwts-002',
  'prof-stud-cwts-002',
  'system-component-cwts',
  'sec-cwts-1a-001',
  'ACTIVE'::"EnrollmentStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("studentId", "componentId", "sectionId") DO UPDATE SET
  "status" = 'ACTIVE'::"EnrollmentStatus",
  "updatedAt" = CURRENT_TIMESTAMP;


-- ============================================================
-- PART 1: DATA CREATED BY ADMIN (Dr. Reynold G. Bustillo)
-- ============================================================

-- 1A. Component Application State (Slot limits, qualifying passing score, system open status)
INSERT INTO "component_application_state" ("id", "slotLimits", "qualifyingScore", "applicationClosed", "updatedAt")
VALUES (
  'app-state-ay-2025-2026',
  '{"CWTS": 450, "LTS": 300, "MTS (Army)": 250, "MTS (Navy)": 150, "CWTS (Coast Guard)": 100}'::jsonb,
  75,
  false,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "slotLimits" = EXCLUDED."slotLimits",
  "qualifyingScore" = EXCLUDED."qualifyingScore",
  "applicationClosed" = EXCLUDED."applicationClosed",
  "updatedAt" = CURRENT_TIMESTAMP;

-- 1B. Official Profile Export Templates (Admin configuration for CHED & BiPSU forms)
INSERT INTO "profile_export_template" ("id", "templateKey", "name", "version", "status", "isActive", "configuration", "createdById", "updatedById", "createdAt", "updatedAt")
VALUES (
  'tmpl-ched-annex-a',
  'student-profile',
  'CHED Annex A - BiPSU NSTP Official Masterlist & Profile',
  1,
  'PUBLISHED'::"TemplateStatus",
  true,
  '{"layout": "classic", "pageSize": "a4", "orientation": "portrait", "republicLine": "Republic of the Philippines", "schoolName": "BILIRAN PROVINCE STATE UNIVERSITY", "certificationLine": "ISO 9001:2015 CERTIFIED", "officeName": "OFFICE OF THE NATIONAL SERVICE TRAINING PROGRAM", "formTitle": "OFFICIAL STUDENT NSTP MASTERLIST & PROFILE", "academicPeriod": "Academic Year 2025-2026, First Semester", "selectedFields": ["surname", "firstName", "middleName", "studentId", "degreeProgram", "yearLevel", "municipality", "province", "contactNumber", "email"], "fieldOrder": ["surname", "firstName", "middleName", "studentId", "degreeProgram", "yearLevel", "municipality", "province", "contactNumber", "email"]}'::jsonb,
  'user-admin-001',
  'user-admin-001',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("templateKey", "version") DO UPDATE SET
  "name" = EXCLUDED."name",
  "status" = EXCLUDED."status",
  "isActive" = EXCLUDED."isActive",
  "configuration" = EXCLUDED."configuration",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "profile_export_template" ("id", "templateKey", "name", "version", "status", "isActive", "configuration", "createdById", "updatedById", "createdAt", "updatedAt")
VALUES (
  'tmpl-bipsu-form-1',
  'student-profile',
  'BiPSU NSTP Form 1 - Community Immersion Registration Record',
  2,
  'PUBLISHED'::"TemplateStatus",
  false,
  '{"layout": "modern", "pageSize": "a4", "orientation": "portrait", "republicLine": "Republic of the Philippines", "schoolName": "BILIRAN PROVINCE STATE UNIVERSITY", "certificationLine": "ISO 9001:2015 CERTIFIED", "officeName": "OFFICE OF THE NATIONAL SERVICE TRAINING PROGRAM", "formTitle": "NSTP COMMUNITY IMMERSION ENROLLMENT FORM", "academicPeriod": "Academic Year 2025-2026, First Semester", "selectedFields": ["surname", "firstName", "studentId", "degreeProgram", "yearLevel", "houseStreetPurok", "barangay", "municipality", "contactNumber"], "fieldOrder": ["surname", "firstName", "studentId", "degreeProgram", "yearLevel", "houseStreetPurok", "barangay", "municipality", "contactNumber"]}'::jsonb,
  'user-admin-001',
  'user-admin-001',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("templateKey", "version") DO UPDATE SET
  "name" = EXCLUDED."name",
  "status" = EXCLUDED."status",
  "isActive" = EXCLUDED."isActive",
  "configuration" = EXCLUDED."configuration",
  "updatedAt" = CURRENT_TIMESTAMP;

-- 1C. Administrative Audit Logs (Operational records created by Admin activities)
INSERT INTO "audit_log_entry" ("id", "actor", "action", "detail", "at", "createdAt")
VALUES
  ('audit-log-001', 'Dr. Reynold G. Bustillo (Admin)', 'SYSTEM_INITIALIZATION', 'Configured AY 2025-2026 NSTP parameters and verified active components.', CURRENT_TIMESTAMP - INTERVAL '30 days', CURRENT_TIMESTAMP - INTERVAL '30 days'),
  ('audit-log-002', 'Dr. Reynold G. Bustillo (Admin)', 'COMPONENT_LIMITS_UPDATED', 'Allocated component slot limits: CWTS (450), LTS (300), MTS Army (250), MTS Navy (150).', CURRENT_TIMESTAMP - INTERVAL '25 days', CURRENT_TIMESTAMP - INTERVAL '25 days'),
  ('audit-log-003', 'Dr. Reynold G. Bustillo (Admin)', 'PROFILE_TEMPLATE_PUBLISHED', 'Published CHED Annex A Masterlist Template v1 as active standard export.', CURRENT_TIMESTAMP - INTERVAL '20 days', CURRENT_TIMESTAMP - INTERVAL '20 days'),
  ('audit-log-004', 'Dr. Reynold G. Bustillo (Admin)', 'COORDINATOR_SCOPE_VERIFIED', 'Confirmed CWTS scope for Prof. Maria Santos and MTS scope for Maj. Roberto Garcia.', CURRENT_TIMESTAMP - INTERVAL '15 days', CURRENT_TIMESTAMP - INTERVAL '15 days')
ON CONFLICT ("id") DO UPDATE SET
  "action" = EXCLUDED."action",
  "detail" = EXCLUDED."detail";


-- ============================================================
-- PART 2: DATA CREATED BY COORDINATOR (Prof. Maria Santos & Maj. Roberto Garcia)
-- ============================================================

-- 2A. Training Groups (Field immersion units and facilitator assignments created by Coordinator)
INSERT INTO "training_group" ("id", "schoolYear", "semester", "component", "facilitatorName", "facilitatorId", "programHandles", "municipality", "studentCount", "maxRecommendedLoad", "sourceDocument", "createdAt")
VALUES
  (
    'tg-cwts-naval-01',
    '2025-2026',
    'FIRST',
    'CWTS',
    'Engr. Juan Dela Cruz',
    'prof-inst-cwts-001',
    '["BS Information Technology", "BS Computer Science"]'::jsonb,
    'Naval',
    42,
    50,
    'BiPSU-NSTP-CWTS-Deployment-Plan-Naval-AY2526.pdf',
    CURRENT_TIMESTAMP - INTERVAL '20 days'
  ),
  (
    'tg-cwts-almeria-01',
    '2025-2026',
    'FIRST',
    'CWTS',
    'Engr. Juan Dela Cruz',
    'prof-inst-cwts-001',
    '["BS Information Systems", "BS Civil Engineering"]'::jsonb,
    'Almeria',
    38,
    50,
    'BiPSU-NSTP-CWTS-Deployment-Plan-Almeria-AY2526.pdf',
    CURRENT_TIMESTAMP - INTERVAL '20 days'
  ),
  (
    'tg-mts-army-01',
    '2025-2026',
    'FIRST',
    'MTS (Army)',
    'Maj. Roberto Garcia',
    'prof-coord-mts-001',
    '["BS Criminology", "BS Mechanical Engineering"]'::jsonb,
    'Naval',
    45,
    60,
    'BiPSU-NSTP-MTS-Tactical-Deployment-AY2526.pdf',
    CURRENT_TIMESTAMP - INTERVAL '18 days'
  )
ON CONFLICT ("id") DO UPDATE SET
  "facilitatorName" = EXCLUDED."facilitatorName",
  "studentCount" = EXCLUDED."studentCount",
  "maxRecommendedLoad" = EXCLUDED."maxRecommendedLoad",
  "programHandles" = EXCLUDED."programHandles";

-- 2B. Pending Registration Reviews (Student applications reviewed and approved by Coordinator)
INSERT INTO "pending_registration" ("id", "studentId", "surname", "firstName", "name", "email", "school", "department", "degreeProgram", "yearLevel", "municipality", "assignedMunicipality", "province", "contactNumber", "status", "approvedById", "approvedAt", "createdAt")
VALUES
  (
    'reg-stud-001',
    '21-10042',
    'Domaraya',
    'Javer',
    'Javer Domaraya',
    'student.cwts@bipsu.edu.ph',
    'Biliran Province State University',
    'School of Technology and Computer Studies',
    'BS Information Technology',
    '1st Year',
    'Naval',
    'Naval',
    'Biliran',
    '09123456784',
    'APPROVED'::"RegistrationStatus",
    'user-coord-cwts-001',
    CURRENT_TIMESTAMP - INTERVAL '25 days',
    CURRENT_TIMESTAMP - INTERVAL '30 days'
  ),
  (
    'reg-stud-002',
    '21-10088',
    'Mendoza',
    'Althea Marie',
    'Althea Marie Mendoza',
    'student.althea@bipsu.edu.ph',
    'Biliran Province State University',
    'School of Technology and Computer Studies',
    'BS Information Systems',
    '1st Year',
    'Almeria',
    'Almeria',
    'Biliran',
    '09123456785',
    'APPROVED'::"RegistrationStatus",
    'user-coord-cwts-001',
    CURRENT_TIMESTAMP - INTERVAL '25 days',
    CURRENT_TIMESTAMP - INTERVAL '30 days'
  ),
  (
    'reg-stud-003',
    '21-10145',
    'Delos Reyes',
    'Christian Paul',
    'Christian Paul Delos Reyes',
    'christian.delosreyes@bipsu.edu.ph',
    'Biliran Province State University',
    'School of Technology and Computer Studies',
    'BS Computer Science',
    '1st Year',
    'Naval',
    'Naval',
    'Biliran',
    '09123456786',
    'PENDING'::"RegistrationStatus",
    NULL,
    NULL,
    CURRENT_TIMESTAMP - INTERVAL '5 days'
  )
ON CONFLICT ("id") DO UPDATE SET
  "status" = EXCLUDED."status",
  "approvedById" = EXCLUDED."approvedById",
  "approvedAt" = EXCLUDED."approvedAt";


-- ============================================================
-- PART 3: DATA CREATED BY INSTRUCTOR / FACILITATOR (Engr. Juan Dela Cruz)
-- ============================================================

-- 3A. Instructional Modules
INSERT INTO "module" ("id", "title", "description", "order", "hours", "isPublished", "status", "data", "componentId", "instructorId", "createdAt", "updatedAt")
VALUES
  (
    'mod-cwts-001',
    'NSTP 101: Citizenship Training & The 1987 Philippine Constitution',
    'Foundational module covering constitutional rights, duties of citizenship, patriotism, and volunteerism under R.A. 9163.',
    1,
    15,
    true,
    'PUBLISHED'::"ModuleStatus",
    '{"component": "CWTS", "courseCode": "NSTP 101", "semester": "First Semester", "schoolYear": "2025-2026", "difficulty": "Beginner", "sourceDocument": "CHED-NSTP-Citizenship-Module-Series-1.pdf", "outcomes": ["Understand the Bill of Rights under Article III of the 1987 Philippine Constitution", "Demonstrate civic consciousness and active social participation in local Biliran governance", "Explain the core tenets of the Flag and Heraldic Code of the Philippines (R.A. 8491)"], "speaker": "Engr. Juan Dela Cruz", "speakerPosition": "CWTS Senior Facilitator"}'::jsonb,
    'system-component-cwts',
    'prof-inst-cwts-001',
    CURRENT_TIMESTAMP - INTERVAL '28 days',
    CURRENT_TIMESTAMP
  ),
  (
    'mod-cwts-002',
    'Disaster Risk Reduction and Management (DRRM) & Basic Life Support',
    'Practical field module on community vulnerability assessment, hazard mitigation, basic first aid, and emergency evacuation protocols.',
    2,
    20,
    true,
    'PUBLISHED'::"ModuleStatus",
    '{"component": "CWTS", "courseCode": "NSTP 101", "semester": "First Semester", "schoolYear": "2025-2026", "difficulty": "Intermediate", "sourceDocument": "NDRRMC-Community-Disaster-Preparedness-Guide.pdf", "outcomes": ["Execute standard first aid, CPR, and pressure bandaging techniques", "Formulate barangay-level hazard maps identifying typhoon and landslide risk zones", "Coordinate with Biliran PDRRMO protocols for municipal emergency responses"], "speaker": "Engr. Juan Dela Cruz", "speakerPosition": "CWTS Senior Facilitator"}'::jsonb,
    'system-component-cwts',
    'prof-inst-cwts-001',
    CURRENT_TIMESTAMP - INTERVAL '20 days',
    CURRENT_TIMESTAMP
  ),
  (
    'mod-cwts-003',
    'Community Needs Assessment & Immersion Project Proposal',
    'Field immersion preparation focusing on Participatory Rural Appraisal (PRA) and drafting actionable community initiatives in Biliran.',
    3,
    25,
    true,
    'PUBLISHED'::"ModuleStatus",
    '{"component": "CWTS", "courseCode": "NSTP 101", "semester": "First Semester", "schoolYear": "2025-2026", "difficulty": "Advanced", "sourceDocument": "BiPSU-Community-Engagement-Immersion-Framework.pdf", "outcomes": ["Conduct community surveys and focus group interviews with barangay residents", "Draft sustainable community health, literacy, and environmental outreach proposals", "Present immersion project milestones to the BiPSU NSTP Directorate"], "speaker": "Engr. Juan Dela Cruz", "speakerPosition": "CWTS Senior Facilitator"}'::jsonb,
    'system-component-cwts',
    'prof-inst-cwts-001',
    CURRENT_TIMESTAMP - INTERVAL '10 days',
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("id") DO UPDATE SET
  "title" = EXCLUDED."title",
  "description" = EXCLUDED."description",
  "order" = EXCLUDED."order",
  "hours" = EXCLUDED."hours",
  "isPublished" = EXCLUDED."isPublished",
  "status" = EXCLUDED."status",
  "data" = EXCLUDED."data",
  "updatedAt" = CURRENT_TIMESTAMP;

-- 3B. Lessons within Modules
INSERT INTO "lesson" ("id", "moduleId", "title", "content", "order", "createdAt", "updatedAt")
VALUES
  ('les-001', 'mod-cwts-001', 'The 1987 Philippine Constitution: Preamble & Bill of Rights', 'Detailed study of civil liberties, social justice, and constitutional obligations of Filipino citizens under Article III.', 1, CURRENT_TIMESTAMP - INTERVAL '28 days', CURRENT_TIMESTAMP),
  ('les-002', 'mod-cwts-001', 'Republic Act 8491: Flag and Heraldic Code of the Philippines', 'Rules on the reverence, proper hoisting, half-mast protocols, and national anthem decorum.', 2, CURRENT_TIMESTAMP - INTERVAL '28 days', CURRENT_TIMESTAMP),
  ('les-003', 'mod-cwts-001', 'Civic Duty & Youth Voter Education in Biliran Communities', 'Empowering youth participation in local governance, barangay assemblies, and transparent public service.', 3, CURRENT_TIMESTAMP - INTERVAL '28 days', CURRENT_TIMESTAMP),
  ('les-004', 'mod-cwts-002', 'Community Disaster Preparedness & R.A. 10121 Framework', 'Understanding the four thematic pillars: Prevention & Mitigation, Preparedness, Response, and Rehabilitation.', 1, CURRENT_TIMESTAMP - INTERVAL '20 days', CURRENT_TIMESTAMP),
  ('les-005', 'mod-cwts-002', 'Hands-on Basic Life Support (BLS) & Emergency First Aid', 'Standard CPR procedures, choking relief (Heimlich Maneuver), and emergency splinting for disaster casualties.', 2, CURRENT_TIMESTAMP - INTERVAL '20 days', CURRENT_TIMESTAMP),
  ('les-006', 'mod-cwts-003', 'Participatory Rural Appraisal (PRA) & Community Profiling', 'Field research tools for identifying priority health, environmental, and literacy needs in rural barangays.', 1, CURRENT_TIMESTAMP - INTERVAL '10 days', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "title" = EXCLUDED."title",
  "content" = EXCLUDED."content",
  "order" = EXCLUDED."order",
  "updatedAt" = CURRENT_TIMESTAMP;

-- 3C. Assessments: Quizzes, Questions, and Assignments
INSERT INTO "quiz" ("id", "moduleId", "title", "instructions", "totalPoints", "status", "data", "createdAt", "updatedAt")
VALUES
  (
    'quiz-cwts-001',
    'mod-cwts-001',
    'Citizenship Training & Bill of Rights Diagnostic Quiz',
    'Answer all 5 multiple choice questions within 15 minutes. A passing score of 70% is required.',
    20,
    'PUBLISHED'::"AssessmentStatus",
    '{"type": "quiz", "timeLimit": 15, "passingScore": 70, "questionsToShow": 5, "ownerId": "user-inst-cwts-001", "ownerName": "Engr. Juan Dela Cruz", "ownerRole": "facilitator"}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '25 days',
    CURRENT_TIMESTAMP
  ),
  (
    'quiz-cwts-002',
    'mod-cwts-002',
    'Disaster Preparedness & Emergency First Aid Assessment',
    'Demonstrate theoretical and operational knowledge of disaster response, triage, and basic life support.',
    20,
    'PUBLISHED'::"AssessmentStatus",
    '{"type": "quiz", "timeLimit": 20, "passingScore": 75, "questionsToShow": 5, "ownerId": "user-inst-cwts-001", "ownerName": "Engr. Juan Dela Cruz", "ownerRole": "facilitator"}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '18 days',
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("id") DO UPDATE SET
  "title" = EXCLUDED."title",
  "instructions" = EXCLUDED."instructions",
  "totalPoints" = EXCLUDED."totalPoints",
  "status" = EXCLUDED."status",
  "data" = EXCLUDED."data",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Questions for Quiz 1
INSERT INTO "question" ("id", "quizId", "prompt", "options", "answer", "points", "order", "createdAt", "updatedAt")
VALUES
  ('q-001', 'quiz-cwts-001', 'Under Republic Act 9163, what is the primary goal of the National Service Training Program?', '["To promote military conscription alone", "To enhance civic consciousness and defense preparedness in the youth", "To replace academic collegiate subjects", "To manage university internal security"]'::jsonb, '{"correctIndex": 1}'::jsonb, 4, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('q-002', 'quiz-cwts-001', 'Which article of the 1987 Philippine Constitution contains the fundamental Bill of Rights?', '["Article I", "Article II", "Article III", "Article IV"]'::jsonb, '{"correctIndex": 2}'::jsonb, 4, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('q-003', 'quiz-cwts-001', 'What law mandates the proper display and respect for the National Flag and Anthem?', '["R.A. 8491", "R.A. 9163", "R.A. 10121", "R.A. 7077"]'::jsonb, '{"correctIndex": 0}'::jsonb, 4, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('q-004', 'quiz-cwts-001', 'Which NSTP component focuses on literacy and reading comprehension for out-of-school children?', '["ROTC", "CWTS", "LTS", "MTS"]'::jsonb, '{"correctIndex": 2}'::jsonb, 4, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('q-005', 'quiz-cwts-001', 'In what year was the National Service Training Program Act enacted into law?', '["1998", "2001", "2005", "2010"]'::jsonb, '{"correctIndex": 1}'::jsonb, 4, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "prompt" = EXCLUDED."prompt",
  "options" = EXCLUDED."options",
  "answer" = EXCLUDED."answer";

-- Questions for Quiz 2
INSERT INTO "question" ("id", "quizId", "prompt", "options", "answer", "points", "order", "createdAt", "updatedAt")
VALUES
  ('q-006', 'quiz-cwts-002', 'What is the first step in the Chain of Survival during sudden cardiac arrest?', '["Early CPR", "Early defibrillation", "Immediate recognition and activation of emergency response", "Post-cardiac arrest care"]'::jsonb, '{"correctIndex": 2}'::jsonb, 4, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('q-007', 'quiz-cwts-002', 'What is the primary law governing Disaster Risk Reduction and Management in the Philippines?', '["R.A. 10121", "R.A. 9163", "R.A. 7160", "R.A. 8749"]'::jsonb, '{"correctIndex": 0}'::jsonb, 4, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('q-008', 'quiz-cwts-002', 'What is the recommended chest compression rate per minute for adult CPR?', '["60-80 compressions/min", "80-100 compressions/min", "100-120 compressions/min", "140-160 compressions/min"]'::jsonb, '{"correctIndex": 2}'::jsonb, 4, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('q-009', 'quiz-cwts-002', 'What does the acronym NDRRMC stand for?', '["National Disaster Risk Reduction and Management Council", "National Defense and Relief Regional Medical Corps", "Naval Disaster Rescue and Resource Management Center", "National Direct Recovery and Rehabilitation Commission"]'::jsonb, '{"correctIndex": 0}'::jsonb, 4, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('q-010', 'quiz-cwts-002', 'During a severe earthquake, which universal safety protocol must be executed immediately?', '["Run, Hide, Fight", "Duck, Cover, and Hold", "Stop, Drop, and Roll", "Evacuate instantly through elevators"]'::jsonb, '{"correctIndex": 1}'::jsonb, 4, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "prompt" = EXCLUDED."prompt",
  "options" = EXCLUDED."options",
  "answer" = EXCLUDED."answer";

-- Assignment 1: Reflection Paper
INSERT INTO "assignment" ("id", "moduleId", "title", "instructions", "dueDate", "totalPoints", "createdAt", "updatedAt")
VALUES (
  'asg-cwts-001',
  'mod-cwts-001',
  'Reflection Paper: Youth Civic Engagement in Biliran Province',
  'Write a 500-word essay detailing how college students can address municipal challenges (e.g. coastal sanitation, youth leadership) in their hometown.',
  CURRENT_TIMESTAMP + INTERVAL '14 days',
  50,
  CURRENT_TIMESTAMP - INTERVAL '24 days',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "title" = EXCLUDED."title",
  "instructions" = EXCLUDED."instructions",
  "totalPoints" = EXCLUDED."totalPoints",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Midterm Exam
INSERT INTO "exam" ("id", "moduleId", "title", "instructions", "totalPoints", "startsAt", "endsAt", "createdAt", "updatedAt")
VALUES (
  'exam-cwts-001',
  'mod-cwts-002',
  'NSTP 1 Midterm Examination: DRRM & Civic Leadership',
  'Comprehensive theoretical and situational examination on DRRM protocols, First Aid, and Filipino Citizenship.',
  100,
  CURRENT_TIMESTAMP - INTERVAL '7 days',
  CURRENT_TIMESTAMP + INTERVAL '7 days',
  CURRENT_TIMESTAMP - INTERVAL '15 days',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "title" = EXCLUDED."title",
  "instructions" = EXCLUDED."instructions",
  "totalPoints" = EXCLUDED."totalPoints",
  "updatedAt" = CURRENT_TIMESTAMP;

-- 3D. Attendance Sessions and Student Attendance Logs
INSERT INTO "attendance_session" ("id", "date", "facilitatorId", "title", "createdAt")
VALUES
  ('att-sess-001', '2025-09-06', 'prof-inst-cwts-001', 'Session 1: NSTP Orientation & Civic Consciousness Seminar', CURRENT_TIMESTAMP - INTERVAL '25 days'),
  ('att-sess-002', '2025-09-20', 'prof-inst-cwts-001', 'Session 2: Basic Life Support & Disaster Simulation Workshop', CURRENT_TIMESTAMP - INTERVAL '15 days'),
  ('att-sess-003', '2025-10-04', 'prof-inst-cwts-001', 'Session 3: Community Hazard Mapping Field Activity (Naval Coast)', CURRENT_TIMESTAMP - INTERVAL '5 days')
ON CONFLICT ("id") DO UPDATE SET
  "title" = EXCLUDED."title",
  "date" = EXCLUDED."date";

INSERT INTO "attendance_record" ("id", "studentId", "sessionId", "status", "facilitatorId", "updatedAt", "createdAt")
VALUES
  ('att-rec-001', 'prof-stud-cwts-001', 'att-sess-001', 'present', 'prof-inst-cwts-001', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('att-rec-002', 'prof-stud-cwts-001', 'att-sess-002', 'present', 'prof-inst-cwts-001', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('att-rec-003', 'prof-stud-cwts-001', 'att-sess-003', 'present', 'prof-inst-cwts-001', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('att-rec-004', 'prof-stud-cwts-002', 'att-sess-001', 'present', 'prof-inst-cwts-001', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('att-rec-005', 'prof-stud-cwts-002', 'att-sess-002', 'present', 'prof-inst-cwts-001', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('att-rec-006', 'prof-stud-cwts-002', 'att-sess-003', 'late',    'prof-inst-cwts-001', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "status" = EXCLUDED."status",
  "updatedAt" = CURRENT_TIMESTAMP;

-- 3E. Student Grade Records (Computed by Instructor, authorized & released by Coordinator)
INSERT INTO "grade" (
  "id", "studentId", "componentId", "schoolYear", "semester",
  "prelim", "midterm", "final", "percentGrade", "numericalGrade",
  "classification", "inputType", "inputValue", "remarks",
  "isReleased", "releasedAt", "releasedById", "createdById",
  "createdAt", "updatedAt"
)
VALUES
  (
    'grd-stud-cwts-001',
    'prof-stud-cwts-001',
    'system-component-cwts',
    '2025-2026',
    'FIRST'::"AcademicSemester",
    92.5, 95.0, 94.0, 94.0, 1.2,
    'EXCELLENT'::"GradeClassification",
    'PERCENT'::"GradeInputType",
    94.00,
    'Passed',
    true,
    CURRENT_TIMESTAMP - INTERVAL '2 days',
    'user-coord-cwts-001',
    'user-inst-cwts-001',
    CURRENT_TIMESTAMP - INTERVAL '10 days',
    CURRENT_TIMESTAMP
  ),
  (
    'grd-stud-cwts-002',
    'prof-stud-cwts-002',
    'system-component-cwts',
    '2025-2026',
    'FIRST'::"AcademicSemester",
    88.0, 90.0, 91.0, 89.8, 1.5,
    'VERY_GOOD'::"GradeClassification",
    'PERCENT'::"GradeInputType",
    89.80,
    'Passed',
    true,
    CURRENT_TIMESTAMP - INTERVAL '2 days',
    'user-coord-cwts-001',
    'user-inst-cwts-001',
    CURRENT_TIMESTAMP - INTERVAL '10 days',
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("id") DO UPDATE SET
  "prelim" = EXCLUDED."prelim",
  "midterm" = EXCLUDED."midterm",
  "final" = EXCLUDED."final",
  "percentGrade" = EXCLUDED."percentGrade",
  "numericalGrade" = EXCLUDED."numericalGrade",
  "classification" = EXCLUDED."classification",
  "remarks" = EXCLUDED."remarks",
  "isReleased" = EXCLUDED."isReleased",
  "updatedAt" = CURRENT_TIMESTAMP;


-- ============================================================
-- PART 4: DATA CREATED BY STUDENT (Javer Domaraya & Althea Marie Mendoza)
-- ============================================================

-- 4A. Qualifying Exam Results (Submitted by incoming students)
INSERT INTO "qualifying_exam_result" ("id", "userId", "userName", "userEmail", "preferredComponent", "assignedComponent", "score", "rank", "status", "timestamp", "createdAt")
VALUES
  (
    'qer-stud-cwts-001',
    'user-stud-cwts-001',
    'Javer Domaraya',
    'student.cwts@bipsu.edu.ph',
    'CWTS',
    'CWTS',
    88,
    14,
    'assigned-preferred',
    '2025-08-28T09:30:00Z',
    CURRENT_TIMESTAMP - INTERVAL '30 days'
  ),
  (
    'qer-stud-cwts-002',
    'user-stud-cwts-002',
    'Althea Marie Mendoza',
    'student.althea@bipsu.edu.ph',
    'CWTS',
    'CWTS',
    85,
    22,
    'assigned-preferred',
    '2025-08-28T10:15:00Z',
    CURRENT_TIMESTAMP - INTERVAL '30 days'
  )
ON CONFLICT ("id") DO UPDATE SET
  "score" = EXCLUDED."score",
  "rank" = EXCLUDED."rank",
  "assignedComponent" = EXCLUDED."assignedComponent",
  "status" = EXCLUDED."status";

-- 4B. Student Module Progress
INSERT INTO "module_progress" ("id", "studentId", "moduleId", "completedAt", "createdAt", "updatedAt")
VALUES
  ('prog-stud-001-mod-001', 'prof-stud-cwts-001', 'mod-cwts-001', CURRENT_TIMESTAMP - INTERVAL '18 days', CURRENT_TIMESTAMP - INTERVAL '25 days', CURRENT_TIMESTAMP),
  ('prog-stud-001-mod-002', 'prof-stud-cwts-001', 'mod-cwts-002', CURRENT_TIMESTAMP - INTERVAL '8 days',  CURRENT_TIMESTAMP - INTERVAL '18 days', CURRENT_TIMESTAMP),
  ('prog-stud-002-mod-001', 'prof-stud-cwts-002', 'mod-cwts-001', CURRENT_TIMESTAMP - INTERVAL '16 days', CURRENT_TIMESTAMP - INTERVAL '25 days', CURRENT_TIMESTAMP)
ON CONFLICT ("studentId", "moduleId") DO UPDATE SET
  "completedAt" = EXCLUDED."completedAt",
  "updatedAt" = CURRENT_TIMESTAMP;

-- 4C. Student Submissions (Quiz submissions, assignment uploads, exam answers)
INSERT INTO "submission" ("id", "studentId", "quizId", "score", "status", "content", "submittedAt", "gradedAt", "createdAt", "updatedAt")
VALUES
  (
    'sub-quiz-001',
    'prof-stud-cwts-001',
    'quiz-cwts-001',
    20.0,
    'GRADED'::"SubmissionStatus",
    '{"answers": [1, 2, 0, 2, 1], "percentage": 100, "passed": true, "timeSpentMinutes": 11}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '22 days',
    CURRENT_TIMESTAMP - INTERVAL '22 days',
    CURRENT_TIMESTAMP - INTERVAL '22 days',
    CURRENT_TIMESTAMP
  ),
  (
    'sub-quiz-002',
    'prof-stud-cwts-001',
    'quiz-cwts-002',
    20.0,
    'GRADED'::"SubmissionStatus",
    '{"answers": [2, 0, 2, 0, 1], "percentage": 100, "passed": true, "timeSpentMinutes": 14}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '14 days',
    CURRENT_TIMESTAMP - INTERVAL '14 days',
    CURRENT_TIMESTAMP - INTERVAL '14 days',
    CURRENT_TIMESTAMP
  ),
  (
    'sub-quiz-003',
    'prof-stud-cwts-002',
    'quiz-cwts-001',
    16.0,
    'GRADED'::"SubmissionStatus",
    '{"answers": [1, 2, 0, 1, 1], "percentage": 80, "passed": true, "timeSpentMinutes": 13}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '21 days',
    CURRENT_TIMESTAMP - INTERVAL '21 days',
    CURRENT_TIMESTAMP - INTERVAL '21 days',
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("id") DO UPDATE SET
  "score" = EXCLUDED."score",
  "status" = EXCLUDED."status",
  "content" = EXCLUDED."content",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Assignment Submission (Reflection Paper uploaded by Javer Domaraya)
INSERT INTO "submission" ("id", "studentId", "assignmentId", "score", "status", "content", "submittedAt", "gradedAt", "createdAt", "updatedAt")
VALUES (
  'sub-asg-001',
  'prof-stud-cwts-001',
  'asg-cwts-001',
  48.0,
  'GRADED'::"SubmissionStatus",
  '{"fileName": "Reflection_Paper_Domaraya_Javer_IT1A.pdf", "fileSize": "342 KB", "summary": "Analysis of youth civic opportunities and coastal preservation in Naval, Biliran.", "feedback": "Outstanding analysis of localized community problems in Naval. Strong civic leadership perspective."}'::jsonb,
  CURRENT_TIMESTAMP - INTERVAL '12 days',
  CURRENT_TIMESTAMP - INTERVAL '8 days',
  CURRENT_TIMESTAMP - INTERVAL '12 days',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "score" = EXCLUDED."score",
  "status" = EXCLUDED."status",
  "content" = EXCLUDED."content",
  "updatedAt" = CURRENT_TIMESTAMP;

-- 4D. Student Fee Payment Records
INSERT INTO "payment" ("id", "userId", "targetEnrollmentId", "amount", "currency", "purpose", "idempotencyKey", "status", "providerReference", "createdAt", "updatedAt")
VALUES
  (
    'pay-stud-cwts-001',
    'user-stud-cwts-001',
    'enr-stud-cwts-001',
    150.00,
    'PHP',
    'ENROLLMENT_FEE'::"PaymentPurpose",
    'idem-pay-2025-cwts-001',
    'CONFIRMED'::"PaymentStatus",
    'GCASH-BIPSU-2025-99214',
    CURRENT_TIMESTAMP - INTERVAL '28 days',
    CURRENT_TIMESTAMP
  ),
  (
    'pay-stud-cwts-002',
    'user-stud-cwts-002',
    'enr-stud-cwts-002',
    150.00,
    'PHP',
    'ENROLLMENT_FEE'::"PaymentPurpose",
    'idem-pay-2025-cwts-002',
    'CONFIRMED'::"PaymentStatus",
    'GCASH-BIPSU-2025-99215',
    CURRENT_TIMESTAMP - INTERVAL '28 days',
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("userId", "idempotencyKey") DO UPDATE SET
  "status" = EXCLUDED."status",
  "providerReference" = EXCLUDED."providerReference",
  "updatedAt" = CURRENT_TIMESTAMP;

-- 4E. Student Follow Relationships (Student following Instructor and Coordinator)
INSERT INTO "follow" ("id", "followerId", "targetUserId", "createdAt")
VALUES
  ('fol-001', 'user-stud-cwts-001', 'user-inst-cwts-001', CURRENT_TIMESTAMP - INTERVAL '20 days'),
  ('fol-002', 'user-stud-cwts-001', 'user-coord-cwts-001', CURRENT_TIMESTAMP - INTERVAL '20 days'),
  ('fol-003', 'user-stud-cwts-002', 'user-inst-cwts-001', CURRENT_TIMESTAMP - INTERVAL '20 days')
ON CONFLICT ("followerId", "targetUserId") DO NOTHING;
