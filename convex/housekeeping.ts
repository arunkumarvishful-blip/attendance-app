import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Helper function to get local date string (YYYY-MM-DD)
const getLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Get department members with face photo URLs
export const getDepartmentMembers = query({
  args: { department: v.string() },
  handler: async (ctx, args) => {
    const employees = await ctx.db
      .query("employees")
      .filter((q: any) => q.eq(q.field("department"), args.department))
      .collect();

    const results = [];
    for (const emp of employees) {
      let faceImageUrl = null;
      if (emp.faceImageId) {
        faceImageUrl = await ctx.storage.getUrl(emp.faceImageId as any);
      }
      results.push({
        _id: emp._id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        position: emp.position,
        department: emp.department,
        phone: emp.phone,
        joinDate: emp.joinDate,
        faceRegistered: emp.faceRegistered,
        faceImageUrl,
        status: emp.status,
      });
    }
    return results;
  },
});

// Get today's attendance stats for a department
export const getDepartmentStats = query({
  args: { department: v.string() },
  handler: async (ctx, args) => {
    const today = getLocalDate(new Date());
    const employees = await ctx.db
      .query("employees")
      .filter((q: any) => q.eq(q.field("department"), args.department))
      .collect();

    const activeEmployees = employees.filter((e: any) => e.status === "active");
    const employeeIds = activeEmployees.map((e: any) => e._id.toString());

    const todayAttendance = await ctx.db
      .query("attendance")
      .filter((q: any) => q.eq(q.field("date"), today))
      .collect();

    const deptAttendance = todayAttendance.filter((a: any) =>
      employeeIds.includes(a.employeeId.toString())
    );

    // Count UNIQUE employees who are present or late (not duplicate records)
    const presentEmployeeIds = new Set<string>();
    const lateEmployeeIds = new Set<string>();
    const leaveEmployeeIds = new Set<string>();
    const permissionEmployeeIds = new Set<string>();
    
    for (const a of deptAttendance) {
      const empId = a.employeeId.toString();
      if (a.status === "present") presentEmployeeIds.add(empId);
      if (a.status === "late") lateEmployeeIds.add(empId);
      if (a.status === "leave") leaveEmployeeIds.add(empId);
      if (a.status === "permission") permissionEmployeeIds.add(empId);
    }
    
    // "late" and "permission" employees are still counted as present
    const totalPresent = new Set([...presentEmployeeIds, ...lateEmployeeIds, ...permissionEmployeeIds]).size;
    const totalLeave = leaveEmployeeIds.size;
    const totalAbsent = Math.max(0, activeEmployees.length - totalPresent - totalLeave);

    return {
      present: totalPresent,
      late: lateEmployeeIds.size,
      permission: permissionEmployeeIds.size,
      absent: totalAbsent,
      leave: totalLeave,
      total: activeEmployees.length,
    };
  },
});

// Get combined dashboard with real-time attendance data
export const getCombinedDashboard = query({
  args: { department: v.string() },
  handler: async (ctx, args) => {
    const today = getLocalDate(new Date());
    const employees = await ctx.db
      .query("employees")
      .filter((q: any) => q.eq(q.field("department"), args.department))
      .collect();

    const todayAttendance = await ctx.db
      .query("attendance")
      .filter((q: any) => q.eq(q.field("date"), today))
      .collect();

    const results = [];
    for (const emp of employees) {
      let faceImageUrl = null;
      if (emp.faceImageId) {
        faceImageUrl = await ctx.storage.getUrl(emp.faceImageId as any);
      }
      // Get ALL records for this employee today, find the most relevant one
      const empRecords = todayAttendance
        .filter((a: any) => a.employeeId.toString() === emp._id.toString())
        .sort((a: any, b: any) => (b._creationTime || 0) - (a._creationTime || 0));
      
      // Use the first check-in record for status, and latest record for check-out
      const firstRecord = empRecords[empRecords.length - 1]; // oldest = first check-in
      const latestRecord = empRecords[0]; // newest = latest activity
      
      const checkInTime = firstRecord?.checkInTime || null;
      const checkOutTime = latestRecord?.checkOutTime || null;
      const status = firstRecord?.status || "absent";
      const hoursWorked = latestRecord?.hoursWorked || 0;
      const lateMinutes = firstRecord?.lateMinutes || 0;
      const extendedCheckoutTime = firstRecord?.extendedCheckoutTime || null;

      results.push({
        _id: emp._id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        position: emp.position,
        department: emp.department,
        faceImageUrl,
        checkInTime,
        checkOutTime,
        status,
        workingHours: hoursWorked,
        lateMinutes,
        extendedCheckoutTime,
      });
    }
    return results;
  },
});

