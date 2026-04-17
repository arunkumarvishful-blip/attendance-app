import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireAdminOrHR } from "./helpers";
import { internal } from "./_generated/api";

const leaveReturn = v.object({
  _id: v.id("leaveRequests"),
  _creationTime: v.number(),
  employeeId: v.id("employees"),
  employeeName: v.optional(v.string()),
  requestedByName: v.optional(v.string()),
  department: v.optional(v.string()),
  companyId: v.optional(v.id("companies")),
  leaveType: v.string(),
  startDate: v.string(),
  endDate: v.string(),
  reason: v.string(),
  status: v.string(),
  approvedBy: v.optional(v.id("users")),
  approvedByName: v.optional(v.string()),
});

// Helper to build leave result with requester and approver names
async function buildLeaveResult(ctx: any, l: any) {
  const emp = await ctx.db.get(l.employeeId);
  
  // Get the requesting user's name
  let requestedByName: string | undefined;
  if (l.requestedBy) {
    const requester = await ctx.db.get(l.requestedBy);
    if (requester) {
      requestedByName = requester.firstName
        ? `${requester.firstName} ${requester.lastName || ''}`.trim()
        : requester.email || 'Unknown';
    }
  }
  
  // Get the approver's name
  let approvedByName: string | undefined;
  if (l.approvedBy) {
    const approver = await ctx.db.get(l.approvedBy);
    if (approver) {
      approvedByName = approver.firstName
        ? `${approver.firstName} ${approver.lastName || ''}`.trim()
        : approver.email || 'Admin';
    }
  }
  
  // Use requestedByName first, then fall back to employee name
  const empName = emp ? (emp.firstName ? `${emp.firstName} ${emp.lastName || ''}`.trim() : (emp.fullName || '')) : undefined;
  
  return {
    _id: l._id, _creationTime: l._creationTime,
    employeeId: l.employeeId,
    employeeName: requestedByName || empName,
    requestedByName,
    department: emp?.department, companyId: l.companyId,
    leaveType: l.leaveType, startDate: l.startDate, endDate: l.endDate,
    reason: l.reason, status: l.status, approvedBy: l.approvedBy,
    approvedByName,
  };
}

export const list = query({
  args: { companyId: v.optional(v.id("companies")), status: v.optional(v.string()) },
  returns: v.array(leaveReturn),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    let leaves;
    if (args.companyId && args.status) {
      leaves = await ctx.db.query("leaveRequests")
        .withIndex("by_company_and_status", (q: any) =>
          q.eq("companyId", args.companyId).eq("status", args.status))
        .collect();
    } else if (args.status) {
      leaves = await ctx.db.query("leaveRequests")
        .withIndex("by_status", (q: any) => q.eq("status", args.status))
        .collect();
    } else {
      leaves = await ctx.db.query("leaveRequests").collect();
    }
    const results = [];
    for (const l of leaves) {
      results.push(await buildLeaveResult(ctx, l));
    }
    return results;
  },
});

// Get leaves for a specific employee (self-service)
export const getMyLeaves = query({
  args: { employeeId: v.id("employees") },
  returns: v.array(leaveReturn),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const leaves = await ctx.db.query("leaveRequests")
      .withIndex("by_employee", (q: any) => q.eq("employeeId", args.employeeId))
      .collect();
    const results = [];
    for (const l of leaves) {
      results.push(await buildLeaveResult(ctx, l));
    }
    return results;
  },
});

export const create = mutation({
  args: {
    employeeId: v.id("employees"),
    companyId: v.optional(v.id("companies")),
    leaveType: v.string(), startDate: v.string(), endDate: v.string(),
    reason: v.string(),
  },
  returns: v.id("leaveRequests"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const leaveId = await ctx.db.insert("leaveRequests", { ...args, status: "pending", requestedBy: user._id });

    // Instant sync to Supabase
    await ctx.scheduler.runAfter(
      0,
      internal.supabaseSync.syncToSupabase,
      {
        tableName: "leave_requests",
        recordId: leaveId.toString(),
        payload: {
          employee_name: '',
          leave_type: args.leaveType,
          start_date: args.startDate,
          end_date: args.endDate,
          reason: (args.reason || '').substring(0, 500),
          status: 'pending',
          synced_at: new Date().toISOString(),
        }
      }
    );

    return leaveId;
  },
});

