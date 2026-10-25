#!/usr/bin/env node
import 'dotenv/config';
import prisma from '../src/db/prisma.js';
import { seedQualifyingExam } from '../src/seed.js';

try {
  const result = await seedQualifyingExam({ prismaClient: prisma });
  console.log(`Seeded qualifying exam successfully: ${result.examId} (${result.questionCount} questions)`);
} catch (error) {
  console.error('Failed to seed qualifying exam:', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
