import prisma from "../models/prisma.js";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";
import { generateRollNo } from "../utils/rollNoGenerator.js";

export const enrollStudentInStream = async (req, res) => {
  const { studentId, streamId, classroomId } = req.body;

  try {
    const activeYear = await getActiveAcademicYear();
    if (!activeYear) {
      return res.status(400).json({ error: "No active academic year found" });
    }

    const ayId = activeYear.id;
    const studentIdNum = parseInt(studentId);

    // 1. Check if student is already enrolled in this academic year
    const existingEnrollment = await prisma.studentStream.findUnique({
      where: {
        academicYearId_studentId: {
          academicYearId: ayId,
          studentId: studentIdNum,
        },
      },
    });

    if (existingEnrollment) {
      return res.status(409).json({
        error: "Student is already enrolled for this academic year",
        existingEnrollmentId: existingEnrollment.id,
        currentStreamId: existingEnrollment.streamId,
        currentClassroomId: existingEnrollment.classroomId,
        message: "Update Student Stream to change stream or class",
      });
    }

    // 2. If no existing enrollment → proceed with creation
    // Fetch student to get schoolId
    const student = await prisma.student.findUnique({
      where: { id: parseInt(studentId) },
      select: { id: true, schoolId: true },
    });

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    let rollNo = null;
    let finalClassroomId = classroomId ? parseInt(classroomId) : null;

    // If stream is being assigned → generate roll number (Class 11–12 logic)
    if (streamId) {
      // Resolve classroom (required when assigning stream)
      if (!finalClassroomId) {
        const currentStream = await prisma.studentStream.findUnique({
          where: {
            academicYearId_studentId: {
              academicYearId: activeYear.id,
              studentId: parseInt(studentId),
            },
          },
          select: { classroomId: true },
        });
        finalClassroomId = currentStream?.classroomId;
      }

      if (!finalClassroomId) {
        return res
          .status(400)
          .json({ error: "classroomId required when assigning stream" });
      }

      rollNo = await generateRollNo(prisma, {
        academicYearId: activeYear.id,
        classroomId: finalClassroomId,
        streamId: parseInt(streamId),
        schoolId: student.schoolId,
      });
    }

    // Upsert the enrollment
    const enrollment = await prisma.studentStream.upsert({
      where: {
        academicYearId_studentId: {
          academicYearId: activeYear.id,
          studentId: parseInt(studentId),
        },
      },
      update: {
        ...(finalClassroomId && {
          classroom: { connect: { id: finalClassroomId } },
        }),
        ...(streamId !== undefined &&
          (streamId
            ? { stream: { connect: { id: parseInt(streamId) } } }
            : { stream: { disconnect: true } })),
        ...(rollNo && { rollNo }),
      },
      create: {
        student: { connect: { id: parseInt(studentId) } },
        classroom: { connect: { id: finalClassroomId } },
        academicYear: { connect: { id: activeYear.id } },
        ...(streamId && { stream: { connect: { id: parseInt(streamId) } } }),
        ...(rollNo && { rollNo }),
      },
      include: {
        student: true,
        stream: true,
        classroom: true,
        academicYear: true,
      },
    });

    // Update student's classroomId if changed
    if (finalClassroomId) {
      await prisma.student.update({
        where: { id: parseInt(studentId) },
        data: { classroom: { connect: { id: finalClassroomId } } },
      });
    }

    res.status(enrollment ? 200 : 201).json({
      message: streamId
        ? `Student enrolled in stream with roll number: ${rollNo}`
        : "Classroom updated (roll number will be generated upon stream assignment)",
      rollNo,
      enrollment,
    });
  } catch (err) {
    console.error(err);
    if (err.code === "P2002") {
      return res
        .status(400)
        .json({ error: "Enrollment already exists for this year" });
    }
    res.status(500).json({ error: "Failed to enroll student in stream" });
  }
};

export const getStudentStreams = async (req, res) => {
  const { studentId, academicYearId } = req.query;
  try {
    const where = {};
    if (studentId) where.studentId = parseInt(studentId);
    if (academicYearId) where.academicYearId = parseInt(academicYearId);

    const studentStreams = await prisma.studentStream.findMany({
      where,
      include: {
        student: true,
        stream: true,
        academicYear: true,
        classroom: true,
      },
    });
    res.json({ studentStreams });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch enrollments" });
  }
};

export const getStudentStream = async (req, res) => {
  const { id } = req.params;
  try {
    const studentStream = await prisma.studentStream.findUnique({
      where: { id: parseInt(id) },
      include: { student: true, stream: true, academicYear: true },
    });
    if (!studentStream)
      return res.status(404).json({ error: "Enrollment not found" });
    res.json(studentStream);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch enrollment" });
  }
};

export const updateStudentStream = async (req, res) => {
  const { id } = req.params;
  const { streamId, classroomId } = req.body;
  try {
    const data = {};
    if (streamId !== undefined)
      data.stream = streamId
        ? { connect: { id: parseInt(streamId) } }
        : { disconnect: true };
    if (classroomId)
      data.classroom = { connect: { id: parseInt(classroomId) } };

    const studentStream = await prisma.studentStream.update({
      where: { id: parseInt(id) },
      data,
      include: { stream: true, classroom: true },
    });
    res.json(studentStream);
  } catch (err) {
    console.error(err);
    if (err.code === "P2025")
      return res.status(404).json({ error: "Enrollment not found" });
    res.status(500).json({ error: "Failed to update enrollment" });
  }
};

export const unenrollStudent = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.studentStream.delete({ where: { id: parseInt(id) } });
    res.json({ message: "Student unenrolled" });
  } catch (err) {
    console.error(err);
    if (err.code === "P2025")
      return res.status(404).json({ error: "Enrollment not found" });
    res.status(500).json({ error: "Failed to unenroll student" });
  }
};
