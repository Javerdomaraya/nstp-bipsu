import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

neonConfig.webSocketConstructor = ws;

async function runSeed() {
  console.log('🚀 Seeding comprehensive demo data for every role in BiPSU NSTP Platform...\n');

  const connectionString =
    process.env.DIRECT_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL or DIRECT_URL is required in .env');
  }

  const pool = new Pool({ connectionString });

  try {
    const sqlPath = path.resolve(__dirname, 'seed_demo_data.sql');
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`SQL file not found at ${sqlPath}`);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('⏳ Executing seed_demo_data.sql...');
    await pool.query(sql);
    console.log('✅ SQL script executed successfully!\n');

    console.log('📊 Summary of Demo Data Created by Each Role:\n');

    // 1. ADMIN Data Summary
    console.log('🏛️  [ADMIN: Dr. Reynold G. Bustillo]');
    const appState = await pool.query('SELECT id, "qualifyingScore", "applicationClosed" FROM "component_application_state" LIMIT 5;');
    console.log(`  - Component Application State: ${appState.rowCount} active configuration record(s)`);
    const templates = await pool.query('SELECT name, version, status, "isActive" FROM "profile_export_template" ORDER BY version ASC;');
    console.log(`  - Official Profile Templates: ${templates.rowCount} template(s) published (e.g. ${templates.rows[0]?.name})`);
    const auditLogs = await pool.query('SELECT count(*) FROM "audit_log_entry";');
    console.log(`  - Audit Log Entries: ${auditLogs.rows[0].count} administrative operational log(s)\n`);

    // 2. COORDINATOR Data Summary
    console.log('📋 [COORDINATOR: Prof. Maria Santos & Maj. Roberto Garcia]');
    const tGroups = await pool.query('SELECT id, component, "facilitatorName", municipality, "studentCount" FROM "training_group";');
    console.log(`  - Training Groups: ${tGroups.rowCount} field deployment group(s):`);
    tGroups.rows.forEach(g => console.log(`      • [${g.component}] ${g.municipality} (${g.facilitatorName}) - ${g.studentCount} students`));
    const pendingRegs = await pool.query('SELECT name, status, "approvedById" FROM "pending_registration";');
    console.log(`  - Pending Registration Reviews: ${pendingRegs.rowCount} registration review(s) processed\n`);

    // 3. INSTRUCTOR Data Summary
    console.log('👨‍🏫 [INSTRUCTOR / FACILITATOR: Engr. Juan Dela Cruz]');
    const modules = await pool.query('SELECT id, title, hours, status FROM "module";');
    console.log(`  - Instructional Modules: ${modules.rowCount} module(s) published`);
    const lessons = await pool.query('SELECT count(*) FROM "lesson";');
    console.log(`  - Curriculum Lessons: ${lessons.rows[0].count} lesson(s) authored`);
    const quizzes = await pool.query('SELECT id, title, "totalPoints", status FROM "quiz";');
    console.log(`  - Assessments & Quizzes: ${quizzes.rowCount} assessment(s) with questions`);
    const sessions = await pool.query('SELECT title, date FROM "attendance_session" ORDER BY date ASC;');
    console.log(`  - Attendance Sessions: ${sessions.rowCount} training session(s) logged`);
    const grades = await pool.query('SELECT count(*) FROM "grade";');
    console.log(`  - Student Grades Evaluated: ${grades.rows[0].count} semester grade record(s)\n`);

    // 4. STUDENT Data Summary
    console.log('🎓 [STUDENT: Javer Domaraya & Althea Marie Mendoza]');
    const qResults = await pool.query('SELECT "userName", "preferredComponent", score, rank, status FROM "qualifying_exam_result";');
    console.log(`  - Qualifying Exam Results: ${qResults.rowCount} student result(s)`);
    const progress = await pool.query('SELECT count(*) FROM "module_progress" WHERE "completedAt" IS NOT NULL;');
    console.log(`  - Completed Modules: ${progress.rows[0].count} module completion(s) recorded`);
    const submissions = await pool.query('SELECT count(*) FROM "submission";');
    console.log(`  - Student Submissions: ${submissions.rows[0].count} submission(s) (quizzes, assignments, exams)`);
    const payments = await pool.query('SELECT count(*) FROM "payment" WHERE status = \'CONFIRMED\';');
    console.log(`  - Payments: ${payments.rows[0].count} confirmed enrollment fee payment(s)`);
    const follows = await pool.query('SELECT count(*) FROM "follow";');
    console.log(`  - Academic Follows: ${follows.rows[0].count} student follow relation(s)\n`);

    console.log('🎉 ALL ROLE-SPECIFIC DEMO DATA SUCCESSFULLY POPULATED!');
  } finally {
    await pool.end();
  }
}

runSeed().catch((err) => {
  console.error('❌ Error during demo data seeding:', err);
  process.exit(1);
});
