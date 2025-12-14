export const announcementPermission = (req, res, next) => {
  const role = req.user.role; // STUDENT, STAFF, ADMIN, PRINCIPAL
  const announcement = req.announcement;

  const type = req.method === "POST" ? req.body.type : announcement?.type;

  // Students → read only
  if (req.method === "GET" && role === "STUDENT") {
    return next();
  }

  // Staff → notices only, own notices only
  if (role === "STAFF") {
    if (type !== "notice") {
      return res.status(403).json({ error: "Staff cannot manage events" });
    }

    if (req.method === "POST") return next();

    if (["PUT", "DELETE"].includes(req.method)) {
      if (announcement.createdById === req.user.id) return next();
      return res.status(403).json({ error: "Cannot modify others’ notices" });
    }
  }

  // Admin / Principal → full access
  if (["ADMIN", "PRINCIPAL"].includes(role)) {
    return next();
  }

  return res.status(403).json({ error: "Not authorized" });
};
