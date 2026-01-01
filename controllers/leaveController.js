import prisma from '../models/prisma.js';

/**
 * Calculate number of days between start and end date (inclusive)
 */
const calculateDays = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays + 1; // inclusive
};

/**
 * Step 1: Submit Leave Request (Staff=TEACHER/Admin)
 * POST /api/leaves
 */
export const createLeaveRequest = async (req, res) => {
  try {
    const { leave_type, reason, start_date, end_date } = req.body;
    const user = req.user;

    // Validate required fields
    if (!leave_type || !reason || !start_date || !end_date) {
      return res.status(400).json({ 
        error: 'leave_type, reason, start_date, and end_date are required' 
      });
    }

    // Validate user_role exists (should be STAFF or ADMIN)
    if (!['STAFF', 'ADMIN'].includes(user.role)) {
      return res.status(403).json({ 
        error: 'Only staff and admin can submit leave requests' 
      });
    }

    // Validate leave_type
    const validLeaveTypes = ['casual', 'sick', 'earned', 'other'];
    if (!validLeaveTypes.includes(leave_type)) {
      return res.status(400).json({ 
        error: `leave_type must be one of: ${validLeaveTypes.join(', ')}` 
      });
    }

    // Validate dates
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    if (startDate > endDate) {
      return res.status(400).json({ error: 'start_date must be before or equal to end_date' });
    }

    // Calculate number_of_days
    const numberOfDays = calculateDays(startDate, endDate);

    // Map user role to leave user role (STAFF -> staff, ADMIN -> admin)
    const userRole = user.role === 'STAFF' ? 'staff' : 'admin';

    // Create leave request
    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        userId: user.id,
        userRole,
        leaveType: leave_type,
        reason,
        startDate: startDate,
        endDate: endDate,
        numberOfDays,
        status: 'pending'
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true
          }
        }
      }
    });

    res.status(201).json(leaveRequest);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create leave request' });
  }
};

/**
 * Step 2: View Own Leave Requests
 * GET /api/leaves/me
 */
export const getMyLeaveRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    const leaveRequests = await prisma.leaveRequest.findMany({
      where: {
        userId
      },
      include: {
        approvedByUser: {
          select: {
            id: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(leaveRequests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch leave requests' });
  }
};

/**
 * Step 3: View Single Leave Request
 * GET /api/leaves/{id}
 */
export const getLeaveRequestById = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid leave request id' });
    }

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true
          }
        },
        approvedByUser: {
          select: {
            id: true,
            email: true,
            role: true
          }
        }
      }
    });

    if (!leaveRequest) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    const user = req.user;

    // If user is requester → allow
    // If admin → allow
    // Else → return 403 forbidden
    if (user.role !== 'ADMIN' && leaveRequest.userId !== user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(leaveRequest);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch leave request' });
  }
};

/**
 * Step 4: Admin/Principal Approve Leave Request
 * PUT /api/leaves/{id}/approve
 */
export const approveLeaveRequest = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid leave request id' });
    }

    // Verify role = admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admin can approve leave requests' });
    }

    // Fetch leave request by ID
    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id }
    });

    if (!leaveRequest) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    // Update status to approved
    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: 'approved',
        approvedBy: req.user.id,
        approvedAt: new Date()
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true
          }
        },
        approvedByUser: {
          select: {
            id: true,
            email: true,
            role: true
          }
        }
      }
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Leave request not found' });
    }
    res.status(500).json({ error: 'Failed to approve leave request' });
  }
};

/**
 * Step 4: Admin/Principal Reject Leave Request
 * PUT /api/leaves/{id}/reject
 */
export const rejectLeaveRequest = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid leave request id' });
    }

    // Verify role = admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admin can reject leave requests' });
    }

    // Fetch leave request by ID
    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id }
    });

    if (!leaveRequest) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    // Update status to rejected
    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        approvedBy: req.user.id,
        approvedAt: new Date()
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true
          }
        },
        approvedByUser: {
          select: {
            id: true,
            email: true,
            role: true
          }
        }
      }
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Leave request not found' });
    }
    res.status(500).json({ error: 'Failed to reject leave request' });
  }
};

/**
 * Step 5: Fetch All Leaves (Admin)
 * GET /api/leaves?user_id=&date=&status=
 */
export const getAllLeaveRequests = async (req, res) => {
  try {
    // Only admin can access this
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admin can view all leave requests' });
    }

    const { user_id, date, status } = req.query;

    // Build where clause with optional filters
    const where = {};
    
    if (user_id) {
      where.userId = parseInt(user_id);
    }

    if (status) {
      const validStatuses = ['pending', 'approved', 'rejected'];
      if (validStatuses.includes(status)) {
        where.status = status;
      }
    }

    if (date) {
      const filterDate = new Date(date);
      if (!isNaN(filterDate.getTime())) {
        where.OR = [
          { startDate: { lte: filterDate }, endDate: { gte: filterDate } }
        ];
      }
    }

    const leaveRequests = await prisma.leaveRequest.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true
          }
        },
        approvedByUser: {
          select: {
            id: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(leaveRequests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch leave requests' });
  }
};

