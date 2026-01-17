import prisma from "../models/prisma.js";

// export const getActiveAcademicYear = async (schoolId = null) => {
//   const where = { isActive: true };
//   if (schoolId) where.schoolId = schoolId;
//   return await prisma.academicYear.findFirst({ where });
// };

export const getActiveAcademicYear = async () => {
  return await prisma.academicYear.findFirst({
    where: { isActive: true },
    orderBy: { startDate: "desc" }, // newest active
  });
};

export const getAcademicYearByLabel = async (label) => {
  return await prisma.academicYear.findUnique({ where: { label } });
};