export const approve = mutation({
  args: { id: v.id("leaveRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAdminOrHR(ctx);
    await ctx.db.patch(args.id, { status: "approved", approvedBy: user._id });

    // Instant sync to Supabase
    await ctx.scheduler.runAfter(
      0,
      internal.supabaseSync.syncToSupabase,
      {
        tableName: "leave_requests",
        recordId: args.id.toString(),
        payload: {
          employee_name: '',
          leave_type: '',
          start_date: '',
          end_date: '',
          reason: '',
          status: 'approved',
          synced_at: new Date().toISOString(),
        }
      }
    );

    return null;
  },
});

export const reject = mutation({
  args: { id: v.id("leaveRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAdminOrHR(ctx);
    await ctx.db.patch(args.id, { status: "rejected", approvedBy: user._id });
    return null;
  },
});

export const requestLeave = mutation({
  args: {
    employeeId: v.id("employees"),
    leaveType: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const employee = await ctx.db.get(args.employeeId);

    const leaveId = await ctx.db.insert("leaveRequests", {
      employeeId: args.employeeId,
      companyId: employee?.companyId,
      leaveType: args.leaveType,
      startDate: args.startDate,
      endDate: args.endDate,
      reason: args.reason,
      status: "pending",
      requestedBy: user._id,
    });

    // Notify all superadmins and admins
    const admins = await ctx.db.query("users")
      .withIndex("by_role", (q: any) => q.eq("role", "superadmin"))
      .collect();
    const adminUsers = await ctx.db.query("users")
      .withIndex("by_role", (q: any) => q.eq("role", "admin"))
      .collect();

    for (const admin of [...admins, ...adminUsers]) {
      await ctx.db.insert("notifications", {
        userId: admin._id,
        title: "New Leave Request",
        message: `${employee?.firstName} ${employee?.lastName || ''} requested ${args.leaveType} leave from ${args.startDate} to ${args.endDate}`,
        type: "leave",
        read: false,
        createdAt: Date.now(),
        leaveRequestId: leaveId,
      });
    }
    return null;
  },
});

export const approveLeave = mutation({
  args: { leaveId: v.id("leaveRequests"), action: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const caller = await requireAdminOrHR(ctx);

    const leave = await ctx.db.get(args.leaveId);
    if (!leave) throw new Error("Leave request not found");

    await ctx.db.patch(args.leaveId, {
      status: args.action,
      approvedBy: caller._id,
    });

    // Find the user account linked to this employee
    const empUser = await ctx.db.query("users")
      .withIndex("by_employeeId", (q: any) => q.eq("employeeId", leave.employeeId))
      .unique();

    const employee = await ctx.db.get(leave.employeeId);
    const adminName = caller.firstName
      ? `${caller.firstName} ${caller.lastName || ''}`.trim()
      : 'Admin';

    if (empUser) {
      const isApproved = args.action === 'approved';
      await ctx.db.insert("notifications", {
        userId: empUser._id,
        title: isApproved ? "Leave Request Approved ✓" : "Leave Request Rejected",
        message: isApproved
          ? `Your ${leave.leaveType} leave from ${leave.startDate} to ${leave.endDate} has been approved by ${adminName}.`
          : `Your ${leave.leaveType} leave from ${leave.startDate} to ${leave.endDate} has been rejected by ${adminName}.`,
        type: "leave_response",
        read: false,
        createdAt: Date.now(),
        leaveRequestId: args.leaveId,
      });
    }
    return null;
  },
});

// Migration: set requestedBy for existing leave records
export const migrateRequestedBy = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const leaves = await ctx.db.query("leaveRequests").collect();
    let count = 0;
    for (const l of leaves) {
      if (!l.requestedBy) {
        // Find the user linked to this employeeId
        const users = await ctx.db.query("users")
          .withIndex("by_employeeId", (q: any) => q.eq("employeeId", l.employeeId))
          .collect();
        if (users.length > 0) {
          await ctx.db.patch(l._id, { requestedBy: users[0]._id });
          count++;
        }
      }
    }
    return count;
  },
});