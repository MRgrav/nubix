import { sendError } from "../utils/responseStructure.js";

export const enforceStudentAccess = async (req, res, next) => {
  console.log("Middleware running - user:", req.user);

  if (req.user.role === "PARENT") {
    const actingStudentId = req.user.actingAsStudentId;

    console.log("Parent detected - actingAsStudentId:", actingStudentId);

    if (!actingStudentId) {
      return sendError(
        res,
        403,
        "Please select a child first",
        "CHILD_NOT_SELECTED"
      );
    }

    const isStudentRoute =
      req.path.startsWith("/students/") || req.path.includes("/profile/");

    if (isStudentRoute && req.params.id) {
      const requestedId = parseInt(req.params.id);
      console.log("Requested ID:", requestedId, "Acting ID:", actingStudentId);

      if (requestedId !== actingStudentId) {
        return sendError(
          res,
          403,
          "You are not authorized to access this student",
          "FORBIDDEN"
        );
      }
    }

    // Optional: For other endpoints (PTM, fees, etc.), you can add custom filters in controllers
  }

  next();
};
