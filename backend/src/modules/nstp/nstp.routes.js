import { Router } from 'express';
import profileTemplatesRouter from '../profileTemplates/profileTemplates.routes.js';
import staffRouter from '../staff/staff.routes.js';
import gradesRouter from '../grades/grades.routes.js';
import { authenticate, requireRole } from '../../middleware/authenticate.js';
import { strictWriteLimiter } from '../../middleware/rateLimit.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { rejectProhibitedCredentialFields, validateRequest } from '../../middleware/validateRequest.js';
import {
  createAssessmentSchema, createModuleSchema, nstpBatchSchema,
  overrideAssessmentAttemptSchema, submitAssessmentSchema,
  updateAssessmentSchema, updateModuleSchema,
} from '../../middleware/validationSchemas.js';
import {
  getCurrentCoordinator, getCurrentInstructor, getCurrentStudent,
  requireAssignedSection, requireStudentInAssignedSection,
} from './nstp.authorization.js';
import {
  adminAccounts, adminAttendanceRecords, adminAttendanceSessions,
  adminAuditLog, adminComponentState,
  adminPendingRegistrations, adminQualifyingResults, adminStudents, adminTrainingGroups,
  getAdminSummaryController, getMyAttendance, getMyProgress,
  getMyQualifyingResults, getMyStudentProfile, listCoordinatorClasses,
  listCoordinatorStudents, listInstructorClasses, listInstructorClassStudents,
  listCoordinatorTrainingGroupsController,
  completeMyModule, submitMyAssessment,
  listAdminModules, createAdminModule, updateAdminModule, removeAdminModule,
  listCoordinatorModules, createCoordinatorModule, updateCoordinatorModule, removeCoordinatorModule,
  listStudentModules, listInstructorModules,
  listAdminAssessments, createAdminAssessment, updateAdminAssessment, removeAdminAssessment,
  listCoordinatorAssessments, createCoordinatorAssessment, updateCoordinatorAssessment, removeCoordinatorAssessment,
  listInstructorAssessments, createInstructorAssessment, updateInstructorAssessment, removeInstructorAssessment,
  listMyAssessments, listAdminAssessmentAttempts, overrideAdminAssessmentAttempt,
} from './nstp.controller.js';

const router = Router();
router.use('/', staffRouter);
router.use('/', gradesRouter);
router.use('/admin/profile-templates', profileTemplatesRouter);
const admin = [authenticate, requireRole('ADMIN')];

function adminResource(path, handlers) {
  router.get(`/admin/${path}`, ...admin, asyncHandler(handlers.list));
  router.post(`/admin/${path}`, ...admin, strictWriteLimiter, rejectProhibitedCredentialFields, asyncHandler(handlers.upsert));
  router.post(`/admin/${path}/batch`, ...admin, strictWriteLimiter, rejectProhibitedCredentialFields, validateRequest(nstpBatchSchema), asyncHandler(handlers.batch));
  router.delete(`/admin/${path}/:id`, ...admin, strictWriteLimiter, asyncHandler(handlers.remove));
}

// Administrative resources are intentionally explicit: clients cannot select a
// model/collection through a URL parameter.
adminResource('accounts', adminAccounts);
adminResource('students', adminStudents);
router.get('/admin/modules', ...admin, asyncHandler(listAdminModules));
router.post('/admin/modules', ...admin, strictWriteLimiter, validateRequest(createModuleSchema), asyncHandler(createAdminModule));
router.patch('/admin/modules/:id', ...admin, strictWriteLimiter, validateRequest(updateModuleSchema), asyncHandler(updateAdminModule));
router.delete('/admin/modules/:id', ...admin, strictWriteLimiter, asyncHandler(removeAdminModule));
router.get('/admin/assessments', ...admin, asyncHandler(listAdminAssessments));
router.post('/admin/assessments', ...admin, strictWriteLimiter, validateRequest(createAssessmentSchema), asyncHandler(createAdminAssessment));
router.patch('/admin/assessments/:id', ...admin, strictWriteLimiter, validateRequest(updateAssessmentSchema), asyncHandler(updateAdminAssessment));
router.delete('/admin/assessments/:id', ...admin, strictWriteLimiter, asyncHandler(removeAdminAssessment));
router.get('/admin/assessment-attempts', ...admin, asyncHandler(listAdminAssessmentAttempts));
router.post('/admin/assessment-attempts/:id/override', ...admin, strictWriteLimiter, validateRequest(overrideAssessmentAttemptSchema), asyncHandler(overrideAdminAssessmentAttempt));
adminResource('pending-registrations', adminPendingRegistrations);
adminResource('training-groups', adminTrainingGroups);
adminResource('attendance-records', adminAttendanceRecords);
adminResource('attendance-sessions', adminAttendanceSessions);
adminResource('qualifying-results', adminQualifyingResults);
adminResource('component-state', adminComponentState);
adminResource('audit-log', adminAuditLog);
router.get('/admin/summary', ...admin, asyncHandler(getAdminSummaryController));

