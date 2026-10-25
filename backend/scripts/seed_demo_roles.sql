-- ============================================================
-- BiPSU NSTP Platform: Demo Roles Seeding Script
-- Password for all accounts: Password123!
-- ============================================================

-- 1. Ensure NSTP Components exist
INSERT INTO "nstp_component" ("id", "type", "name", "createdAt", "updatedAt") VALUES
  ('system-component-cwts', 'CWTS', 'CWTS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('system-component-lts', 'LTS', 'LTS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('system-component-mts-army', 'MTS_ARMY', 'MTS (Army)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('system-component-mts-navy', 'MTS_NAVY', 'MTS (Navy)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('system-component-cwts-coast-guard', 'CWTS_COAST_GUARD', 'CWTS (Coast Guard)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("type") DO UPDATE SET "name" = EXCLUDED."name", "updatedAt" = CURRENT_TIMESTAMP;

-- 2. ADMIN: Dr. Reynold G. Bustillo
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

-- 3. COORDINATOR 1 (CWTS): Prof. Maria Santos
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

-- 4. COORDINATOR 2 (MTS / ROTC): Maj. Roberto Garcia
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

-- 5. INSTRUCTOR: Engr. Juan Dela Cruz (CWTS Facilitator under Prof. Maria Santos)
INSERT INTO "user" ("id", "name", "email", "passwordHash", "role", "status", "data", "createdAt", "updatedAt")
VALUES (
  'user-inst-cwts-001',
  'Engr. Juan Dela Cruz',
  'instructor.cwts@bipsu.edu.ph',
  '$2b$10$wgJ4clT7wGuolcnus2zBaet9AWl79MzJMMAljmka1mxfiOFmfvbVK',
  'INSTRUCTOR',
  'ACTIVE',
  '{"title": "CWTS Instructor", "contactNumber": "09123456783", "municipalities": ["Naval", "Almeria"], "component": "CWTS"}'::jsonb,
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
  'CWTS Instructor',
  'School of Technology and Computer Studies',
  cp."id",
  'system-component-cwts',
  ARRAY['Naval', 'Almeria']::text[],
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "user" u
CROSS JOIN "coordinator_profile" cp
JOIN "user" cu ON cp."userId" = cu."id" AND cu."email" = 'coordinator.cwts@bipsu.edu.ph'
WHERE u."email" = 'instructor.cwts@bipsu.edu.ph'
ON CONFLICT ("userId") DO UPDATE SET
  "employeeNumber" = EXCLUDED."employeeNumber",
  "title" = EXCLUDED."title",
  "department" = EXCLUDED."department",
  "coordinatorId" = EXCLUDED."coordinatorId",
  "componentId" = EXCLUDED."componentId",
  "municipalities" = EXCLUDED."municipalities",
  "updatedAt" = CURRENT_TIMESTAMP;

-- 6. CLASS SECTION: CWTS Section 1A
INSERT INTO "section" ("id", "code", "name", "schoolYear", "semester", "componentId", "instructorId", "createdAt", "updatedAt")
SELECT
  'sec-cwts-1a-001',
  'CWTS-1A',
  'CWTS Section 1A - Naval',
  '2025-2026',
  'FIRST',
  'system-component-cwts',
  ip."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "instructor_profile" ip
JOIN "user" u ON ip."userId" = u."id" AND u."email" = 'instructor.cwts@bipsu.edu.ph'
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "schoolYear" = EXCLUDED."schoolYear",
  "semester" = EXCLUDED."semester",
  "componentId" = EXCLUDED."componentId",
  "instructorId" = EXCLUDED."instructorId",
  "updatedAt" = CURRENT_TIMESTAMP;

-- 7. STUDENT: Javer Domaraya
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
  '{"studentId": "21-10042", "degreeProgram": "BS Information Technology"}'::jsonb,
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

-- 8. ACTIVE ENROLLMENT
INSERT INTO "enrollment" ("id", "studentId", "componentId", "sectionId", "status", "enrolledAt", "createdAt", "updatedAt")
SELECT
  'enr-stud-cwts-001',
  sp."id",
  'system-component-cwts',
  'sec-cwts-1a-001',
  'ACTIVE'::"EnrollmentStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "student_profile" sp
JOIN "user" u ON sp."userId" = u."id" AND u."email" = 'student.cwts@bipsu.edu.ph'
ON CONFLICT ("studentId", "componentId", "sectionId") DO UPDATE SET
  "status" = 'ACTIVE'::"EnrollmentStatus",
  "updatedAt" = CURRENT_TIMESTAMP;
