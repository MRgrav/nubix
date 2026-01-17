import { getActiveAcademicYear } from "./academicYearHelper.js";

export const resolveAcademicYearId = async ({ academicYearId, schoolId }) => {
  if (academicYearId) return Number(academicYearId);

  if (!schoolId) {
    throw new Error("schoolId is required to resolve academic year");
  }

  const activeYear = await getActiveAcademicYear(Number(schoolId));
  if (!activeYear) {
    throw new Error("No active academic year found");
  }

  return activeYear.id;
};
