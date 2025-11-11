import prisma from '../models/prisma.js';

// Create a new examination
export const createExamination = async (req, res) => {
  try {
    const { title, description, subject, examDate, duration, totalMarks, schoolId, classroomId } = req.body;

    // Validate required fields
    if (!title || !subject || !examDate || !duration || !totalMarks || !schoolId || !classroomId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const examination = await prisma.examination.create({
      data: {
        title,
        description,
        subject,
        examDate: new Date(examDate),
        duration: parseInt(duration),
        totalMarks: parseFloat(totalMarks),
        school: { connect: { id: parseInt(schoolId) } },
        classroom: { connect: { id: parseInt(classroomId) } }
      },
      include: {
        school: { select: { id: true, name: true, schoolCode: true } },
        classroom: { select: { id: true, name: true } }
      }
    });

    res.status(201).json(examination);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create examination' });
  }
};

// Get all examinations
export const getExaminations = async (req, res) => {
  try {
    const { schoolId, classroomId, status } = req.query;

    const where = {};
    if (schoolId) where.schoolId = parseInt(schoolId);
    if (classroomId) where.classroomId = parseInt(classroomId);
    if (status) where.status = status;

    const examinations = await prisma.examination.findMany({
      where,
      orderBy: { examDate: 'asc' },
      include: {
        school: { select: { id: true, name: true, schoolCode: true } },
        classroom: { select: { id: true, name: true } },
        results: { select: { id: true, studentId: true, marksObtained: true } }
      }
    });

    res.json({ examinations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch examinations' });
  }
};

// Get single examination with results
export const getExamination = async (req, res) => {
  try {
    const { id } = req.params;

    const examination = await prisma.examination.findUnique({
      where: { id: parseInt(id) },
      include: {
        school: { select: { id: true, name: true, schoolCode: true } },
        classroom: { select: { id: true, name: true } },
        results: {
          include: {
            student: { select: { id: true, name: true, email: true } }
          }
        }
      }
    });

    if (!examination) {
      return res.status(404).json({ error: 'Examination not found' });
    }

    res.json(examination);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch examination' });
  }
};

// Update examination
export const updateExamination = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, subject, examDate, duration, totalMarks, status } = req.body;

    const data = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (subject !== undefined) data.subject = subject;
    if (examDate !== undefined) data.examDate = new Date(examDate);
    if (duration !== undefined) data.duration = parseInt(duration);
    if (totalMarks !== undefined) data.totalMarks = parseFloat(totalMarks);
    if (status !== undefined) data.status = status;

    const examination = await prisma.examination.update({
      where: { id: parseInt(id) },
      data,
      include: {
        school: { select: { id: true, name: true, schoolCode: true } },
        classroom: { select: { id: true, name: true } },
        results: { select: { id: true, studentId: true, marksObtained: true } }
      }
    });

    res.json(examination);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update examination' });
  }
};

// Delete examination
export const deleteExamination = async (req, res) => {
  try {
    const { id } = req.params;

    // Deleting the examination will cascade delete results
    await prisma.examination.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Examination deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete examination' });
  }
};

// Add or update examination result for a student
export const addExaminationResult = async (req, res) => {
  try {
    const { examinationId, studentId, marksObtained, remarks } = req.body;

    if (!examinationId || !studentId || marksObtained === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if result already exists
    const existingResult = await prisma.examinationResult.findUnique({
      where: {
        examinationId_studentId: {
          examinationId: parseInt(examinationId),
          studentId: parseInt(studentId)
        }
      }
    });

    let result;
    if (existingResult) {
      // Update existing result
      result = await prisma.examinationResult.update({
        where: {
          examinationId_studentId: {
            examinationId: parseInt(examinationId),
            studentId: parseInt(studentId)
          }
        },
        data: {
          marksObtained: parseFloat(marksObtained),
          remarks
        },
        include: {
          student: { select: { id: true, name: true, email: true } },
          examination: { select: { id: true, title: true, totalMarks: true } }
        }
      });
    } else {
      // Create new result
      result = await prisma.examinationResult.create({
        data: {
          marksObtained: parseFloat(marksObtained),
          remarks,
          examination: { connect: { id: parseInt(examinationId) } },
          student: { connect: { id: parseInt(studentId) } }
        },
        include: {
          student: { select: { id: true, name: true, email: true } },
          examination: { select: { id: true, title: true, totalMarks: true } }
        }
      });
    }

    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add examination result' });
  }
};

// Get examination results for a student
export const getStudentExaminationResults = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { examinationId } = req.query;

    const where = { studentId: parseInt(studentId) };
    if (examinationId) where.examinationId = parseInt(examinationId);

    const results = await prisma.examinationResult.findMany({
      where,
      include: {
        examination: {
          select: {
            id: true,
            title: true,
            subject: true,
            examDate: true,
            totalMarks: true,
            classroom: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch examination results' });
  }
};

// Get examination result details
export const getExaminationResult = async (req, res) => {
  try {
    const { resultId } = req.params;

    const result = await prisma.examinationResult.findUnique({
      where: { id: parseInt(resultId) },
      include: {
        student: { select: { id: true, name: true, email: true, classroom: { select: { id: true, name: true } } } },
        examination: { select: { id: true, title: true, subject: true, examDate: true, totalMarks: true } }
      }
    });

    if (!result) {
      return res.status(404).json({ error: 'Examination result not found' });
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch examination result' });
  }
};

// Delete examination result
export const deleteExaminationResult = async (req, res) => {
  try {
    const { resultId } = req.params;

    await prisma.examinationResult.delete({
      where: { id: parseInt(resultId) }
    });

    res.json({ message: 'Examination result deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete examination result' });
  }
};

// Get examination statistics
export const getExaminationStats = async (req, res) => {
  try {
    const { examinationId } = req.params;

    const results = await prisma.examinationResult.findMany({
      where: { examinationId: parseInt(examinationId) }
    });

    if (results.length === 0) {
      return res.json({
        totalStudents: 0,
        averageMarks: 0,
        highestMarks: 0,
        lowestMarks: 0,
        passedCount: 0
      });
    }

    const marks = results.map(r => r.marksObtained);
    const totalMarks = (await prisma.examination.findUnique({
      where: { id: parseInt(examinationId) }
    })).totalMarks;
    const passMarks = totalMarks / 2; // 50% is pass

    const stats = {
      totalStudents: results.length,
      averageMarks: (marks.reduce((a, b) => a + b, 0) / marks.length).toFixed(2),
      highestMarks: Math.max(...marks),
      lowestMarks: Math.min(...marks),
      passedCount: results.filter(r => r.marksObtained >= passMarks).length
    };

    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch examination statistics' });
  }
};
