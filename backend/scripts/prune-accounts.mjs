import prisma from '../src/db/prisma.js';

async function main() {
  console.log('--- Starting Account Consolidation & Student Cleanup ---');

  await prisma.$transaction(async (tx) => {
    // 1. Reassign announcements from director to admin
    const directorUser = await tx.user.findUnique({ where: { email: 'director@bipsu.edu.ph' } });
    const adminUser = await tx.user.findUnique({ where: { email: 'admin@bipsu.edu.ph' } });

    if (directorUser && adminUser) {
      const reassignedAnnouncements = await tx.announcement.updateMany({
        where: { createdBy: directorUser.name },
        data: { createdBy: adminUser.name },
      });
      console.log('Reassigned announcements to admin:', reassignedAnnouncements.count);
      await tx.user.delete({ where: { id: directorUser.id } });
      console.log('Deleted duplicate director account: director@bipsu.edu.ph');
    }

    // 2. Reassign facilitators from alias coordinator to primary coordinator
    const primaryCwts = await tx.user.findUnique({
      where: { email: 'coord.cwts@bipsu.edu.ph' },
      include: { coordinatorProfile: true },
    });
    const aliasCwts = await tx.user.findUnique({
      where: { email: 'coordinator.cwts@bipsu.edu.ph' },
      include: { coordinatorProfile: true },
    });

    if (primaryCwts?.coordinatorProfile && aliasCwts?.coordinatorProfile) {
      const reassignedFacs = await tx.instructorProfile.updateMany({
        where: { coordinatorId: aliasCwts.coordinatorProfile.id },
        data: { coordinatorId: primaryCwts.coordinatorProfile.id },
      });
      console.log('Reassigned facilitators to primary CWTS coordinator:', reassignedFacs.count);
    }

    // 3. Delete alias coordinator accounts
    const aliasEmails = [
      'coordinator.cwts@bipsu.edu.ph',
      'coordinator.lts@bipsu.edu.ph',
      'coordinator.mts@bipsu.edu.ph',
    ];
    for (const email of aliasEmails) {
      const alias = await tx.user.findUnique({ where: { email }, include: { coordinatorProfile: true } });
      if (alias) {
        if (alias.coordinatorProfile) {
          await tx.coordinatorProfile.delete({ where: { id: alias.coordinatorProfile.id } });
        }
        await tx.user.delete({ where: { id: alias.id } });
        console.log('Deleted alias coordinator:', email);
      }
    }

    // 4. Gather all student users & profile IDs
    const studentUsers = await tx.user.findMany({
      where: { role: 'STUDENT' },
      select: { id: true, studentProfile: { select: { id: true } } },
    });
    const studentUserIds = studentUsers.map((u) => u.id);
    const studentProfileIds = studentUsers.map((u) => u.studentProfile?.id).filter(Boolean);

    console.log('Found student users to delete:', studentUserIds.length);

    if (studentUserIds.length > 0) {
      // 4a. Delete qualifyingExamAttempt (onDelete: Restrict)
      const deletedAttempts = await tx.qualifyingExamAttempt.deleteMany({
        where: { userId: { in: studentUserIds } },
      });
      console.log('Deleted qualifying exam attempts:', deletedAttempts.count);

      // 4b. Delete qualifyingExamResult
      const deletedResults = await tx.qualifyingExamResult.deleteMany({
        where: { userId: { in: studentUserIds } },
      });
      console.log('Deleted qualifying exam results:', deletedResults.count);

      // 4c. Delete attendance records for these students
      if (studentProfileIds.length > 0) {
        const deletedAttendance = await tx.attendanceRecord.deleteMany({
          where: { studentId: { in: studentProfileIds } },
        });
        console.log('Deleted attendance records:', deletedAttendance.count);
      }

      // 4d. Delete payments if any
      const deletedPayments = await tx.payment.deleteMany({
        where: { userId: { in: studentUserIds } },
      });
      console.log('Deleted payments:', deletedPayments.count);

      // 4e. Delete student users (cascades to studentProfile, enrollment, grade, moduleProgress, submission)
      const deletedUsers = await tx.user.deleteMany({
        where: { id: { in: studentUserIds } },
      });
      console.log('Deleted student users and cascaded profiles:', deletedUsers.count);
    }

    // 5. Clear pending registrations
    const deletedPending = await tx.pendingRegistration.deleteMany({});
    console.log('Cleared pending registrations:', deletedPending.count);
  });

  console.log('--- Account Consolidation & Pruning Completed Successfully ---');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