// Get individual member profile with attendance and leave history
export const getMemberProfile = query({
  args: { employeeId: v.id("employees") },
  handler: async (ctx, args) => {
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error("Employee not found");

    let faceImageUrl = null;
    if (employee.faceImageId) {
      faceImageUrl = await ctx.storage.getUrl(employee.faceImageId as any);
    }

    // Get attendance history (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = getLocalDate(thirtyDaysAgo);
    const today = getLocalDate(new Date());

    const attendance = await ctx.db
      .query("attendance")
      .filter((q: any) => q.eq(q.field("employeeId"), args.employeeId))
      .collect();

    const recentAttendance = attendance
      .filter((a: any) => a.date >= thirtyDaysAgoStr && a.date <= today)
      .sort((a: any, b: any) => b.date.localeCompare(a.date));

    // Get leave history
    const leaves = await ctx.db
      .query("leaveRequests")
      .filter((q: any) => q.eq(q.field("employeeId"), args.employeeId))
      .collect();

    return {
      _id: employee._id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      position: employee.position,
      department: employee.department,
      phone: employee.phone,
      joinDate: employee.joinDate,
      faceImageUrl,
      faceRegistered: employee.faceRegistered,
      status: employee.status,
      attendanceHistory: recentAttendance.map((a: any) => ({
        date: a.date,
        checkInTime: a.checkInTime,
        checkOutTime: a.checkOutTime,
        status: a.status,
        hoursWorked: a.hoursWorked || 0,
        lateMinutes: a.lateMinutes || 0,
        extendedCheckoutTime: a.extendedCheckoutTime || null,
        overtimeHours: a.overtimeHours || 0,
      })),
      leaveHistory: leaves.sort((a: any, b: any) =>
        new Date(b.fromDate).getTime() - new Date(a.fromDate).getTime()
      ),
      todayStatus: (() => {
        const rec = recentAttendance.find((a: any) => a.date === today);
        if (!rec) return null;
        return {
          checkInTime: rec.checkInTime,
          checkOutTime: rec.checkOutTime,
          status: rec.status,
          workingHours: rec.hoursWorked || 0,
          lateMinutes: rec.lateMinutes || 0,
          extendedCheckoutTime: rec.extendedCheckoutTime || null,
          overtimeHours: rec.overtimeHours || 0,
        };
      })(),
    };
  },
});

// Get monthly overview
export const getMonthlyOverview = query({
  args: { department: v.string() },
  handler: async (ctx, args) => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const firstDayStr = getLocalDate(firstDay);
    const lastDayStr = getLocalDate(lastDay);

    const employees = await ctx.db
      .query("employees")
      .filter((q: any) => q.eq(q.field("department"), args.department))
      .collect();

    const allAttendance = await ctx.db
      .query("attendance")
      .collect();

    const monthAttendance = allAttendance.filter(
      (a: any) => a.date >= firstDayStr && a.date <= lastDayStr
    );

    const workingDays = Math.max(1, today.getDate()); // Days so far this month

    return employees.map((emp: any) => {
      const empAttendance = monthAttendance.filter(
        (a: any) => a.employeeId.toString() === emp._id.toString() && 
        (a.status === "present" || a.status === "late")
      );
      // Count unique days (not duplicate records per day)
      const uniqueDays = new Set(empAttendance.map((a: any) => a.date)).size;
      const percentage = Math.round((uniqueDays / workingDays) * 100);

      return {
        _id: emp._id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        presentCount: uniqueDays,
        lateCount: new Set(
          monthAttendance
            .filter((a: any) => a.employeeId.toString() === emp._id.toString() && a.status === "late")
            .map((a: any) => a.date)
        ).size,
        percentage: Math.min(percentage, 100),
        workingDays,
      };
    });
  },
});

// Add new employee
export const addMember = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    department: v.string(),
    position: v.string(),
    phone: v.optional(v.string()),   // accepted but stored in notes — not in employees schema
    joinDate: v.string(),            // accepted but not stored — not in employees schema
    faceImageId: v.optional(v.id("_storage")),
    companyId: v.id("companies"),
  },
  returns: v.id("employees"),
  handler: async (ctx, args) => {
    const emailBase = `${args.firstName.toLowerCase().replace(/\s/g, '')}.${(args.lastName || 'staff').toLowerCase()}`;
    const newEmployee = await ctx.db.insert("employees", {
      firstName: args.firstName,
      lastName: args.lastName || "",
      fullName: `${args.firstName} ${args.lastName || ""}`.trim(),
      department: args.department,
      position: args.position,
      faceImageId: args.faceImageId,
      companyId: args.companyId,
      email: `${emailBase}@company.local`,
      salaryType: "monthly",
      salaryRate: 0,
      status: "active",
      faceRegistered: !!args.faceImageId,
    });

    // If a face image is provided at create-time, auto-enroll to AWS
    // so this employee can be recognized for attendance immediately.
    if (args.faceImageId) {
      await ctx.scheduler.runAfter(0, internal.faceRecognitionAction.enrollEmployeeFaceInternal, {
        employeeId: newEmployee,
        storageId: args.faceImageId,
      });
    }
    return newEmployee;
  },
});

