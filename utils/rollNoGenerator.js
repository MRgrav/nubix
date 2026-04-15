// utils/rollNoGenerator.js
// export const generateRollNo = async (
//   prisma,
//   { academicYearId, classroomId, streamId, schoolId },
// ) => {
//   // Get school format (e.g., "SCH-YY-CL-SEC-###")
//   const school = await prisma.school.findUnique({
//     where: { id: Number(schoolId) },
//     select: { schoolCode: true, rollNoFormat: true },
//   });

//   if (!school) throw new Error("School not found");

//   const format = school.rollNoFormat || `${school.schoolCode}-YY-CL-SEC-###`; // Default

//   // Get year code (e.g., "25" for 2025-26)
//   const year = await prisma.academicYear.findUnique({
//     where: { id: Number(academicYearId) },
//     select: { label: true },
//   });

//   if (!year || !year.label) {
//     throw new Error(
//       `Academic year with ID ${academicYearId} not found or has no label`,
//     );
//   }
//   const yearCode = year.label.split("-")[0].slice(-2); // "2025-2026" → "25"

//   // Get class details
//   const classroom = await prisma.classroom.findUnique({
//     where: { id: classroomId },
//     select: { name: true, section: true },
//   });
//   const classCode = classroom.name.replace("Class ", ""); // "Class 11" → "11"
//   const section = classroom.section;

//   // Get stream code if applicable
//   let streamCode = "";
//   if (streamId) {
//     const stream = await prisma.stream.findUnique({
//       where: { id: streamId },
//       select: { name: true },
//     });
//     streamCode = stream.name.slice(0, 3).toUpperCase(); // "Science" → "SCI"
//   }

//   // Find max existing rollNo in this context
//   const existing = await prisma.studentStream.findMany({
//     where: {
//       academicYearId,
//       classroomId,
//       streamId: streamId || undefined,
//     },
//     select: { rollNo: true },
//     orderBy: { rollNo: "desc" },
//     take: 1,
//   });

//   const maxNum = existing[0]
//     ? parseInt(existing[0].rollNo.split("-").pop(), 10)
//     : 0;
//   const newNum = (maxNum + 1).toString().padStart(3, "0"); // "001"

//   // Build rollNo
//   let rollNo = format
//     .replace("SCH", school.schoolCode)
//     .replace("YY", yearCode)
//     .replace("CL", classCode)
//     .replace("SEC", section)
//     .replace("STR", streamCode)
//     .replace("###", newNum);

//   return rollNo;
// };

// utils/rollNoGenerator.js
export const generateRollNo = async (
  prisma,
  { academicYearId, classroomId, streamId, schoolId },
) => {
  if (!academicYearId || !classroomId || !schoolId) {
    throw new Error("academicYearId, classroomId, and schoolId are required");
  }

  // Get school format
  const school = await prisma.school.findUnique({
    where: { id: Number(schoolId) },
    select: { schoolCode: true, rollNoFormat: true },
  });

  if (!school) throw new Error(`School with ID ${schoolId} not found`);

  const format = school.rollNoFormat || `${school.schoolCode}-YY-CL-SEC-###`;

  // Get academic year with proper error handling
  const year = await prisma.academicYear.findUnique({
    where: { id: Number(academicYearId) },
    select: { label: true },
  });

  if (!year || !year.label) {
    throw new Error(
      `Academic year with ID ${academicYearId} not found or has no label`,
    );
  }

  // Safe year code extraction
  const yearCode = year.label.split("-")[0].slice(-2); // "2025-2026" → "25"

  // Get classroom details
  const classroom = await prisma.classroom.findUnique({
    where: { id: Number(classroomId) },
    select: { name: true, section: true },
  });

  if (!classroom) {
    throw new Error(`Classroom with ID ${classroomId} not found`);
  }

  const classCode = classroom.name.replace(/Class\s*/i, "").trim(); // "Class 11" → "11"
  const section = classroom.section || "A";

  // Get stream code if applicable
  let streamCode = "";
  if (streamId) {
    const stream = await prisma.stream.findUnique({
      where: { id: Number(streamId) },
      select: { name: true },
    });
    if (stream) {
      streamCode = stream.name.slice(0, 3).toUpperCase();
    }
  }

  // Find max existing roll number in this context
  const existing = await prisma.studentStream.findMany({
    where: {
      academicYearId: Number(academicYearId),
      classroomId: Number(classroomId),
      streamId: streamId ? Number(streamId) : null,
    },
    select: { rollNo: true },
    orderBy: { rollNo: "desc" },
    take: 1,
  });

  const maxNum = existing[0]?.rollNo
    ? parseInt(existing[0].rollNo.split("-").pop() || "0", 10)
    : 0;

  const newNum = (maxNum + 1).toString().padStart(3, "0");

  // Build final roll number
  let rollNo = format
    .replace("SCH", school.schoolCode)
    .replace("YY", yearCode)
    .replace("CL", classCode)
    .replace("SEC", section)
    .replace("STR", streamCode)
    .replace("###", newNum);

  return rollNo;
};
