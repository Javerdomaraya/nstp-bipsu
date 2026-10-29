import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    studentId: z.string().min(1, 'Student ID is required'),
    firstName: z.string().optional(),
    middleName: z.string().optional(),
    surname: z.string().optional(),
    school: z.string().optional(),
    department: z.string().optional(),
    degreeProgram: z.string().optional(),
    yearLevel: z.string().optional(),
    major: z.string().optional(),
    gender: z.string().optional(),
    birthdate: z.string().optional(),
    houseStreetPurok: z.string().optional(),
    barangay: z.string().optional(),
    municipality: z.string().optional(),
    province: z.string().optional(),
    contactNumber: z.string().optional(),
    currentAddress: z.string().optional(),
    provincialAddress: z.string().optional(),
    assignedMunicipality: z.string().optional(),
  }).strict(),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const loginSchema = z.object({
  body: z.object({
    identifier: z.string().optional(),
    email: z.string().optional(),
    username: z.string().optional(),
    password: z.string().min(1, 'Password is required'),
  }).refine((data) => Boolean(data.identifier || data.email || data.username), {
    message: 'Email, student ID, or identifier is required',
    path: ['identifier'],
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
    data: z.object({
      title: z.string().optional(),
      subtitle: z.string().optional(),
      contactNumber: z.string().optional(),
      generalEducationComplete: z.boolean().optional(),
      preferredComponent: z.string().optional(),
    }).strict().optional(),
  }).strict(),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const nstpBatchSchema = z.object({
  body: z.array(z.record(z.unknown())).min(1, 'Expected a non-empty array'),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const moduleFields = {
  title: z.string().trim().min(1, 'Module title is required').max(200),
  description: z.string().trim().min(1, 'Module description is required').max(10000),
  component: z.enum(['Common', 'CWTS', 'LTS', 'MTS (Army)', 'MTS (Navy)', 'CWTS (Coast Guard)']),
  hours: z.number().int().min(1).max(100),
  difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced']),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  order: z.number().int().min(0).max(10000),
  courseCode: z.string().trim().max(50).optional(),
  semester: z.string().trim().max(50).optional(),
  schoolYear: z.string().trim().max(20).optional(),
  sourceDocument: z.string().trim().max(2048).optional(),
  outcomes: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
  videoUrl: z.string().trim().max(2048).optional(),
  meetingLink: z.string().trim().max(2048).optional(),
  documentLink: z.string().trim().max(2048).optional(),
  speaker: z.string().trim().max(200).optional(),
  speakerPosition: z.string().trim().max(200).optional(),
  scheduledDate: z.string().trim().max(40).optional(),
  scheduledTime: z.string().trim().max(100).optional(),
};

export const createModuleSchema = z.object({
  body: z.object({
    ...moduleFields,
    component: moduleFields.component.default('Common'),
    difficulty: moduleFields.difficulty.default('Beginner'),
    status: z.literal('DRAFT').optional(),
    order: moduleFields.order.default(0),
  }).strict(),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const updateModuleSchema = z.object({
  body: z.object(moduleFields).partial().strict().refine((value) => Object.keys(value).length > 0, 'At least one module field is required'),
  params: z.object({ id: z.string().min(1).max(200) }),
  query: z.object({}).optional(),
});

const assessmentQuestionSchema = z.object({
  id: z.string().trim().min(1).max(200).optional(),
  prompt: z.string().trim().min(1, 'Question prompt is required').max(2000),
  options: z.array(z.string().trim().min(1).max(1000)).min(2).max(10),
  correctIndex: z.number().int().min(0),
}).strict().refine(
  (question) => question.correctIndex < question.options.length,
  { message: 'Correct answer must reference one of the supplied options', path: ['correctIndex'] },
);

const assessmentFields = {
  title: z.string().trim().min(1, 'Assessment title is required').max(200),
  description: z.string().trim().max(5000).default(''),
  moduleId: z.string().trim().min(1, 'A module is required').max(200),
  type: z.enum(['quiz', 'exam', 'seminar']).default('quiz'),
  timeLimit: z.number().int().min(1).max(480).default(15),
  passingScore: z.number().int().min(0).max(100).default(70),
  questionsToShow: z.number().int().min(0).max(500).default(0),
  questions: z.array(assessmentQuestionSchema).max(500).default([]),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
};

export const createAssessmentSchema = z.object({
  body: z.object({
    ...assessmentFields,
    ownerId: z.string().trim().min(1).max(200).optional(),
    status: z.literal('DRAFT').optional(),
  }).strict(),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const updateAssessmentSchema = z.object({
  body: z.object({
    title: assessmentFields.title.optional(),
    description: z.string().trim().max(5000).optional(),
    moduleId: assessmentFields.moduleId.optional(),
    type: z.enum(['quiz', 'exam', 'seminar']).optional(),
    timeLimit: z.number().int().min(1).max(480).optional(),
    passingScore: z.number().int().min(0).max(100).optional(),
    questionsToShow: z.number().int().min(0).max(500).optional(),
    questions: z.array(assessmentQuestionSchema).max(500).optional(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
    ownerId: z.string().trim().min(1).max(200).optional(),
  }).strict().refine((value) => Object.keys(value).length > 0, 'At least one assessment field is required'),
  params: z.object({ id: z.string().min(1).max(200) }),
  query: z.object({}).optional(),
});

export const submitAssessmentSchema = z.object({
  body: z.object({
    answers: z.array(z.object({
      questionId: z.string().min(1).max(200),
      optionIndex: z.number().int().min(-1).max(9),
    }).strict()).min(1).max(500),
  }).strict().refine(
    (body) => new Set(body.answers.map((a) => a.questionId)).size === body.answers.length,
    { message: 'Duplicate question answers are not allowed', path: ['answers'] },
  ),
  params: z.object({ assessmentId: z.string().min(1).max(200) }),
  query: z.object({}).optional(),
});

export const startQualifyingExamSchema = z.object({
  body: z.object({
    preferredComponent: z.string().trim().min(1, 'Preferred component is required').max(100),
  }).strict(),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const submitQualifyingExamSchema = z.object({
  body: z.object({
    attemptId: z.string().trim().min(1, 'Attempt ID is required').max(200),
    preferredComponent: z.string().trim().min(1, 'Preferred component is required').max(100),
    answers: z.array(z.object({
      questionId: z.string().trim().min(1).max(200),
      optionIndex: z.number().int().min(0).max(20),
    }).strict()).min(1).max(500),
  }).strict().refine(
    (body) => new Set(body.answers.map((a) => a.questionId)).size === body.answers.length,
    { message: 'Duplicate question answers are not allowed', path: ['answers'] },
  ),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const overrideAssessmentAttemptSchema = z.object({
  body: z.object({
    status: z.enum(['passed', 'failed', 'review']),
    reason: z.string().trim().min(3, 'An override reason is required').max(1000),
  }).strict(),
  params: z.object({ id: z.string().min(1).max(200) }),
  query: z.object({}).optional(),
});

export const createFollowSchema = z.object({
  body: z.object({
    targetUserId: z.string().min(1, 'Target user is required'),
  }).strict(),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const createPaymentSchema = z.object({
  body: z.object({
    amount: z.number().finite().positive().max(100000, 'Amount exceeds the allowed limit'),
    currency: z.literal('PHP'),
    purpose: z.literal('ENROLLMENT_FEE'),
    targetEnrollmentId: z.string().min(1, 'Target enrollment is required'),
  }).strict(),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const voidQualifyingExamAttemptSchema = z.object({
  body: z.object({
    reason: z.string().trim().min(1, 'Reason is required for voiding an exam attempt.').max(1000),
    unplace: z.boolean().optional().default(false),
  }),
  params: z.object({
    id: z.string().trim().min(1, 'Attempt ID is required').max(200),
  }),
  query: z.object({}).optional(),
});