// Submit leave request for a member
export const submitLeaveForMember = mutation({
  args: {
    employeeId: v.id("employees"),
    leaveType: v.string(),
    fromDate: v.string(),
    toDate: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error("Employee not found");

    const leaveRequest = await ctx.db.insert("leaveRequests", {
      employeeId: args.employeeId,
      leaveType: args.leaveType,
      fromDate: new Date(args.fromDate),
      toDate: new Date(args.toDate),
      reason: args.reason,
      status: "pending",
      createdAt: new Date(),
      appliedDate: new Date(),
    });
    return leaveRequest;
  },
});

// Grant early leave permission for an employee
export const grantEarlyLeave = mutation({
  args: {
    employeeId: v.id("employees"),
    date: v.string(),
    reason: v.string(),
    grantedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error("Employee not found");

    // Check if already has active permission for this date
    const existing = await ctx.db
      .query("earlyLeavePermissions")
      .withIndex("by_employee_and_date", (q) =>
        q.eq("employeeId", args.employeeId).eq("date", args.date)
      )
      .first();

    if (existing && existing.status === "active") {
      throw new Error("Employee already has an active permission for today");
    }

    const permissionId = await ctx.db.insert("earlyLeavePermissions", {
      employeeId: args.employeeId,
      date: args.date,
      reason: args.reason,
      grantedBy: args.grantedBy,
      status: "active",
      grantedAt: Date.now(),
    });
    return permissionId;
  },
});

// Revoke early leave permission
export const revokeEarlyLeave = mutation({
  args: {
    permissionId: v.id("earlyLeavePermissions"),
  },
  handler: async (ctx, args) => {
    const permission = await ctx.db.get(args.permissionId);
    if (!permission) throw new Error("Permission not found");
    if (permission.status !== "active") throw new Error("Permission is not active");
    await ctx.db.patch(args.permissionId, { status: "revoked" });
  },
});

// Close incomplete checkout session (for admin to manually fix stuck sessions)
export const closeIncompleteCheckout = mutation({
  args: {
    employeeId: v.id("employees"),
    date: v.string(),
    checkOutTime: v.string(),
  },
  handler: async (ctx, args) => {
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error("Employee not found");

    // Find the attendance record for this date
    const records = await ctx.db
      .query("attendance")
      .withIndex("by_employee_and_date", (q) =>
        q.eq("employeeId", args.employeeId).eq("date", args.date)
      )
      .collect();

    if (records.length === 0) {
      throw new Error("No attendance record found for this date");
    }

    // Use the first record (earliest check-in)
    const firstRecord = records.sort(
      (a, b) => (a._creationTime || 0) - (b._creationTime || 0)
    )[0];

    if (firstRecord.checkOutTime) {
      throw new Error("Checkout already completed for this date");
    }

    if (!firstRecord.checkInTime) {
      throw new Error("No check-in time found");
    }

    // Calculate hours worked
    const checkInDate = new Date(`${args.date}T${firstRecord.checkInTime}`);
    const checkOutDate = new Date(`${args.date}T${args.checkOutTime}`);
    const hoursWorked = (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60);

    // Update the attendance record
    await ctx.db.patch(firstRecord._id, {
      checkOutTime: args.checkOutTime,
      hoursWorked: parseFloat(hoursWorked.toFixed(2)),
      status: "present",
    });

    return { success: true, message: "Checkout completed successfully" };
  },
});

// Add employee to shared account with email
export const addEmployeeToSharedAccount = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    department: v.string(),
    position: v.string(),
    phone: v.optional(v.string()),
    joinDate: v.string(),
    faceImageId: v.optional(v.id("_storage")),
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    // Validate email format
    if (!args.email.includes("@")) {
      throw new Error("Invalid email format");
    }

    // Check if employee with this email already exists
    const existing = await ctx.db
      .query("employees")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existing) {
      throw new Error("Employee with this email already exists");
    }

    const newEmployee = await ctx.db.insert("employees", {
      firstName: args.firstName,
      lastName: args.lastName || "",
      email: args.email,
      department: args.department,
      position: args.position,
      phone: args.phone,
      joinDate: args.joinDate,
      faceImageId: args.faceImageId,
      companyId: args.companyId,
      status: "active",
      faceRegistered: !!args.faceImageId,
      salaryType: "monthly",
      salaryRate: 0,
    });
    return newEmployee;
  },
});

