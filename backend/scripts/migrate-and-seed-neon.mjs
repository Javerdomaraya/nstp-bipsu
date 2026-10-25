import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL or DIRECT_URL environment variable is required.');
  process.exit(1);
}
const pool = new Pool({ connectionString });

async function run() {
  console.log('🚀 Applying all migrations to Neon Postgres via WebSocket...');
  const migrationsDir = path.resolve(__dirname, '../prisma/migrations');
  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const dirName of entries) {
    const sqlPath = path.join(migrationsDir, dirName, 'migration.sql');
    if (!fs.existsSync(sqlPath)) continue;
    const sql = fs.readFileSync(sqlPath, 'utf8');
    process.stdout.write(`  Applying ${dirName}... `);
    try {
      await pool.query(sql);
      console.log('✅ OK');
    } catch (err) {
      if (err.message && (err.message.includes('already exists') || err.message.includes('duplicate'))) {
        console.log('⏭️ (Already exists, skipping)');
      } else {
        console.log(`⚠️ ${err.message}`);
      }
    }
  }

  console.log('\n🌱 Seeding demo accounts for all roles...');
  const seedSqlPath = path.resolve(__dirname, 'seed_demo_roles.sql');
  const seedSql = fs.readFileSync(seedSqlPath, 'utf8');
  await pool.query(seedSql);
  console.log('✅ Demo accounts seeded successfully!\n');

  console.log('🔍 Verified Accounts in Database:');
  const users = await pool.query('SELECT name, email, role, status FROM "user" ORDER BY role ASC;');
  console.table(users.rows);

  await pool.end();
}

run().catch(async (err) => {
  console.error('Fatal error:', err);
  await pool.end();
  process.exit(1);
});
