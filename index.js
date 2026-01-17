import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import schoolRoutes from "./routes/schoolRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import subjectRoutes from "./routes/subjectRoutes.js";
import classRoutes from "./routes/classRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import examinationRoutes from "./routes/examinationRoutes.js";
import staffRoutes from "./routes/staffRoutes.js";
import assignmentRoutes from "./routes/assignmentRoutes.js";
import timetableRoutes from "./routes/timetableRoutes.js";
import announcementRoutes from "./routes/announcementRoutes.js";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./swagger.js";
import basicAuth from "express-basic-auth";
import ptmRoutes from "./routes/ptmRoutes.js";
import leaveRoutes from "./routes/leaveRoutes.js";
import academicYearRoutes from "./routes/academicYearRoutes.js";
import streamRoutes from "./routes/streamRoutes.js";
import studentStreamRoutes from "./routes/studentStreamRoutes.js";
import teacherAssignmentRoutes from "./routes/teacherAssignmentRoutes.js";
import curriculumSubjectRoutes from "./routes/curriculumSubjectRoutes.js";
import feeRoutes from "./routes/feeRoutes.js";
import parentsRoutes from "./routes/parentRoutes.js";

const app = express();
app.use(cors());
app.use(express.json());

const swaggerAuth = basicAuth({
  users: {
    [process.env.SWAGGER_USER]: process.env.SWAGGER_PASSWORD,
  },
  challenge: true,
});

app.use("/api/auth", authRoutes);
app.use("/api/schools", schoolRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/classes", classRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/examinations", examinationRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/timetable", timetableRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/ptm", ptmRoutes);
app.use("/api/leaves", leaveRoutes);
app.use("/api/academic-years", academicYearRoutes);
app.use("/api/streams", streamRoutes);
app.use("/api/student-streams", studentStreamRoutes);
app.use("/api/teacher-assignments", teacherAssignmentRoutes);
app.use("/api/curriculum-subjects", curriculumSubjectRoutes);
app.use("/api/fees", feeRoutes);
app.use("/api/parents", parentsRoutes);

// Swagger route
app.use(
  "/api-docs",
  swaggerAuth,
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec)
);
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
