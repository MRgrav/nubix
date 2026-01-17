import prisma from "../models/prisma.js";

export const createLeaveRequest = async (req, res) => {
  const { leaveType, reason, startDate, endDate, numberOfDays } = req.body;
  const user = req.user;
  try {
    const numberOfDaysCalc =
      numberOfDays ||
      Math.ceil(
        (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)
      );
    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        user: { connect: { id: user.id } },
        userRole: user.role === "STAFF" ? "staff" : "admin",
        leaveType,
        reason,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        numberOfDays: numberOfDaysCalc,
      },
      include: { user: true },
    });
    res.status(201).json(leaveRequest);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create leave request" });
  }
};

export const getMyLeaveRequests = async (req, res) => {
  const user = req.user;
  try {
    const leaves = await prisma.leaveRequest.findMany({
      where: { userId: user.id },
      include: { user: true, approvedByUser: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ leaves });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch leave requests" });
  }
};

export const getLeaveRequestById = async (req, res) => {
  const { id } = req.params;
  try {
    const leave = await prisma.leaveRequest.findUnique({
      where: { id: parseInt(id) },
      include: { user: true, approvedByUser: true },
    });
    if (!leave) return res.status(404).json({ error: "Leave not found" });
    res.json(leave);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch leave" });
  }
};

export const getAllLeaveRequests = async (req, res) => {
  if (req.user.role !== "ADMIN")
    return res.status(403).json({ error: "Admin only" });
  try {
    const leaves = await prisma.leaveRequest.findMany({
      include: { user: true, approvedByUser: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ leaves });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch all leaves" });
  }
};

export const approveLeaveRequest = async (req, res) => {
  const { id } = req.params;
  if (req.user.role !== "ADMIN")
    return res.status(403).json({ error: "Admin only" });
  try {
    const updated = await prisma.leaveRequest.update({
      where: { id: parseInt(id) },
      data: {
        status: "approved",
        approvedBy: req.user.id,
        approvedAt: new Date(),
      },
      include: { user: true, approvedByUser: true },
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    if (err.code === "P2025")
      return res.status(404).json({ error: "Leave not found" });
    res.status(500).json({ error: "Failed to approve leave" });
  }
};

export const rejectLeaveRequest = async (req, res) => {
  const { id } = req.params;
  if (req.user.role !== "ADMIN")
    return res.status(403).json({ error: "Admin only" });
  try {
    const updated = await prisma.leaveRequest.update({
      where: { id: parseInt(id) },
      data: { status: "rejected" },
      include: { user: true },
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    if (err.code === "P2025")
      return res.status(404).json({ error: "Leave not found" });
    res.status(500).json({ error: "Failed to reject leave" });
  }
};

export const deleteLeaveRequest = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.leaveRequest.delete({ where: { id: parseInt(id) } });
    res.json({ message: "Leave deleted" });
  } catch (err) {
    console.error(err);
    if (err.code === "P2025")
      return res.status(404).json({ error: "Leave not found" });
    res.status(500).json({ error: "Failed to delete leave" });
  }
};
