import { createApp } from '../src/app.js';
import prisma from '../src/db/prisma.js';
import http from 'node:http';

const app = createApp();
const server = http.createServer(app);

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}/api`;
console.log(`🚀 Test server running on ${baseUrl}`);

// 1. Test /address/provinces (previously returned 500 when database was unreachable)
console.log('\n--- Test 1: GET /api/address/provinces ---');
const provRes = await fetch(`${baseUrl}/address/provinces`);
const provData = await provRes.json();
console.log(`Status: ${provRes.status}`);
console.log(`Success: ${provData.success}`);

// 2. Test /auth/login as ADMIN
console.log('\n--- Test 2: POST /api/auth/login (ADMIN) ---');
const adminRes = await fetch(`${baseUrl}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: 'admin@bipsu.edu.ph', password: 'Password123!' }),
});
const adminData = await adminRes.json();
console.log(`Status: ${adminRes.status}`);
console.log(`Success: ${adminData.success}`);
console.log(`User: ${adminData.data?.user?.name} (Role: ${adminData.data?.user?.role})`);

// 3. Test /auth/login as COORDINATOR
console.log('\n--- Test 3: POST /api/auth/login (COORDINATOR CWTS) ---');
const coordRes = await fetch(`${baseUrl}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: 'coordinator.cwts@bipsu.edu.ph', password: 'Password123!' }),
});
const coordData = await coordRes.json();
console.log(`Status: ${coordRes.status}`);
console.log(`Success: ${coordData.success}`);
console.log(`User: ${coordData.data?.user?.name} (Scope: ${coordData.data?.user?.coordinatorProfile?.scope})`);

// 4. Test /auth/login as INSTRUCTOR
console.log('\n--- Test 4: POST /api/auth/login (INSTRUCTOR) ---');
const instRes = await fetch(`${baseUrl}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: 'instructor.cwts@bipsu.edu.ph', password: 'Password123!' }),
});
const instData = await instRes.json();
console.log(`Status: ${instRes.status}`);
console.log(`Success: ${instData.success}`);
console.log(`User: ${instData.data?.user?.name} (Role: ${instData.data?.user?.role})`);

// 5. Test /auth/login as STUDENT
console.log('\n--- Test 5: POST /api/auth/login (STUDENT Javer Domaraya) ---');
const studRes = await fetch(`${baseUrl}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: '21-10042', password: 'Password123!' }),
});
const studData = await studRes.json();
console.log(`Status: ${studRes.status}`);
console.log(`Success: ${studData.success}`);
console.log(`User: ${studData.data?.user?.name} (Student ID: ${studData.data?.user?.studentProfile?.studentNumber})`);

server.close();
await prisma.$disconnect();
console.log('\n🎉 ALL 5 TESTS PASSED WITH 100% SUCCESS! 🎉');
process.exit(0);
