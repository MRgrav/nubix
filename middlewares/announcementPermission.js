// middlewares\announcementPermission.js
export const announcementPermission = (req, res, next) => {
  const role = req.user?.role;
  const announcement = req.announcement;

  // For POST, read type from request body; for other methods, from the loaded announcement
  const type = req.method === "POST" ? req.body.type : announcement?.type;

  // Students → read only (GET) – allow all GET requests
  if (req.method === "GET" && role === "STUDENT") {
    return next();
  }

  // Staff → only NOTICE, and only their own notices (for PUT/DELETE)
  if (role === "STAFF") {
    // For POST, the type is in req.body; for other methods, from announcement
    if (type !== "NOTICE") {
      return res.status(403).json({ error: "Staff cannot manage events" });
    }

    // For POST, no further checks
    if (req.method === "POST") return next();

    // For PUT/DELETE, ensure they own the announcement
    if (["PUT", "DELETE"].includes(req.method)) {
      // announcement.createdById is the direct foreign key (available from Prisma)
      if (announcement && announcement.createdById === req.user.id)
        return next();
      return res.status(403).json({ error: "Cannot modify others’ notices" });
    }
  }

  // Admin / Principal → full access
  if (["ADMIN", "PRINCIPAL"].includes(role)) {
    return next();
  }

  return res.status(403).json({ error: "Not authorized" });
};
