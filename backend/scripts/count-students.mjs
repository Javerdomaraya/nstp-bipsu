import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });

async function main() {
  const users = await pool.query('SELECT id, name, email, role, status FROM "user" WHERE role = \'STUDENT\' ORDER BY name ASC;');
  const profiles = await pool.query('SELECT sp.id, sp."studentNumber", sp.course, sp."yearLevel", u.name, u.email FROM "student_profile" sp JOIN "user" u ON sp."userId" = u.id;');
  const pending = await pool.query('SELECT id, name, email, status, "degreeProgram" FROM "pending_registration" ORDER BY name ASC;');

  console.log('\n=== REGISTERED STUDENT USERS ===');
  console.log('Total Student Accounts:', users.rowCount);
  console.table(users.rows);

  console.log('\n=== OFFICIAL ENROLLED STUDENT PROFILES ===');
  console.log('Total Enrolled Profiles:', profiles.rowCount);
  console.table(profiles.rows);

  console.log('\n=== PENDING / APPLICANT REGISTRATIONS ===');
  console.log('Total Applicant Registrations:', pending.rowCount);
  console.table(pending.rows);

  await pool.end();
}

main().catch(console.error);