router.get('/students/me', authenticate, requireRole('STUDENT'), asyncHandler(getCurrentStudent), asyncHandler(getMyStudentProfile));
router.get('/students/me/modules', authenticate, requireRole('STUDENT'), asyncHandler(getCurrentStudent), asyncHandler(listStudentModules));
router.get('/students/me/progress', authenticate, requireRole('STUDENT'), asyncHandler(getCurrentStudent), asyncHandler(getMyProgress));
router.get('/students/me/assessments', authenticate, requireRole('STUDENT'), asyncHandler(getCurrentStudent), asyncHandler(listMyAssessments));
router.post('/students/me/modules/:moduleId/complete', authenticate, requireRole('STUDENT'), strictWriteLimiter, asyncHandler(getCurrentStudent), asyncHandler(completeMyModule));
router.post('/students/me/assessments/:assessmentId/attempts', authenticate, requireRole('STUDENT'), strictWriteLimiter, asyncHandler(getCurrentStudent), validateRequest(submitAssessmentSchema), asyncHandler(submitMyAssessment));
router.get('/students/me/attendance', authenticate, requireRole('STUDENT'), asyncHandler(getCurrentStudent), asyncHandler(getMyAttendance));
router.get('/students/me/qualifying-results', authenticate, requireRole('STUDENT'), asyncHandler(getMyQualifyingResults));

router.get('/instructors/classes', authenticate, requireRole('INSTRUCTOR'), asyncHandler(getCurrentInstructor), asyncHandler(listInstructorClasses));
router.get('/instructors/modules', authenticate, requireRole('INSTRUCTOR'), asyncHandler(getCurrentInstructor), asyncHandler(listInstructorModules));
router.get('/instructors/assessments', authenticate, requireRole('INSTRUCTOR'), asyncHandler(getCurrentInstructor), asyncHandler(listInstructorAssessments));
router.post('/instructors/assessments', authenticate, requireRole('INSTRUCTOR'), strictWriteLimiter, asyncHandler(getCurrentInstructor), validateRequest(createAssessmentSchema), asyncHandler(createInstructorAssessment));
router.patch('/instructors/assessments/:id', authenticate, requireRole('INSTRUCTOR'), strictWriteLimiter, asyncHandler(getCurrentInstructor), validateRequest(updateAssessmentSchema), asyncHandler(updateInstructorAssessment));
router.delete('/instructors/assessments/:id', authenticate, requireRole('INSTRUCTOR'), strictWriteLimiter, asyncHandler(getCurrentInstructor), asyncHandler(removeInstructorAssessment));
router.get('/instructors/classes/:classId/students', authenticate, requireRole('INSTRUCTOR'), asyncHandler(getCurrentInstructor), asyncHandler(requireAssignedSection), asyncHandler(listInstructorClassStudents));

router.get('/coordinators/component/students', authenticate, requireRole('COORDINATOR'), asyncHandler(getCurrentCoordinator), asyncHandler(listCoordinatorStudents));
router.get('/coordinators/component/classes', authenticate, requireRole('COORDINATOR'), asyncHandler(getCurrentCoordinator), asyncHandler(listCoordinatorClasses));
router.get('/coordinators/component/training-groups', authenticate, requireRole('COORDINATOR'), asyncHandler(getCurrentCoordinator), asyncHandler(listCoordinatorTrainingGroupsController));
router.get('/coordinators/modules', authenticate, requireRole('COORDINATOR'), asyncHandler(getCurrentCoordinator), asyncHandler(listCoordinatorModules));
router.get('/coordinators/assessments', authenticate, requireRole('COORDINATOR'), asyncHandler(getCurrentCoordinator), asyncHandler(listCoordinatorAssessments));
router.post('/coordinators/assessments', authenticate, requireRole('COORDINATOR'), strictWriteLimiter, asyncHandler(getCurrentCoordinator), validateRequest(createAssessmentSchema), asyncHandler(createCoordinatorAssessment));
router.patch('/coordinators/assessments/:id', authenticate, requireRole('COORDINATOR'), strictWriteLimiter, asyncHandler(getCurrentCoordinator), validateRequest(updateAssessmentSchema), asyncHandler(updateCoordinatorAssessment));
router.delete('/coordinators/assessments/:id', authenticate, requireRole('COORDINATOR'), strictWriteLimiter, asyncHandler(getCurrentCoordinator), asyncHandler(removeCoordinatorAssessment));
router.post('/coordinators/modules', authenticate, requireRole('COORDINATOR'), strictWriteLimiter, asyncHandler(getCurrentCoordinator), validateRequest(createModuleSchema), asyncHandler(createCoordinatorModule));
router.patch('/coordinators/modules/:id', authenticate, requireRole('COORDINATOR'), strictWriteLimiter, asyncHandler(getCurrentCoordinator), validateRequest(updateModuleSchema), asyncHandler(updateCoordinatorModule));
router.delete('/coordinators/modules/:id', authenticate, requireRole('COORDINATOR'), strictWriteLimiter, asyncHandler(getCurrentCoordinator), asyncHandler(removeCoordinatorModule));

export default router;
