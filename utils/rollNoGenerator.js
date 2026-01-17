// utils/rollNoGenerator.js
export const generateRollNo = async (
  prisma,
  { academicYearId, classroomId, streamId, schoolId }
) => {
  // Get school format (e.g., "SCH-YY-CL-SEC-###")
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { schoolCode: true, rollNoFormat: true },
  });

  if (!school) throw new Error("School not found");

  const format = school.rollNoFormat || `${school.schoolCode}-YY-CL-SEC-###`; // Default

  // Get year code (e.g., "25" for 2025-26)
  const year = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: { label: true },
  });
  const yearCode = year.label.split("-")[0].slice(2); // "2025-2026" → "25"

  // Get class details
  const classroom = await prisma.classroom.findUnique({
    where: { id: classroomId },
    select: { name: true, section: true },
  });
  const classCode = classroom.name.replace("Class ", ""); // "Class 11" → "11"
  const section = classroom.section;

  // Get stream code if applicable
  let streamCode = "";
  if (streamId) {
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: { name: true },
    });
    streamCode = stream.name.slice(0, 3).toUpperCase(); // "Science" → "SCI"
  }

  // Find max existing rollNo in this context
  const existing = await prisma.studentStream.findMany({
    where: {
      academicYearId,
      classroomId,
      streamId: streamId || undefined,
    },
    select: { rollNo: true },
    orderBy: { rollNo: "desc" },
    take: 1,
  });

  const maxNum = existing[0]
    ? parseInt(existing[0].rollNo.split("-").pop(), 10)
    : 0;
  const newNum = (maxNum + 1).toString().padStart(3, "0"); // "001"

  // Build rollNo
  let rollNo = format
    .replace("SCH", school.schoolCode)
    .replace("YY", yearCode)
    .replace("CL", classCode)
    .replace("SEC", section)
    .replace("STR", streamCode)
    .replace("###", newNum);

  return rollNo;
};
