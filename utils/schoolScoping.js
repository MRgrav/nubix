import { sendError } from "./responseStructure.js";
export const applySchoolScope = (req, where = {}) => {
  const userSchoolId = req.user?.schoolId;

  if (!userSchoolId) {
    // Return the error response object (do NOT throw)
    return sendError(
      null,
      403,
      "No school associated with your account",
      "FORBIDDEN",
    );
  }

  where.schoolId = userSchoolId;
  return where;
};