// Get active permissions for today (for a department or all)
export const getActivePermissions = query({
  args: {
    department: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const today = getLocalDate(new Date());
    const permissions = await ctx.db
      .query("earlyLeavePermissions")
      .withIndex("by_date", (q) => q.eq("date", today))
      .collect();

    const results = [];
    for (const perm of permissions) {
      if (perm.status === "revoked") continue;
      const employee = await ctx.db.get(perm.employeeId);
      if (!employee) continue;
      if (args.department && employee.department?.toLowerCase() !== args.department.toLowerCase()) continue;

      results.push({
        _id: perm._id,
        employeeId: perm.employeeId,
        employeeName: `${employee.firstName || ""} ${employee.lastName || ""}`.trim(),
        department: employee.department,
        date: perm.date,
        reason: perm.reason,
        grantedBy: perm.grantedBy,
        status: perm.status,
        grantedAt: perm.grantedAt,
        usedAt: perm.usedAt,
      });
    }
    return results;
  },
});

// Check if employee has active permission for a date
export const checkEarlyLeavePermission = query({
  args: {
    employeeId: v.id("employees"),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const permission = await ctx.db
      .query("earlyLeavePermissions")
      .withIndex("by_employee_and_date", (q) =>
        q.eq("employeeId", args.employeeId).eq("date", args.date)
      )
      .first();

    if (permission && permission.status === "active") {
      return { hasPermission: true, reason: permission.reason, permissionId: permission._id };
    }
    return { hasPermission: false };
  },
});

// Get security logs for admin viewing
export const getSecurityLogs = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(v.object({
    _id: v.id("securityLogs"),
    eventType: v.string(),
    matchedEmployeeName: v.optional(v.string()),
    matchedDepartment: v.optional(v.string()),
    attemptedAccount: v.optional(v.string()),
    allowedDepartments: v.optional(v.array(v.string())),
    confidence: v.optional(v.number()),
    reason: v.string(),
    date: v.string(),
    time: v.string(),
    timestamp: v.number(),
  })),
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("securityLogs")
      .order("desc")
      .take(args.limit ?? 50);
    return logs.map((l: any) => ({
      _id: l._id,
      eventType: l.eventType,
      matchedEmployeeName: l.matchedEmployeeName,
      matchedDepartment: l.matchedDepartment,
      attemptedAccount: l.attemptedAccount,
      allowedDepartments: l.allowedDepartments,
      confidence: l.confidence,
      reason: l.reason,
      date: l.date,
      time: l.time,
      timestamp: l.timestamp,
    }));
  },
});

// Public function to add employee to office shared account (for quick admin setup)
export const quickAddEmployee = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    department: v.string(),
    position: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if employee with this email already exists
    const existing = await ctx.db
      .query("employees")
      .withIndex("by_email", (q: any) => q.eq("email", args.email))
      .first();

    if (existing) {
      return { success: false, message: "Employee with this email already exists", employeeId: existing._id };
    }

    // Get company
    const company = await ctx.db.query("companies").first();
    if (!company) {
      throw new Error("No company found in system");
    }

    // Add employee
    const newId = await ctx.db.insert("employees", {
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
      department: args.department,
      position: args.position,
      companyId: company._id,
      status: "active",
      faceRegistered: false,
      salaryType: "monthly",
      salaryRate: 0,
      phone: "",
      joinDate: new Date().toISOString().split('T')[0],
    });

    return { success: true, employeeId: newId, message: `${args.firstName} ${args.lastName} added to ${args.department}` };
  },
});

// Create General Department for office company if it doesn't exist
export const createGeneralDepartment = mutation({
  args: { companyId: v.id("companies") },
  returns: v.object({
    success: v.boolean(),
    departmentId: v.optional(v.id("departments")),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    // Check if General Department already exists for this company
    const existing = await ctx.db
      .query("departments")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    const generalDept = existing.find((d: any) => d.name === "General Department");
    if (generalDept) {
      return {
        success: true,
        departmentId: generalDept._id,
        message: "General Department already exists",
      };
    }

    // Create General Department
    const newDeptId = await ctx.db.insert("departments", {
      name: "General Department",
      companyId: args.companyId,
    });

    return {
      success: true,
      departmentId: newDeptId,
      message: "General Department created successfully",
    };
  },
});

// Get General Department ID for a company
export const getGeneralDepartment = query({
  args: { companyId: v.id("companies") },
  returns: v.optional(v.id("departments")),
  handler: async (ctx, args) => {
    const departments = await ctx.db
      .query("departments")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    const generalDept = departments.find((d: any) => d.name === "General Department");
    return generalDept?._id;
  },
});