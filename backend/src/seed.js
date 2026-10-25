import bcrypt from 'bcrypt';
import prisma from './db/prisma.js';
import { logger } from './utils/logger.js';

export async function seedAdmin({ prismaClient = prisma, hashPassword = bcrypt.hash } = {}) {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    logger.warn('ADMIN_EMAIL or ADMIN_PASSWORD not set. Skipping admin seeding.');
    return { created: false, reason: 'missing-configuration' };
  }

  try {
    const existing = await prismaClient.user.findUnique({ where: { email }, select: { id: true } });
    const adminName = process.env.ADMIN_NAME || 'Dr. Reynold G. Bustillo';

    if (existing) {
      logger.info(`Admin account already exists for ${email}; skipping seed.`);
      return { created: false, reason: 'already-exists' };
    }

    const passwordHash = await hashPassword(password, 10);

    await prismaClient.user.create({
      data: {
        email,
        name: adminName,
        passwordHash,
        role: 'ADMIN',
        data: {},
      },
      select: { id: true },
    });
    logger.info(`Admin account created for ${email}`);
    return { created: true };
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to seed admin account');
    throw error;
  }
}

export const QUALIFYING_EXAM_ID = 'qualifying-exam-master';

export const QUALIFYING_EXAM_QUESTIONS = [
  {
    prompt: 'What is the primary objective of the National Service Training Program?',
    options: [
      'To provide military training to all students',
      'To promote civic consciousness and defense preparedness',
      'To replace regular academic courses',
      'To provide employment after graduation',
    ],
    correctIndex: 1,
  },
  {
    prompt: 'Which government agency oversees the implementation of NSTP?',
    options: ['Department of Education', 'Commission on Higher Education', 'Department of National Defense', 'All of the above'],
    correctIndex: 3,
  },
  {
    prompt: 'What does CWTS stand for?',
    options: [
      'Community Welfare Training Service',
      'Civic Welfare Training Service',
      'Community Work Training Service',
      'Civic Work and Training Service',
    ],
    correctIndex: 1,
  },
  {
    prompt: 'How many hours of training are required for NSTP completion?',
    options: ['25 hours', '36 hours', '54 hours', '72 hours'],
    correctIndex: 2,
  },
  {
    prompt: 'Which component focuses on teaching literacy to communities?',
    options: ['CWTS', 'LTS', 'MTS', 'ROTC'],
    correctIndex: 1,
  },
  {
    prompt: 'What is a key principle of community development discussed in the seminars?',
    options: [
      'Top-down approach',
      'Participatory development',
      'Individual focus',
      'Government-only initiative',
    ],
    correctIndex: 1,
  },
  {
    prompt: 'In disaster risk reduction, what does DRRM stand for?',
    options: [
      'Disaster Response and Recovery Management',
      'Disaster Risk Reduction and Management',
      'Defense and Risk Response Mechanism',
      'Disaster Relief and Rescue Mission',
    ],
    correctIndex: 1,
  },
  {
    prompt: 'Which of the following is NOT a component of NSTP?',
    options: ['CWTS', 'LTS', 'MTS', 'JROTC'],
    correctIndex: 3,
  },
  {
    prompt: 'What is the main focus of MTS (Military Training Service)?',
    options: [
      'Community service',
      'Literacy training',
      'Military training and national defense preparation',
      'Environmental conservation',
    ],
    correctIndex: 2,
  },
  {
    prompt: 'According to the Philippine Constitution, what is emphasized regarding citizenship?',
    options: [
      'Rights only',
      'Duties only',
      'Both rights and responsibilities',
      'Neither rights nor duties',
    ],
    correctIndex: 2,
  },
];

export async function seedQualifyingExam({ prismaClient = prisma } = {}) {
  try {
    const exam = await prismaClient.exam.upsert({
      where: { id: QUALIFYING_EXAM_ID },
      update: {
        title: 'NSTP Qualifying Examination',
        instructions: 'Official qualifying examination for NSTP component allocation.',
        totalPoints: 100,
      },
      create: {
        id: QUALIFYING_EXAM_ID,
        title: 'NSTP Qualifying Examination',
        instructions: 'Official qualifying examination for NSTP component allocation.',
        totalPoints: 100,
      },
    });

    await prismaClient.question.deleteMany({ where: { examId: exam.id } });
    await prismaClient.question.createMany({
      data: QUALIFYING_EXAM_QUESTIONS.map((q, idx) => ({
        examId: exam.id,
        prompt: q.prompt,
        options: q.options,
        answer: { correctIndex: q.correctIndex },
        order: idx + 1,
        points: 10,
      })),
    });

    logger.info(`Qualifying exam seeded with ${QUALIFYING_EXAM_QUESTIONS.length} questions.`);
    return { examId: exam.id, questionCount: QUALIFYING_EXAM_QUESTIONS.length };
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to seed qualifying exam');
    throw error;
  }
}
