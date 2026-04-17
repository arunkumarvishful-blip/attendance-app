import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { validateAttendanceAccess } from "./helpers";

function parseTimeToMinutes(timeStr: string): number {
  const cleaned = timeStr.replace(/\u202f/g, ' ').trim();
  const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return -1;
  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const period = match[3]?.toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function minutesToTimeStr(mins: number): string {
  const hours = Math.floor(mins / 60);
  const m = mins % 60;
  const period = hours >= 12 ? "PM" : "AM";
  const dh = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return `${dh}:${m.toString().padStart(2, '0')} ${period}`;
}

const SHIFT_START = 9 * 60 + 30;
const SHIFT_END = 17 * 60 + 30;
const BREAK_MIN = 28;
const BREAK_MAX = 47;
const MAX_DAILY_DEDUCTION = 50;

export const getOfficeEmployees = query({
  args: {},
  handler: async (ctx) => {
    const employees = await ctx.db.query("employees").collect();
    const officeDepts = ["software", "management", "accounting","general"];
    const officeEmps = employees.filter(e =>
      e.status === "active" && officeDepts.includes((e.department || "").toLowerCase())
    );
    const today = new Date().toISOString().split('T')[0];
    const attendance = await ctx.db.query("attendance").withIndex("by_date", q => q.eq("date", today)).collect();
    
    const results = [];
    for (const e of officeEmps) {
      const rec = attendance.find(a => a.employeeId.toString() === e._id.toString());
      let statusIndicator = "not_checked_in";
      if (rec?.checkOutTime) statusIndicator = "checked_out";
      else if (rec?.checkInTime) statusIndicator = "checked_in";
      
      let faceImageUrl = null;
      if (e.faceImageId) {
        faceImageUrl = await ctx.storage.getUrl(e.faceImageId as any);
      }
      
      results.push({
        _id: e._id,
        firstName: e.firstName || e.fullName?.split(" ")[0] || "",
        lastName: e.lastName || e.fullName?.split(" ").slice(1).join(" ") || "",
        department: e.department,
        faceImageUrl,
        statusIndicator,
        lateMinutes: rec?.lateMinutes || 0,
      });
    }
    return results;
  },
});

export const getEmployeeDayStatus = query({
  args: { employeeId: v.id("employees"), date: v.string() },
  handler: async (ctx, args) => {
    const attendance = await ctx.db.query("attendance")
      .withIndex("by_employee_and_date", q => q.eq("employeeId", args.employeeId).eq("date", args.date))
      .collect();
    const rec = attendance[0];
    const breaks = await ctx.db.query("lunchBreaks")
      .withIndex("by_employee_date", q => q.eq("employeeId", args.employeeId).eq("date", args.date))
      .collect();
    const brk = breaks[0];
    const tasks = await ctx.db.query("dailyTasks")
      .withIndex("by_employee_date", q => q.eq("employeeId", args.employeeId).eq("date", args.date))
      .collect();
    const deductions = await ctx.db.query("salaryDeductions")
      .withIndex("by_employee_date", q => q.eq("employeeId", args.employeeId).eq("date", args.date))
      .collect();
    return {
      attendance: rec ? {
        checkInTime: rec.checkInTime,
        checkOutTime: rec.checkOutTime,
        status: rec.status,
        lateMinutes: rec.lateMinutes || 0,
        extendedCheckoutTime: rec.extendedCheckoutTime,
        hoursWorked: rec.hoursWorked,
        totalDeductionPercent: rec.totalDeductionPercent || 0,
      } : null,
      lunchBreak: brk ? {
        startTime: brk.startTime,
        endTime: brk.endTime,
        durationMinutes: brk.durationMinutes,
      } : null,
      tasks: tasks.map(t => ({ _id: t._id, title: t.title, description: t.description, difficulty: t.difficulty, status: t.status })),
      deductions: deductions.map(d => ({ violationType: d.violationType, deductionPercent: d.deductionPercent, description: d.description })),
      totalDeductionPercent: Math.min(deductions.reduce((sum, d) => sum + d.deductionPercent, 0), MAX_DAILY_DEDUCTION),
    };
  },
});

export const officeCheckIn = mutation({
  args: {
    employeeId: v.id("employees"),
    date: v.string(),
    time: v.string(),
    sharedAccountEmail: v.string(),
    deviceId: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
    faceImageId: v.optional(v.id("_storage")),
    faceMatchConfidence: v.optional(v.number()),
    imageAccount: v.optional(v.string()),
    imageStorageType: v.optional(v.string()),
  },
  returns: v.object({ success: v.boolean(), action: v.optional(v.string()), status: v.optional(v.string()), lateMinutes: v.optional(v.number()), extendedCheckoutTime: v.optional(v.string()), message: v.string() }),
  handler: async (ctx, args) => {
    // Validate attendance access with account-specific checks
    const validation = await validateAttendanceAccess(ctx, {
      deviceId: args.deviceId,
      accountEmail: args.sharedAccountEmail,
      employeeId: args.employeeId,
      action: "checkin",
    });

    if (!validation.allowed) {
      return { success: false, message: validation.reason || "Attendance marking blocked" };
    }

    const existing = await ctx.db.query("attendance")
      .withIndex("by_employee_and_date", q => q.eq("employeeId", args.employeeId).eq("date", args.date))
      .collect();
    if (existing.length > 0) {
      if (existing[0].checkOutTime) return { success: false, message: "Already completed attendance for today" };
      return { success: false, message: "Already checked in" };
    }
    const checkInMinutes = parseTimeToMinutes(args.time);
    let lateMinutes = 0;
    let extendedCheckoutTime: string | undefined;
    let status = "present";
    if (checkInMinutes > SHIFT_START) {
      lateMinutes = checkInMinutes - SHIFT_START;
      status = "late";
      extendedCheckoutTime = minutesToTimeStr(SHIFT_END + lateMinutes);
    }
    const employee = await ctx.db.get(args.employeeId);
    await ctx.db.insert("attendance", {
      employeeId: args.employeeId,
      companyId: employee?.companyId,
      date: args.date,
      checkInTime: args.time,
      status,
      lateMinutes,
      extendedCheckoutTime,
      source: "office_device",
      markedBy: args.sharedAccountEmail,
      checkInImageId: args.faceImageId,
      checkInImageAccount: args.imageAccount || args.sharedAccountEmail,
      checkInImageStorageType: args.imageStorageType || "convex",
      checkInDeviceId: args.deviceId,
    });
    await ctx.db.insert("officeSessionLogs", {
      sharedAccountEmail: args.sharedAccountEmail,
      employeeId: args.employeeId,
      employeeName: `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim(),
      action: "check_in",
      timestamp: Date.now(),
      date: args.date,
      details: lateMinutes > 0 ? `Late by ${lateMinutes} min. Extended checkout: ${extendedCheckoutTime}` : "On time",
      faceVerified: true,
      faceImageId: args.faceImageId,
      faceMatchConfidence: args.faceMatchConfidence,
    });
    if (lateMinutes > 0) {
      await ctx.db.insert("salaryDeductions", {
        employeeId: args.employeeId,
        date: args.date,
        violationType: "late_login",
        deductionPercent: Math.min(Math.round((lateMinutes / 480) * 100 * 100) / 100, MAX_DAILY_DEDUCTION),
        description: `Late by ${lateMinutes} minutes`,
        appliedAt: Date.now(),
      });
    }
    return {
      success: true, action: "checkin", status, lateMinutes, extendedCheckoutTime,
      message: lateMinutes > 0 ? `Checked in (${lateMinutes} min late). Must work until ${extendedCheckoutTime}` : "Checked in on time",
    };
  },
});

export const startLunchBreak = mutation({
  args: { 
    employeeId: v.id("employees"), 
    sharedAccountEmail: v.string(),
    date: v.string(),
    time: v.string(),
    deviceId: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
    faceImageId: v.optional(v.id("_storage")),
    faceMatchConfidence: v.optional(v.number()),
  },
  returns: v.object({ success: v.boolean(), message: v.string() }),
  handler: async (ctx, args) => {
    // Validate attendance access
    const validation = await validateAttendanceAccess(ctx, {
      deviceId: args.deviceId,
      accountEmail: args.sharedAccountEmail,
      employeeId: args.employeeId.toString(),
      action: "break_start",
    });

    if (!validation.allowed) {
      return { success: false, message: validation.reason || "Attendance marking blocked" };
    }

    const existing = await ctx.db.query("attendance")
      .withIndex("by_employee_and_date", q => q.eq("employeeId", args.employeeId).eq("date", args.date))
      .collect();
    if (!existing[0]?.checkInTime) return { success: false, message: "Must check in first" };
    if (existing[0]?.checkOutTime) return { success: false, message: "Already checked out" };
    const brks = await ctx.db.query("lunchBreaks")
      .withIndex("by_employee_date", q => q.eq("employeeId", args.employeeId).eq("date", args.date)).collect();
    if (brks.length > 0) {
      if (!brks[0].endTime) return { success: false, message: "Break already in progress" };
      return { success: false, message: "Break already taken today" };
    }
    await ctx.db.insert("lunchBreaks", { employeeId: args.employeeId, date: args.date, startTime: args.time, startTimestamp: Date.now() });
    const emp = await ctx.db.get(args.employeeId);
    await ctx.db.insert("officeSessionLogs", {
      sharedAccountEmail: args.sharedAccountEmail, employeeId: args.employeeId,
      employeeName: `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim(),
      action: "break_start", timestamp: Date.now(), date: args.date, details: `Break started at ${args.time}`,
      faceVerified: true,
      faceImageId: args.faceImageId,
      faceMatchConfidence: args.faceMatchConfidence,
    });
    return { success: true, message: "Lunch break started" };
  },
});

export const endLunchBreak = mutation({
  args: { 
    employeeId: v.id("employees"), 
    sharedAccountEmail: v.string(),
    date: v.string(),
    time: v.string(),
    deviceId: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
    faceImageId: v.optional(v.id("_storage")),
    faceMatchConfidence: v.optional(v.number()),
  },
  returns: v.object({ success: v.boolean(), message: v.string(), durationMinutes: v.optional(v.number()), violation: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    // Validate attendance access
    const validation = await validateAttendanceAccess(ctx, {
      deviceId: args.deviceId,
      accountEmail: args.sharedAccountEmail,
      employeeId: args.employeeId.toString(),
      action: "break_end",
    });

    if (!validation.allowed) {
      return { success: false, message: validation.reason || "Attendance marking blocked" };
    }

    const brks = await ctx.db.query("lunchBreaks")
      .withIndex("by_employee_date", q => q.eq("employeeId", args.employeeId).eq("date", args.date)).collect();
    const active = brks.find((b: any) => !b.endTime);
    if (!active) return { success: false, message: "No active break found" };
    
    const startTime = new Date(`${args.date}T${active.startTime}`).getTime();
    const endTime = new Date(`${args.date}T${args.time}`).getTime();
    const durationMinutes = Math.round((endTime - startTime) / 60000);
    
    await ctx.db.patch(active._id, { endTime: args.time, endTimestamp: Date.now(), durationMinutes });
    let violation = null;
    if (durationMinutes < BREAK_MIN) {
      violation = "short_break";
      await ctx.db.insert("salaryDeductions", {
        employeeId: args.employeeId, date: args.date, violationType: "short_break", deductionPercent: 5,
        description: `Break too short: ${durationMinutes} min (min 30, 2 min grace)`, appliedAt: Date.now(),
      });
    } else if (durationMinutes > BREAK_MAX) {
      const excess = durationMinutes - 45;
      violation = "long_break";
      await ctx.db.insert("salaryDeductions", {
        employeeId: args.employeeId, date: args.date, violationType: "long_break",
        deductionPercent: Math.min(Math.ceil(excess / 5) * 2, MAX_DAILY_DEDUCTION),
        description: `Break too long: ${durationMinutes} min (max 45, ${excess} min excess)`, appliedAt: Date.now(),
      });
    }
    const emp = await ctx.db.get(args.employeeId);
    await ctx.db.insert("officeSessionLogs", {
      sharedAccountEmail: args.sharedAccountEmail, employeeId: args.employeeId,
      employeeName: `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim(),
      action: "break_end", timestamp: Date.now(), date: args.date,
      details: `Break ended. Duration: ${durationMinutes} min${violation ? ` (VIOLATION)` : ''}`,
      faceVerified: true,
      faceImageId: args.faceImageId,
      faceMatchConfidence: args.faceMatchConfidence,
    });
    return { success: true, durationMinutes, violation,
      message: violation ? `Break ended (${durationMinutes} min) - VIOLATION` : `Break ended (${durationMinutes} min) - Valid` };
  },
});

export const officeCheckOut = mutation({
  args: {
    employeeId: v.id("employees"),
    date: v.string(),
    time: v.string(),
    sharedAccountEmail: v.string(),
    deviceId: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
    faceImageId: v.optional(v.id("_storage")),
    faceMatchConfidence: v.optional(v.number()),
    imageAccount: v.optional(v.string()),
    imageStorageType: v.optional(v.string()),
  },
  returns: v.object({ success: v.boolean(), action: v.string(), hoursWorked: v.number(), totalDeductionPercent: v.number(), incompleteTasks: v.number(), message: v.string() }),
  handler: async (ctx, args) => {
    // Validate attendance access
    const validation = await validateAttendanceAccess(ctx, {
      deviceId: args.deviceId,
      accountEmail: args.sharedAccountEmail,
      employeeId: args.employeeId.toString(),
      action: "checkout",
    });

    if (!validation.allowed) {
      return { success: false, message: validation.reason || "Attendance marking blocked", action: "blocked", hoursWorked: 0, totalDeductionPercent: 0, incompleteTasks: 0 };
    }

    const att = await ctx.db.query("attendance")
      .withIndex("by_employee_and_date", q => q.eq("employeeId", args.employeeId).eq("date", args.date)).collect();
    const rec = att[0];
    if (!rec?.checkInTime) return { success: false, message: "Must check in first", action: "blocked", hoursWorked: 0, totalDeductionPercent: 0, incompleteTasks: 0 };
    if (rec.checkOutTime) return { success: false, message: "Already checked out today", action: "blocked", hoursWorked: 0, totalDeductionPercent: 0, incompleteTasks: 0 };
    const currentMinutes = parseTimeToMinutes(args.time);
    const requiredCheckout = rec.extendedCheckoutTime ? parseTimeToMinutes(rec.extendedCheckoutTime) : SHIFT_END;
    const perms = await ctx.db.query("earlyLeavePermissions")
      .withIndex("by_employee_and_date", q => q.eq("employeeId", args.employeeId).eq("date", args.date)).collect();
    const activePerm = perms.find((p: any) => p.status === "active" && p.date === args.date);
    if (currentMinutes < requiredCheckout && !activePerm) {
      return { success: false, message: `Cannot check out before ${minutesToTimeStr(requiredCheckout)}. Early checkout not allowed.`, action: "blocked", hoursWorked: 0, totalDeductionPercent: 0, incompleteTasks: 0 };
    }
    // Check tasks
    const tasks = await ctx.db.query("dailyTasks")
      .withIndex("by_employee_date", q => q.eq("employeeId", args.employeeId).eq("date", args.date)).collect();
    const pendingTasks = tasks.filter((t: any) => t.status === "pending");
    for (const task of pendingTasks) {
      await ctx.db.insert("salaryDeductions", {
        employeeId: args.employeeId, date: args.date, violationType: "incomplete_task", deductionPercent: 10,
        description: `Incomplete task: ${task.title} (${task.difficulty})`, appliedAt: Date.now(),
      });
    }
    // Calculate hours
    const checkInMins = parseTimeToMinutes(rec.checkInTime || "");
    const brks = await ctx.db.query("lunchBreaks")
      .withIndex("by_employee_date", q => q.eq("employeeId", args.employeeId).eq("date", args.date)).collect();
    const breakDur = brks[0]?.durationMinutes || 0;
    const totalWorkMins = currentMinutes - checkInMins - breakDur;
    const hoursWorked = Math.round((totalWorkMins / 60) * 100) / 100;
    if (totalWorkMins < 450 && !activePerm) {
      const missing = 450 - totalWorkMins;
      await ctx.db.insert("salaryDeductions", {
        employeeId: args.employeeId, date: args.date, violationType: "short_hours",
        deductionPercent: Math.min(Math.round((missing / 450) * 100 * 100) / 100, MAX_DAILY_DEDUCTION),
        description: `Worked ${hoursWorked}h (min 7.5h required)`, appliedAt: Date.now(),
      });
    }
    if (activePerm) await ctx.db.patch(activePerm._id, { status: "used", usedAt: Date.now() });
    const allDed = await ctx.db.query("salaryDeductions")
      .withIndex("by_employee_date", q => q.eq("employeeId", args.employeeId).eq("date", args.date)).collect();
    const totalDed = Math.min(allDed.reduce((s: any, d: any) => s + d.deductionPercent, 0), MAX_DAILY_DEDUCTION);
    await ctx.db.patch(rec._id, {
      checkOutTime: args.time, hoursWorked, totalDeductionPercent: totalDed,
      status: activePerm ? "permission" : rec.status,
      notes: activePerm ? `Early leave: ${activePerm.reason}` : pendingTasks.length > 0 ? `${pendingTasks.length} incomplete task(s)` : undefined,
      checkOutImageId: args.faceImageId,
      checkOutImageAccount: args.imageAccount || args.sharedAccountEmail,
      checkOutImageStorageType: args.imageStorageType || "convex",
      checkOutDeviceId: args.deviceId,
    });
    const emp = await ctx.db.get(args.employeeId);
    await ctx.db.insert("officeSessionLogs", {
      sharedAccountEmail: args.sharedAccountEmail, employeeId: args.employeeId,
      employeeName: `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim(),
      action: "check_out", timestamp: Date.now(), date: args.date,
      details: `Checked out. Hours: ${hoursWorked}h. Deductions: ${totalDed}%`,
      faceVerified: true,
      faceImageId: args.faceImageId,
      faceMatchConfidence: args.faceMatchConfidence,
    });
    return { success: true, action: "checkout", hoursWorked, totalDeductionPercent: totalDed, incompleteTasks: pendingTasks.length,
      message: totalDed > 0 ? `Checked out. ${hoursWorked}h worked. Deduction: ${totalDed}%` : `Checked out. ${hoursWorked}h worked. No deductions.` };
  },
});

export const requestLeaveFromOffice = mutation({
  args: {
    employeeId: v.id("employees"),
    leaveType: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    reason: v.string(),
    sharedAccountEmail: v.string(),
  },
  returns: v.object({ success: v.boolean(), message: v.string() }),
  handler: async (ctx, args) => {
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) return { success: false, message: "Employee not found" };

    // Check for duplicate pending requests on same dates
    const existing = await ctx.db.query("leaveRequests")
      .withIndex("by_employee", q => q.eq("employeeId", args.employeeId))
      .collect();
    const duplicate = existing.find(l =>
      l.startDate === args.startDate && l.endDate === args.endDate && l.status === "pending"
    );
    if (duplicate) return { success: false, message: "A pending leave request already exists for these dates" };

    await ctx.db.insert("leaveRequests", {
      employeeId: args.employeeId,
      companyId: employee.companyId,
      leaveType: args.leaveType,
      startDate: args.startDate,
      endDate: args.endDate,
      reason: args.reason,
      status: "pending",
    });

    await ctx.db.insert("officeSessionLogs", {
      sharedAccountEmail: args.sharedAccountEmail,
      employeeId: args.employeeId,
      employeeName: `${employee.firstName || ''} ${employee.lastName || ''}`.trim(),
      action: "leave_request",
      timestamp: Date.now(),
      date: args.startDate,
      details: `${args.leaveType} leave: ${args.startDate} to ${args.endDate}. Reason: ${args.reason}`,
    });

    return { success: true, message: "Leave request submitted successfully" };
  },
});

export const manuallyUpdateCheckInTime = mutation({
  args: {
    attendanceId: v.id("attendance"),
    newCheckInTime: v.string(),
  },
  returns: v.object({ success: v.boolean(), message: v.string(), newLateMinutes: v.optional(v.number()), newExtendedCheckoutTime: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const attendance = await ctx.db.get(args.attendanceId);
    if (!attendance) {
      return { success: false, message: "Attendance record not found" };
    }

    // Calculate new late minutes based on new check-in time
    const newCheckInMinutes = parseTimeToMinutes(args.newCheckInTime);
    const oldCheckInMinutes = parseTimeToMinutes(attendance.checkInTime);
    
    let newLateMinutes = 0;
    let newExtendedCheckoutTime: string | undefined;
    let newStatus = "present";
    
    if (newCheckInMinutes > SHIFT_START) {
      newLateMinutes = newCheckInMinutes - SHIFT_START;
      newStatus = "late";
      newExtendedCheckoutTime = minutesToTimeStr(SHIFT_END + newLateMinutes);
    }

    const oldLateMinutes = attendance.lateMinutes || 0;

    // Delete old late deduction if it exists
    if (oldLateMinutes > 0) {
      const oldDeductions = await ctx.db
        .query("salaryDeductions")
        .withIndex("by_employee_date", q =>
          q.eq("employeeId", attendance.employeeId).eq("date", attendance.date)
        )
        .collect();
      
      const lateDeduction = oldDeductions.find(d => d.violationType === "late_login");
      if (lateDeduction) {
        await ctx.db.delete(lateDeduction._id);
      }
    }

    // Create new late deduction if applicable
    if (newLateMinutes > 0) {
      await ctx.db.insert("salaryDeductions", {
        employeeId: attendance.employeeId,
        date: attendance.date,
        violationType: "late_login",
        deductionPercent: Math.min(
          Math.round((newLateMinutes / 480) * 100 * 100) / 100,
          MAX_DAILY_DEDUCTION
        ),
        description: `Late by ${newLateMinutes} minutes (manually corrected)`,
        appliedAt: Date.now(),
      });
    }

    // Update attendance record
    await ctx.db.patch(args.attendanceId, {
      checkInTime: args.newCheckInTime,
      lateMinutes: newLateMinutes,
      extendedCheckoutTime: newExtendedCheckoutTime,
      status: newStatus,
    });

    return {
      success: true,
      message: `Check-in time updated to ${args.newCheckInTime}. Late minutes: ${newLateMinutes}`,
      newLateMinutes,
      newExtendedCheckoutTime,
    };
  },
});

export const getOfficeDepartmentStats = query({
  args: { department: v.string() },
  handler: async (ctx, args) => {
    const today = new Date().toISOString().split('T')[0];
    const employees = await ctx.db.query("employees").collect();
    const deptEmps = employees.filter(e =>
      e.status === "active" && (e.department || "").toLowerCase() === args.department.toLowerCase()
    );
    const employeeIds = deptEmps.map(e => e._id.toString());
    const todayAttendance = await ctx.db.query("attendance").withIndex("by_date", q => q.eq("date", today)).collect();
    const deptAttendance = todayAttendance.filter(a => employeeIds.includes(a.employeeId.toString()));

    const presentIds = new Set<string>();
    const lateIds = new Set<string>();
    const permissionIds = new Set<string>();
    for (const a of deptAttendance) {
      const empId = a.employeeId.toString();
      if (a.status === "present") presentIds.add(empId);
      if (a.status === "late") lateIds.add(empId);
      if (a.status === "permission") permissionIds.add(empId);
    }
    const totalPresent = new Set([...presentIds, ...lateIds, ...permissionIds]).size;
    return {
      total: deptEmps.length,
      present: totalPresent,
      late: lateIds.size,
      permission: permissionIds.size,
      absent: Math.max(0, deptEmps.length - totalPresent),
    };
  },
});

export const getOfficeDashboard = query({
  args: { department: v.string() },
  handler: async (ctx, args) => {
    const today = new Date().toISOString().split('T')[0];
    const employees = await ctx.db.query("employees").collect();
    const deptEmps = employees.filter(e =>
      e.status === "active" && (e.department || "").toLowerCase() === args.department.toLowerCase()
    );
    const todayAttendance = await ctx.db.query("attendance").withIndex("by_date", q => q.eq("date", today)).collect();

    const results = [];
    for (const emp of deptEmps) {
      let faceImageUrl = null;
      if (emp.faceImageId) {
        faceImageUrl = await ctx.storage.getUrl(emp.faceImageId as any);
      }
      const rec = todayAttendance.find(a => a.employeeId.toString() === emp._id.toString());
      
      // Calculate lateMinutes dynamically based on current checkInTime
      const lateMinutes = rec?.checkInTime ? Math.max(0, parseTimeToMinutes(rec.checkInTime) - SHIFT_START) : 0;
      
      results.push({
        _id: emp._id,
        firstName: emp.firstName || emp.fullName?.split(" ")[0] || "",
        lastName: emp.lastName || emp.fullName?.split(" ").slice(1).join(" ") || "",
        department: emp.department,
        position: emp.position,
        faceImageUrl,
        checkInTime: rec?.checkInTime || null,
        checkOutTime: rec?.checkOutTime || null,
        status: rec?.status || "absent",
        lateMinutes,
        extendedCheckoutTime: rec?.extendedCheckoutTime || null,
        hoursWorked: rec?.hoursWorked || 0,
        totalDeductionPercent: rec?.totalDeductionPercent || 0,
      });
    }
    return results;
  },
});

export const getEmployeeLeaves = query({
  args: { employeeId: v.id("employees") },
  returns: v.array(v.object({
    _id: v.id("leaveRequests"),
    leaveType: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    reason: v.string(),
    status: v.string(),
  })),
  handler: async (ctx, args) => {
    const leaves = await ctx.db.query("leaveRequests")
      .withIndex("by_employee", q => q.eq("employeeId", args.employeeId))
      .collect();
    return leaves.map((l: any) => ({
      _id: l._id,
      leaveType: l.leaveType,
      startDate: l.startDate,
      endDate: l.endDate,
      reason: l.reason,
      status: l.status,
    })).sort((a: any, b: any) => b.startDate.localeCompare(a.startDate));
  },
});

export const checkAttendanceEligibility = query({
  args: {
    deviceId: v.string(),
    accountEmail: v.string(),
    employeeId: v.id("employees"),
  },
  returns: v.object({
    eligible: v.boolean(),
    reason: v.optional(v.string()),
    deviceName: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      const validation = await validateAttendanceAccess(ctx, {
        deviceId: args.deviceId,
        accountEmail: args.accountEmail,
        employeeId: args.employeeId.toString(),
        action: "check_eligibility",
      });

      if (!validation.allowed) {
        return {
          eligible: false,
          reason: validation.blockReason,
        };
      }

      // Get device info if available
      const device = await ctx.db
        .query("registeredDevices")
        .withIndex("by_device_id", (q: any) => q.eq("deviceId", args.deviceId))
        .first();

      return {
        eligible: true,
        deviceName: device?.deviceName,
      };
    } catch (error) {
      return {
        eligible: false,
        reason: "Unable to verify eligibility",
      };
    }
  },
});

export const getDeviceAccessLogs = query({
  args: { deviceId: v.string(), limit: v.optional(v.number()) },
  returns: v.array(v.object({
    _id: v.id("deviceAccessLogs"),
    accountEmail: v.string(),
    action: v.string(),
    allowed: v.boolean(),
    blockReason: v.optional(v.string()),
    timestamp: v.number(),
    date: v.string(),
  })),
  handler: async (ctx, args) => {
    const logs = await ctx.db.query("deviceAccessLogs")
      .withIndex("by_device", (q: any) => q.eq("deviceId", args.deviceId))
      .collect();
    
    return logs
      .sort((a: any, b: any) => b.timestamp - a.timestamp)
      .slice(0, args.limit || 50)
      .map((l: any) => ({
        _id: l._id,
        accountEmail: l.accountEmail,
        action: l.action,
        allowed: l.allowed,
        blockReason: l.blockReason,
        timestamp: l.timestamp,
        date: l.date,
      }));
  },
});