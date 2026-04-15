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
    parents,
    electiveCurriculumSubjectIds = [],
  } = inputData;

  const safeName = name?.trim();
  const safeEmail = email?.trim();

  if (!safeName || !safeEmail) {
    throw new Error("Invalid student name/email");
  }

  const tempPasswords = {
    student: null,
    parents: [],
  };

  // ─────────────────────────────────────────────
  // 1️⃣ CREATE STUDENT USER
  // ─────────────────────────────────────────────

  tempPasswords.student = generateSecurePassword();
  const hashedPassword = await bcrypt.hash(tempPasswords.student, 10);

  const user = await tx.user.create({
    data: {
      email: safeEmail,
      password: hashedPassword,
      role: "STUDENT",
      schoolId: Number(schoolId),
    },
  });

  // ─────────────────────────────────────────────
  // 2️⃣ CREATE STUDENT PROFILE
  // ─────────────────────────────────────────────

  const student = await tx.student.create({
    data: {
      name: safeName,
      email: safeEmail,
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

  // ─────────────────────────────────────────────
  // 3️⃣ CREATE ENROLLMENT (CLASS + STREAM)
  // ─────────────────────────────────────────────

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

    await tx.student.update({
      where: { id: student.id },
      data: { classroomId: Number(classroomId) },
    });
  }

  // ─────────────────────────────────────────────
  // 4️⃣ CREATE / LINK PARENTS (SAFE LOOP)
  // ─────────────────────────────────────────────

  const createdParents = [];

  if (Array.isArray(parents) && parents.length > 0) {
    for (const rawParent of parents) {
      if (!rawParent) continue;

      const parentEmail = rawParent.email?.trim();
      const parentName = rawParent.name?.trim();

      if (!parentEmail || !parentName) {
        console.warn("Skipping invalid parent record:", rawParent);
        continue;
      }

      let parentUser = await tx.user.findUnique({
        where: { email: parentEmail },
      });

      let parent;
      let parentTempPassword = null;

      if (parentUser) {
        parent = await tx.parent.findFirst({
          where: { userId: parentUser.id },
        });

        if (!parent) {
          parent = await tx.parent.create({
            data: {
              type: rawParent.type,
              name: parentName,
              email: parentEmail,
              phone: rawParent.phone,
              address: rawParent.address,
              userId: parentUser.id,
            },
          });
        }
      } else {
        parentTempPassword = generateSecurePassword();
        const parentHash = await bcrypt.hash(parentTempPassword, 10);

        parentUser = await tx.user.create({
          data: {
            email: parentEmail,
            password: parentHash,
            role: "PARENT",
            schoolId: Number(schoolId),
          },
        });

        parent = await tx.parent.create({
          data: {
            type: rawParent.type,
            name: parentName,
            email: parentEmail,
            phone: rawParent.phone,
            address: rawParent.address,
            userId: parentUser.id,
          },
        });

        createdParents.push({
          name: parentName,
          email: parentEmail,
          temporaryPassword: parentTempPassword,
        });
      }

      await tx.studentParent.upsert({
        where: {
          studentId_parentId: {
            studentId: student.id,
            parentId: parent.id,
          },
        },
        update: { isPrimary: rawParent.isPrimary || false },
        create: {
          studentId: student.id,
          parentId: parent.id,
          isPrimary: rawParent.isPrimary || false,
        },
      });
    }
  }

  // ─────────────────────────────────────────────
  // 5️⃣ ELECTIVE SUBJECT ASSIGNMENT
  // ─────────────────────────────────────────────

  if (electiveCurriculumSubjectIds.length > 0 && enrollment) {
    const isValid = await validateElectivesForEnrollment(
      tx,
      enrollment.id,
      electiveCurriculumSubjectIds,
    );

    if (!isValid) {
      throw new Error("Invalid elective subjects for this enrollment");
    }

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

  // ─────────────────────────────────────────────
  // RETURN RESPONSE
  // ─────────────────────────────────────────────

  return {
    student,
    user,
    enrollment,
    tempPassword: tempPasswords.student,
    createdParents: createdParents.length ? createdParents : undefined,
  };
}
