// utils/studentUtils.js
import prisma from "../models/prisma.js";
import { getActiveAcademicYear } from "./academicYearHelper.js";

export async function getStudentSubjects(
  studentId,
  academicYearId = null,
  tx = prisma,
) {
  const ayId = academicYearId || (await getActiveAcademicYear())?.id;
  if (!ayId) throw new Error("No active academic year found");

  // Fetch student's current enrollment
  const enrollment = await tx.studentStream.findFirst({
    where: {
      studentId,
      academicYearId: ayId,
    },
    orderBy: { createdAt: "desc" },
    include: {
      classroom: { select: { id: true, name: true } }, // ← we need classroomId
      stream: { select: { id: true } },
      academicYear: { select: { id: true, label: true } },
    },
  });

  if (!enrollment) {
    console.warn(`No active enrollment for student ${studentId}`);
    return [];
  }

  const classroomId = enrollment.classroom?.id;

  if (!classroomId) {
    console.warn(
      `Student ${studentId} has no classroom assigned in enrollment`,
    );
    return [];
  }

  // Get student's schoolId
  const student = await tx.student.findUnique({
    where: { id: studentId },
    select: { schoolId: true },
  });

  if (!student) return [];

  // 1. All CORE subjects — use classroomId instead of className
  const coreSubjects = await tx.curriculumSubject.findMany({
    where: {
      academicYearId: ayId,
      classroomId, // ← FIXED: this is the correct field now
      category: "CORE",
      schoolId: student.schoolId,
      OR: [{ streamId: enrollment.streamId }, { streamId: null }],
    },
    include: {
      subject: { select: { id: true, name: true, code: true } },
    },
  });

  // 2. Approved ELECTIVE and ACTIVITY subjects (unchanged — no className here)
  const approvedChoices = await tx.studentElectiveChoice.findMany({
    where: {
      studentId,
      academicYearId: ayId,
      status: "APPROVED",
      curriculumSubject: {
        category: { in: ["ELECTIVE", "ACTIVITY"] },
      },
    },
    include: {
      curriculumSubject: {
        include: { subject: { select: { id: true, name: true, code: true } } },
      },
    },
  });

  // Combine and format
  const allSubjects = [
    ...coreSubjects.map((cs) => ({
      id: cs.subject.id,
      name: cs.subject.name,
      code: cs.subject.code,
      category: cs.category,
      isMandatory: true,
      source: "core",
    })),
    ...approvedChoices.map((choice) => ({
      id: choice.curriculumSubject.subject.id,
      name: choice.curriculumSubject.subject.name,
      code: choice.curriculumSubject.subject.code,
      category: choice.curriculumSubject.category,
      isMandatory: false,
      source: "elective",
    })),
  ];

  // Sort: mandatory first, then alphabetically
  return allSubjects.sort((a, b) => {
    if (a.isMandatory !== b.isMandatory) return a.isMandatory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// Validate electives for a student
export async function validateElectives(
  studentId,
  curriculumSubjectIds,
  tx = prisma,
) {
  const enrollment = await tx.studentStream.findFirst({
    where: { studentId, academicYear: { isActive: true } },
    include: { classroom: true, stream: true },
  });

  if (!enrollment || !enrollment.classroom?.id) return false;

  const classroomId = enrollment.classroom.id;

  const validCount = await tx.curriculumSubject.count({
    where: {
      id: { in: curriculumSubjectIds },
      academicYearId: enrollment.academicYearId,
      classroomId, // ← FIXED
      category: { in: ["ELECTIVE", "ACTIVITY"] },
      schoolId: (await tx.student.findUnique({ where: { id: studentId } }))
        .schoolId,
      OR: [{ streamId: enrollment.streamId }, { streamId: null }],
    },
  });

  return validCount === curriculumSubjectIds.length;
}

// Validate electives for a specific enrollment
export async function validateElectivesForEnrollment(
  tx,
  enrollmentId,
  curriculumSubjectIds,
) {
  const enrollment = await tx.studentStream.findUnique({
    where: { id: enrollmentId },
    include: {
      classroom: { select: { id: true, name: true } }, // ← need id
      stream: { select: { id: true } },
      academicYear: { select: { id: true } },
    },
  });

  if (!enrollment || !enrollment.classroom?.id) {
    console.warn(`No valid classroom for enrollment ${enrollmentId}`);
    return false;
  }

  const classroomId = enrollment.classroom.id;

  const validCount = await tx.curriculumSubject.count({
    where: {
      id: { in: curriculumSubjectIds },
      academicYearId: enrollment.academicYearId,
      classroomId, // ← FIXED
      category: { in: ["ELECTIVE", "ACTIVITY"] },
      schoolId: (
        await tx.student.findUnique({ where: { id: enrollment.studentId } })
      ).schoolId,
      OR: [{ streamId: enrollment.streamId }, { streamId: null }],
    },
  });

  return validCount === curriculumSubjectIds.length;
}
