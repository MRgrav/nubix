// services/studentService.js
import prisma from "../models/prisma.js";
import bcrypt from "bcryptjs";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";
import { generateRollNo } from "../utils/rollNoGenerator.js";
import { generateSecurePassword } from "../controllers/authController.js";

export async function createStudentService(tx, inputData, createdById = null) {
  const {
    name,
    email,
    gender,
    dateOfBirth,
    schoolId,
    grade,
    previousSchoolName,
    previousClass,
    previousGrade,
    promotedToClass,
    totalAdmissionAmount,
    monthlyFees,
    admissionDate,
    admissionReceiptNo,
    admissionReceiptLink,
    academicYearId,
    classroomId,
    streamId,
    rollNo,
    parents = [],
    electiveCurriculumSubjectIds = [],
  } = inputData;

  // ────────────────────────────────────────────────
  // Collect all temporary passwords here
  // ────────────────────────────────────────────────
  const tempPasswords = {
    student: null,
    parents: [],
  };

  // 1. Create User (STUDENT)
  tempPasswords.student = generateSecurePassword();
  const hashedPassword = await bcrypt.hash(tempPasswords.student, 10);

  const user = await tx.user.create({
    data: {
      email: email.trim(),
      password: hashedPassword,
      role: "STUDENT",
      schoolId: Number(schoolId),
    },
  });

  // 2. Create Student profile
  const student = await tx.student.create({
    data: {
      name: name.trim(),
      email: email.trim(),
      gender,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      grade,
      previousSchoolName,
      previousClass,
      previousGrade,
      promotedToClass,
      totalAdmissionAmount: totalAdmissionAmount
        ? Number(totalAdmissionAmount)
        : null,
      monthlyFees: monthlyFees ? Number(monthlyFees) : null,
      admissionDate: admissionDate ? new Date(admissionDate) : null,
      admissionReceiptNo,
      admissionReceiptLink,
      schoolId: Number(schoolId),
      userId: user.id,
    },
  });

  let enrollment = null;

  // 3. Enroll in classroom/stream if provided
  if (classroomId) {
    let ayId = academicYearId;
    if (!ayId) {
      const active = await getActiveAcademicYear(Number(schoolId));
      if (!active) throw new Error("No active academic year found");
      ayId = active.id;
    }

    const finalRollNo =
      rollNo ||
      (await generateRollNo(tx, {
        academicYearId: ayId,
        classroomId: Number(classroomId),
        streamId: streamId ? Number(streamId) : null,
        schoolId: Number(schoolId),
      }));

    enrollment = await tx.studentStream.create({
      data: {
        studentId: student.id,
        academicYearId: ayId,
        classroomId: Number(classroomId),
        streamId: streamId ? Number(streamId) : null,
        rollNo: finalRollNo,
      },
    });

    // Update student's direct classroom reference
    await tx.student.update({
      where: { id: student.id },
      data: { classroomId: Number(classroomId) },
    });
  }

  // 4. Create/link parents
  const createdParents = [];
  for (const p of parents) {
    let parentUser = await tx.user.findUnique({
      where: { email: p.email.trim() },
    });

    let parent;
    let parentTempPassword = null;

    if (parentUser) {
      // Reuse existing parent
      parent = await tx.parent.findFirst({ where: { userId: parentUser.id } });
      if (!parent) {
        parent = await tx.parent.create({
          data: {
            type: p.type,
            name: p.name.trim(),
            email: p.email.trim(),
            phone: p.phone,
            address: p.address,
            userId: parentUser.id,
          },
        });
      }
    } else {
      // Create new parent + user
      parentTempPassword = generateSecurePassword();
      const parentHash = await bcrypt.hash(parentTempPassword, 10);

      parentUser = await tx.user.create({
        data: {
          email: p.email.trim(),
          password: parentHash,
          role: "PARENT",
          schoolId: Number(schoolId),
        },
      });

      parent = await tx.parent.create({
        data: {
          type: p.type,
          name: p.name.trim(),
          email: p.email.trim(),
          phone: p.phone,
          address: p.address,
          userId: parentUser.id,
        },
      });

      createdParents.push({
        name: p.name.trim(),
        email: p.email.trim(),
        temporaryPassword: parentTempPassword,
      });
    }

    // Link to student (upsert to avoid duplicates)
    await tx.studentParent.upsert({
      where: {
        studentId_parentId: {
          studentId: student.id,
          parentId: parent.id,
        },
      },
      update: { isPrimary: p.isPrimary || false },
      create: {
        studentId: student.id,
        parentId: parent.id,
        isPrimary: p.isPrimary || false,
      },
    });
  }

  // 5. Assign electives (if any and enrollment exists)
  if (electiveCurriculumSubjectIds.length && enrollment) {
    // Your existing validation logic here (if any)
    // Example:
    await tx.studentElectiveChoice.createMany({
      data: electiveCurriculumSubjectIds.map((subjectId) => ({
        studentId: student.id,
        academicYearId: enrollment.academicYearId,
        curriculumSubjectId: subjectId,
        status: "PENDING",
      })),
      skipDuplicates: true,
    });
  }

  // ────────────────────────────────────────────────
  // Return everything the controller needs
  // ────────────────────────────────────────────────
  return {
    student,
    user,
    enrollment,
    tempPassword: tempPasswords.student,
    createdParents: createdParents.length ? createdParents : undefined,
  };
}
