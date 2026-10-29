# BiPSU NSTP Platform — Seeded Credentials & Account Directory

All accounts in this directory are seeded directly into Neon PostgreSQL via `backend/prisma/seed.js`.

> **Global Shared Password for All Accounts:** `Password123!`

---

## 1. Administrator (Director) Accounts

| Full Name | Role | Email | Password | Scope / Title | Municipality |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Dr. NSTP Director** | `ADMIN` | `director@bipsu.edu.ph` | `Password123!` | NSTP Director | Naval (Main Campus) |
| **Dr. Reynold G. Bustillo** | `ADMIN` | `admin@bipsu.edu.ph` | `Password123!` | NSTP Director & Dean | Naval (Main Campus) |

---

## 2. Component Coordinators

| Full Name | Role | Email | Password | Track / Component Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Prof. Maria Santos** | `COORDINATOR` | `coord.cwts@bipsu.edu.ph` | `Password123!` | **CWTS** (Civic Welfare Training Service & Coast Guard) |
| **Prof. Elena Rivera** | `COORDINATOR` | `coord.lts@bipsu.edu.ph` | `Password123!` | **LTS** (Literacy Training Service) |
| **Maj. Roberto Garcia** | `COORDINATOR` | `coord.mts@bipsu.edu.ph` | `Password123!` | **MTS / ROTC** (Army & Navy Tracks) |

*Legacy aliases available: `coordinator.cwts@bipsu.edu.ph`, `coordinator.lts@bipsu.edu.ph`, `coordinator.mts@bipsu.edu.ph`*

---

## 3. Municipality Facilitators (INSTRUCTOR)

Each facilitator is assigned to their respective Biliran municipality, with an active section, `InstructorProfile`, and `TrainingGroup`.

| Municipality | Facilitator Name | Email | Password | Primary Track | Section Code | Department |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Naval** | Engr. Juan Dela Cruz | `facilitator.naval@bipsu.edu.ph` | `Password123!` | CWTS | `CWTS-NAVAL-1A` | School of Technology & Computer Studies |
| **Almeria** | Prof. Rosa Almeria | `facilitator.almeria@bipsu.edu.ph` | `Password123!` | LTS | `LTS-ALMERIA-1A` | School of Teacher Education |
| **Biliran** | Prof. Carlos Biliran | `facilitator.biliran@bipsu.edu.ph` | `Password123!` | CWTS | `CWTS-BILIRAN-1A` | School of Arts and Sciences |
| **Cabucgayan** | Prof. Danilo Cabucgayan | `facilitator.cabucgayan@bipsu.edu.ph` | `Password123!` | MTS (Army) | `MTS-CABUCGAYAN-1A` | School of Criminology & Security Studies |
| **Caibiran** | Prof. Teresa Caibiran | `facilitator.caibiran@bipsu.edu.ph` | `Password123!` | CWTS (Coast Guard) | `CWTS-CG-CAIBIRAN-1A` | School of Engineering |
| **Culaba** | Prof. Marco Culaba | `facilitator.culaba@bipsu.edu.ph` | `Password123!` | LTS | `LTS-CULABA-1A` | School of Teacher Education |
| **Kawayan** | Prof. Angela Kawayan | `facilitator.kawayan@bipsu.edu.ph` | `Password123!` | CWTS | `CWTS-KAWAYAN-1A` | School of Management & Economics |
| **Maripipi** | Prof. Roberto Maripipi | `facilitator.maripipi@bipsu.edu.ph` | `Password123!` | MTS (Navy) | `MTS-NAVY-MARIPIPI-1A` | School of Maritime Studies |

*Legacy alias available: `instructor.cwts@bipsu.edu.ph` (Engr. Juan Dela Cruz)*

---

## 4. Seeded Students (STUDENT) — 32 Accounts Across 8 Municipalities & Pipeline Stages

All student accounts have been seeded into Neon PostgreSQL with their official BiPSU Academic Schools, degree programs, automated track classification rules, and sequential pipeline progress.

> **Shared Password:** `Password123!`

| BiPSU ID | Student Name | Email | Password | BiPSU Academic School | Degree Program | Pipeline Stage | Track / Component | Municipality |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `2026-0001` | Javer Domaraya | `student.naval1@bipsu.edu.ph` | `Password123!` | School of Technology and Computer Studies (STCS) | BS in Computer Science | Common Module (In Progress) | CWTS | Naval |
| `2026-0002` | Althea Marie Mendoza | `student.naval2@bipsu.edu.ph` | `Password123!` | School of Teacher Education (STE - Naval & Biliran Campuses) | Bachelor of Elementary Education (BEEd) | Common Module (In Progress) | LTS *(Locked to LTS)* | Naval |
| `2026-0003` | Christian Paul Delos Reyes | `student.naval3@bipsu.edu.ph` | `Password123!` | School of Criminal Justice Education (SCJE) | BS in Criminology | Common Module (In Progress) | MTS (Army) *(Locked to MTS)* | Naval |
| `2026-0004` | Jessica Velasco | `student.naval4@bipsu.edu.ph` | `Password123!` | School of Engineering (SOE) | BS in Civil Engineering | Common Module (In Progress) | MTS (Navy) | Naval |
| `2026-0005` | Mark Anthony Tan | `student.almeria1@bipsu.edu.ph` | `Password123!` | School of Arts and Sciences (SAS) | Bachelor of Arts in Communication | Common Module (In Progress) | CWTS | Almeria |
| `2026-0006` | Rhea Mae Espina | `student.almeria2@bipsu.edu.ph` | `Password123!` | School of Teacher Education (STE - Naval & Biliran Campuses) | Bachelor of Secondary Education (BSEd) | Common Module (In Progress) | LTS *(Locked to LTS)* | Almeria |
| `2026-0007` | Joshua Caneja | `student.almeria3@bipsu.edu.ph` | `Password123!` | School of Criminal Justice Education (SCJE) | BS in Criminology | Qualifying Exam / Track Selection | MTS (Army) *(Locked to MTS)* | Almeria |
| `2026-0008` | Princess Diane Lim | `student.almeria4@bipsu.edu.ph` | `Password123!` | School of Business Management / Management and Entrepreneurship (SBM) | BS in Business Administration | Qualifying Exam / Track Selection | CWTS | Almeria |
| `2026-0009` | Angelo Sabitsana | `student.biliran1@bipsu.edu.ph` | `Password123!` | School of Nursing and Health Sciences (SNHS) | Bachelor of Science in Nursing | Qualifying Exam / Track Selection | CWTS | Biliran |
| `2026-0010` | Kimberly Mocorro | `student.biliran2@bipsu.edu.ph` | `Password123!` | School of Teacher Education (STE - Naval & Biliran Campuses) | Bachelor of Early Childhood Education (BECEd) | Qualifying Exam / Track Selection | LTS *(Locked to LTS)* | Biliran |
| `2026-0011` | Gabriel Chong | `student.biliran3@bipsu.edu.ph` | `Password123!` | School of Criminal Justice Education (SCJE) | BS in Criminology | Enrolled & Active in Grade Book | MTS (Navy) *(Locked to MTS)* | Biliran |
| `2026-0012` | Bea Nicole Cordeta | `student.biliran4@bipsu.edu.ph` | `Password123!` | School of Engineering (SOE) | BS in Mechanical Engineering | Enrolled & Active in Grade Book | CWTS | Biliran |
| `2026-0013` | Daniel Bernadas | `student.cabucgayan1@bipsu.edu.ph` | `Password123!` | School of Technology and Computer Studies (STCS) | BS in Information Systems | Enrolled & Active in Grade Book | CWTS | Cabucgayan |
| `2026-0014` | Patricia Gervacio | `student.cabucgayan2@bipsu.edu.ph` | `Password123!` | School of Teacher Education (STE - Naval & Biliran Campuses) | Bachelor of Special Needs Education (BSNEd) | Enrolled & Active in Grade Book | LTS *(Locked to LTS)* | Cabucgayan |
| `2026-0015` | Nathaniel Parac | `student.cabucgayan3@bipsu.edu.ph` | `Password123!` | School of Criminal Justice Education (SCJE) | BS in Criminology | Enrolled & Active in Grade Book | MTS (Army) *(Locked to MTS)* | Cabucgayan |
| `2026-0016` | Camille Joyce Morillo | `student.cabucgayan4@bipsu.edu.ph` | `Password123!` | School of Business Management / Management and Entrepreneurship (SBM) | Bachelor of Tourism Management | Enrolled & Active in Grade Book | CWTS (Coast Guard) | Cabucgayan |
| `2026-0017` | John Carlo Montes | `student.caibiran1@bipsu.edu.ph` | `Password123!` | School of Arts and Sciences (SAS) | Bachelor of Arts in Economics | Enrolled & Active in Grade Book | CWTS | Caibiran |
| `2026-0018` | Samantha Casas | `student.caibiran2@bipsu.edu.ph` | `Password123!` | School of Teacher Education (STE - Naval & Biliran Campuses) | Bachelor of Physical Education (BPEd) | Enrolled & Active in Grade Book | LTS *(Locked to LTS)* | Caibiran |
| `2026-0019` | Ethan Paul Baticados | `student.caibiran3@bipsu.edu.ph` | `Password123!` | School of Criminal Justice Education (SCJE) | BS in Criminology | Enrolled & Active in Grade Book | MTS (Army) *(Locked to MTS)* | Caibiran |
| `2026-0020` | Hannah Grace Rosales | `student.caibiran4@bipsu.edu.ph` | `Password123!` | School of Engineering (SOE) | BS in Electrical Engineering | Enrolled & Active in Grade Book | CWTS (Coast Guard) | Caibiran |
| `2026-0021` | Michael Dave Solite | `student.culaba1@bipsu.edu.ph` | `Password123!` | School of Technology and Computer Studies (STCS) | BS in Industrial Technology | Enrolled & Active in Grade Book | CWTS | Culaba |
| `2026-0022` | Alyssa Ashley Jadulco | `student.culaba2@bipsu.edu.ph` | `Password123!` | School of Teacher Education (STE - Naval & Biliran Campuses) | Bachelor of Technology and Livelihood Education (BTLEd) | Enrolled & Active in Grade Book | LTS *(Locked to LTS)* | Culaba |
| `2026-0023` | Jerome Perez | `student.culaba3@bipsu.edu.ph` | `Password123!` | School of Criminal Justice Education (SCJE) | BS in Criminology | Enrolled & Active in Grade Book | MTS (Navy) *(Locked to MTS)* | Culaba |
| `2026-0024` | Marian Joy Balondo | `student.culaba4@bipsu.edu.ph` | `Password123!` | School of Business Management / Management and Entrepreneurship (SBM) | Bachelor of Hospitality Management | Enrolled & Active in Grade Book | CWTS | Culaba |
| `2026-0025` | Kevin Ray Dacillo | `student.kawayan1@bipsu.edu.ph` | `Password123!` | School of Engineering (SOE) | BS in Computer Engineering | Enrolled & Active in Grade Book | CWTS | Kawayan |
| `2026-0026` | Clarisse Corpin | `student.kawayan2@bipsu.edu.ph` | `Password123!` | School of Teacher Education (STE - Naval & Biliran Campuses) | Bachelor of Elementary Education (BEEd) | Enrolled & Active in Grade Book | LTS *(Locked to LTS)* | Kawayan |
| `2026-0027` | Vince Ryan Verunque | `student.kawayan3@bipsu.edu.ph` | `Password123!` | School of Criminal Justice Education (SCJE) | BS in Criminology | Enrolled & Active in Grade Book | MTS (Army) *(Locked to MTS)* | Kawayan |
| `2026-0028` | Trisha Mae Baring | `student.kawayan4@bipsu.edu.ph` | `Password123!` | School of Graduate Studies | Master in Public Management | Enrolled & Active in Grade Book | CWTS (Coast Guard) | Kawayan |
| `2026-0029` | Adrian Amador | `student.maripipi1@bipsu.edu.ph` | `Password123!` | School of Nursing and Health Sciences (SNHS) | Bachelor of Science in Nursing | Enrolled & Active in Grade Book | CWTS | Maripipi |
| `2026-0030` | Stephanie Enage | `student.maripipi2@bipsu.edu.ph` | `Password123!` | School of Teacher Education (STE - Naval & Biliran Campuses) | Bachelor of Secondary Education (BSEd) | Enrolled & Active in Grade Book | LTS *(Locked to LTS)* | Maripipi |
| `2026-0031` | Francis Joseph Alvarado | `student.maripipi3@bipsu.edu.ph` | `Password123!` | School of Criminal Justice Education (SCJE) | BS in Criminology | Enrolled & Active in Grade Book | MTS (Navy) *(Locked to MTS)* | Maripipi |
| `2026-0032` | Katrina Mae Salatandre | `student.maripipi4@bipsu.edu.ph` | `Password123!` | School of Technology and Computer Studies (STCS) | BS in Computer Science | Enrolled & Active in Grade Book | MTS (Navy) | Maripipi |

*Legacy alias available: `student.cwts@bipsu.edu.ph` (`21-10042`)*

---

## 5. Pending Registration Applicants (For Verification Testing — Pipeline Stage 1)

These records populate `PendingRegistration` (`status: PENDING`) so administrators and coordinators can test real-time approval and rejection workflows. Students at this stage cannot log in until approved.

| Registration ID | BiPSU ID | Applicant Name | Email | Password | BiPSU Academic School | Degree Program | Municipality | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `reg-pending-001` | `2026-0091` | Juanito Cruz | `student.applicant1@bipsu.edu.ph` | `Password123!` | School of Criminal Justice Education (SCJE) | BS in Criminology | Naval | `PENDING` |
| `reg-pending-002` | `2026-0092` | Maria Teresa Verification | `student.applicant2@bipsu.edu.ph` | `Password123!` | School of Teacher Education (STE - Naval & Biliran Campuses) | Bachelor of Elementary Education (BEEd) | Biliran | `PENDING` |
| `reg-pending-003` | `2026-0093` | Antonio Santos | `student.applicant3@bipsu.edu.ph` | `Password123!` | School of Engineering (SOE) | BS in Civil Engineering | Maripipi | `PENDING` |

---

## 6. Seeded Platform Data Summary

- **5 Classification Tracks**: `CWTS`, `LTS`, `MTS_ARMY` (MTS Army / ROTC), `MTS_NAVY` (MTS Navy / ROTC), `CWTS_COAST_GUARD` (Auxiliary).
- **5 Published Common Modules (25 Hours Total)**:
  1. `mod-nstp-001`: Citizenship Training & RA 9163 Legal Foundations (5 hrs)
  2. `mod-nstp-002`: Drug Education & Substance Abuse Prevention - RA 9165 (5 hrs)
  3. `mod-nstp-003`: Disaster Risk Reduction and Management & Climate Change (5 hrs)
  4. `mod-nstp-004`: Environmental Protection & Coastal Resource Management (5 hrs)
  5. `mod-nstp-005`: National Security Concerns & Peace Education (5 hrs)
- **8-Item Assessments**:
  - Qualifying Exam: `exam-qualifying-001` (8 questions, 80 pts)
  - 5 Module Quizzes: `quiz-mod-001` to `quiz-mod-005` (8 questions each, 80 pts each)
- **Saturday Attendance**: 4 Saturday sessions (`2025-09-06`, `2025-09-13`, `2025-09-20`, `2025-09-27`) with full student attendance records.
- **Official Semester Grades**: 20 Released grades and 12 Draft grades with prelim, midterm, final, and CHED numerical/percentage ratings.
