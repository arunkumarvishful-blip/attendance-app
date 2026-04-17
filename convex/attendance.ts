import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireAuth, requireAdminOrHR, requireAdminForDelete } from "./helpers";

const attendanceReturn = v.object({
_id: v.id("attendance"), _creationTime: v.number(),
employeeId: v.id("employees"), employeeName: v.optional(v.string()),
employeeFaceUrl: v.optional(v.string()),
department: v.optional(v.string()), companyId: v.optional(v.id("companies")),
date: v.string(), checkInTime: v.optional(v.string()),
checkOutTime: v.optional(v.string()), status: v.string(),
hoursWorked: v.optional(v.number()), overtimeHours: v.optional(v.number()),
checkInImageUrl: v.optional(v.string()), checkOutImageUrl: v.optional(v.string()),
notes: v.optional(v.string()),
shiftStartTime: v.optional(v.string()),
lateThresholdMinutes: v.optional(v.number()),
});

export const smartCheckInOut = mutation({
args: {
employeeId: v.id("employees"), proofImageId: v.optional(v.id("_storage")),
localDate: v.optional(v.string()), localTime: v.optional(v.string()),
},
returns: v.object({ action: v.string(), employeeName: v.string(), time: v.string() }),
handler: async (ctx, args) => {
await requireAuth(ctx);
const employee = await ctx.db.get(args.employeeId);
if (!employee) throw new Error("Employee not found");
const empName = employee.firstName ? `${employee.firstName} ${employee.lastName || ''}`.trim() : (employee.fullName || '');
const now = new Date();
const date = args.localDate || now.toISOString().split("T")[0];
const time = args.localTime || now.toTimeString().split(" ")[0].slice(0, 5);

const todayRecords = await ctx.db.query("attendance")
.withIndex("by_employee_and_date", (q: any) =>
q.eq("employeeId", args.employeeId).eq("date", date)).collect();
const openSession = todayRecords.find(r => r.checkInTime && !r.checkOutTime);

if (openSession) {
// Bug fix 1: handle both 12h AM/PM ("09:30 AM") and 24h ("17:30") time formats
const parseToHours = (t: string): number => {
  if (!t) return 0;
  const isPM = /pm/i.test(t);
  const isAM = /am/i.test(t);
  const clean = t.replace(/\s*(am|pm)/gi, '').trim();
  const parts = clean.split(':').map(Number);
  let h = parts[0] || 0;
  const m = parts[1] || 0;
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h + m / 60;
};
const hoursWorked = Math.max(0, parseToHours(time) - parseToHours(openSession.checkInTime!));
const company = employee.companyId ? await ctx.db.get(employee.companyId) : null;
const otThreshold = company?.overtimeThresholdHours ?? 8;
const overtimeHours = Math.max(0, hoursWorked - otThreshold);
const patchData: any = {
checkOutTime: time,
hoursWorked: Math.round(hoursWorked * 100) / 100,
overtimeHours: Math.round(overtimeHours * 100) / 100,
};
if (args.proofImageId) patchData.checkOutImageId = args.proofImageId;
await ctx.db.patch(openSession._id, patchData);

// Instant sync to Supabase
await ctx.scheduler.runAfter(
  0,
  internal.supabaseSync.syncToSupabase,
  {
    tableName: "attendance",
    recordId: args.employeeId.toString() + "_" + date,
    payload: {
      employee_name: empName,
      employee_email: employee.email,
      department: employee.department,
      date: date,
      check_in_time: openSession.checkInTime,
      check_out_time: time,
      status: openSession.status,
      hours_worked: Math.round(hoursWorked * 100) / 100,
      notes: null,
      synced_at: new Date().toISOString(),
    }
  }
);

return { action: "checkout", employeeName: empName, time };
} else {
let status = "present";
if (employee.shiftId) {
const shift = await ctx.db.get(employee.shiftId);
if (shift) {
const company = employee.companyId ? await ctx.db.get(employee.companyId) : null;
const threshold = company?.lateThresholdMinutes ?? 15;
// Bug fix 1: handle AM/PM format - shift.startTime is always 24h from DB, time may be 12h
const shiftParts = shift.startTime.replace(/\s*(am|pm)/gi,'').split(':').map(Number);
const timePM = /pm/i.test(time); const timeAM = /am/i.test(time);
const rawParts = time.replace(/\s*(am|pm)/gi,'').split(':').map(Number);
let tHour = rawParts[0] || 0; const tMin = rawParts[1] || 0;
if (timePM && tHour < 12) tHour += 12; if (timeAM && tHour === 12) tHour = 0;
if (tHour * 60 + tMin > shiftParts[0] * 60 + (shiftParts[1] || 0) + threshold) status = "late";
}
}
await ctx.db.insert("attendance", {
employeeId: args.employeeId, companyId: employee.companyId,
date, checkInTime: time, status,
checkInImageId: args.proofImageId,
});

return { action: "checkin", employeeName: empName, time };
}
},
});

export const getByDate = query({
args: { date: v.string(), companyId: v.optional(v.id("companies")), department: v.optional(v.string()), search: v.optional(v.string()) },
returns: v.array(attendanceReturn),
handler: async (ctx, args) => {
await requireAuth(ctx);
let records;
if (args.companyId) {
records = await ctx.db.query("attendance")
.withIndex("by_company_and_date", (q: any) =>
q.eq("companyId", args.companyId).eq("date", args.date)).collect();
} else {
records = await ctx.db.query("attendance")
.withIndex("by_date", (q: any) => q.eq("date", args.date)).collect();
}
const results = [];
for (const r of records) {
const emp = await ctx.db.get(r.employeeId);
if (!emp) continue;
if (args.department && emp.department !== args.department) continue;
if (args.search) {
const s = args.search.toLowerCase();
const empName = emp.firstName ? `${emp.firstName} ${emp.lastName || ''}`.trim() : (emp.fullName || '');
if (!empName.toLowerCase().includes(s) && !(emp.employeeId || "").toLowerCase().includes(s)) continue;
}
const ciUrl = r.checkInImageId ? await ctx.storage.getUrl(r.checkInImageId) : null;
const coUrl = r.checkOutImageId ? await ctx.storage.getUrl(r.checkOutImageId) : null;
const empFaceUrl = emp.faceImageId ? await ctx.storage.getUrl(emp.faceImageId) : null;
results.push({
_id: r._id, _creationTime: r._creationTime,
employeeId: r.employeeId, employeeName: emp.firstName ? `${emp.firstName} ${emp.lastName || ''}`.trim() : (emp.fullName || ''),
employeeFaceUrl: empFaceUrl ?? undefined,
department: emp.department, companyId: r.companyId,
date: r.date, checkInTime: r.checkInTime, checkOutTime: r.checkOutTime,
status: r.status, hoursWorked: r.hoursWorked, overtimeHours: r.overtimeHours,
checkInImageUrl: ciUrl ?? undefined, checkOutImageUrl: coUrl ?? undefined,
notes: r.notes,
});
}
return results;
},
});

// Delete attendance record (admin/superadmin only)
export const remove = mutation({
args: { id: v.id("attendance") },
returns: v.null(),
handler: async (ctx, args) => {
const user = await requireAdminForDelete(ctx);
const record = await ctx.db.get(args.id);
if (!record) throw new Error("Record not found");
// Audit log
await ctx.db.insert("auditLogs", {
action: "delete_attendance", entityType: "attendance",
entityId: args.id, userId: user._id,
details: `Deleted attendance for date ${record.date}`,
timestamp: Date.now(),
});
await ctx.db.delete(args.id);
return null;
},
});

export const getStats = query({
args: { date: v.optional(v.string()), companyId: v.optional(v.id("companies")) },
returns: v.object({ present: v.number(), late: v.number(), absent: v.number(), totalEmployees: v.number(), checkedOut: v.number() }),
handler: async (ctx, args) => {
await requireAuth(ctx);
const date = args.date ?? new Date().toISOString().split("T")[0];
let employees;
if (args.companyId) {
employees = await ctx.db.query("employees")
.withIndex("by_company", (q: any) => q.eq("companyId", args.companyId)).collect();
} else {
employees = await ctx.db.query("employees").collect();
}
const activeEmps = employees.filter(e => e.status === "active");
let records;
if (args.companyId) {
records = await ctx.db.query("attendance")
.withIndex("by_company_and_date", (q: any) =>
q.eq("companyId", args.companyId).eq("date", date)).collect();
} else {
records = await ctx.db.query("attendance")
.withIndex("by_date", (q: any) => q.eq("date", date)).collect();
}
const present = records.filter(r => r.status === "present").length;
const late = records.filter(r => r.status === "late").length;
const checkedOut = records.filter(r => r.checkOutTime).length;
return { present, late, absent: Math.max(0, activeEmps.length - records.length), totalEmployees: activeEmps.length, checkedOut };
},
});

// Monthly attendance analytics
export const getMonthlyAnalytics = query({
args: { month: v.number(), year: v.number(), companyId: v.optional(v.id("companies")) },
returns: v.object({
dailyBreakdown: v.array(v.object({
date: v.string(), present: v.number(), late: v.number(), absent: v.number(),
})),
employeeSummary: v.array(v.object({
employeeId: v.id("employees"), fullName: v.string(), department: v.string(),
presentDays: v.number(), lateDays: v.number(), absentDays: v.number(),
totalHours: v.number(), overtimeHours: v.number(),
})),
departmentBreakdown: v.array(v.object({
department: v.string(), totalEmployees: v.number(),
avgAttendance: v.number(), avgHours: v.number(),
})),
totalPresent: v.number(), totalLate: v.number(), totalAbsent: v.number(),
avgAttendanceRate: v.number(),
}),
handler: async (ctx, args) => {
await requireAuth(ctx);
let employees;
if (args.companyId) {
employees = await ctx.db.query("employees")
.withIndex("by_company", (q: any) => q.eq("companyId", args.companyId)).collect();
} else {
employees = await ctx.db.query("employees").collect();
}
const active = employees.filter(e => e.status === "active");
const totalDays = new Date(args.year, args.month, 0).getDate();

const dailyBreakdown = [];
const empStats: Record<string, { present: number; late: number; hours: number; ot: number }> = {};
for (const e of active) {
empStats[e._id] = { present: 0, late: 0, hours: 0, ot: 0 };
}

let totalPresent = 0, totalLate = 0, totalAbsent = 0;

for (let d = 1; d <= totalDays; d++) {
const dateStr = `${args.year}-${String(args.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const records = await ctx.db.query("attendance")
.withIndex("by_date", (q: any) => q.eq("date", dateStr)).collect();

// Filter by company if needed
const filtered = args.companyId
? records.filter(r => r.companyId === args.companyId)
: records;

let dayPresent = 0, dayLate = 0;
for (const r of filtered) {
if (empStats[r.employeeId]) {
if (r.status === "present") { dayPresent++; empStats[r.employeeId].present++; }
if (r.status === "late") { dayLate++; empStats[r.employeeId].late++; }
empStats[r.employeeId].hours += r.hoursWorked ?? 0;
empStats[r.employeeId].ot += r.overtimeHours ?? 0;
}
}
const dayAbsent = Math.max(0, active.length - dayPresent - dayLate);
dailyBreakdown.push({ date: dateStr, present: dayPresent, late: dayLate, absent: dayAbsent });
totalPresent += dayPresent;
totalLate += dayLate;
totalAbsent += dayAbsent;
}

const employeeSummary = active.map(e => ({
employeeId: e._id, fullName: e.firstName ? `${e.firstName} ${e.lastName || ''}`.trim() : (e.fullName || ''), department: e.department,
presentDays: empStats[e._id]?.present ?? 0,
lateDays: empStats[e._id]?.late ?? 0,
absentDays: totalDays - (empStats[e._id]?.present ?? 0) - (empStats[e._id]?.late ?? 0),
totalHours: Math.round((empStats[e._id]?.hours ?? 0) * 100) / 100,
overtimeHours: Math.round((empStats[e._id]?.ot ?? 0) * 100) / 100,
}));

// Department breakdown
const deptMap: Record<string, { total: number; attendance: number; hours: number }> = {};
for (const e of active) {
if (!deptMap[e.department]) deptMap[e.department] = { total: 0, attendance: 0, hours: 0 };
deptMap[e.department].total++;
deptMap[e.department].attendance += (empStats[e._id]?.present ?? 0) + (empStats[e._id]?.late ?? 0);
deptMap[e.department].hours += empStats[e._id]?.hours ?? 0;
}
const departmentBreakdown = Object.entries(deptMap).map(([dept, data]) => ({
department: dept, totalEmployees: data.total,
avgAttendance: data.total > 0 ? Math.round((data.attendance / (data.total * totalDays)) * 100) : 0,
avgHours: data.total > 0 ? Math.round((data.hours / data.total) * 100) / 100 : 0,
}));

const totalPossible = active.length * totalDays;
const avgAttendanceRate = totalPossible > 0
? Math.round(((totalPresent + totalLate) / totalPossible) * 100) : 0;

return { dailyBreakdown, employeeSummary, departmentBreakdown, totalPresent, totalLate, totalAbsent, avgAttendanceRate };
},
});

export const getEmployeeSessions = query({
args: { employeeId: v.id("employees"), date: v.string() },
returns: v.array(v.object({
_id: v.id("attendance"), checkInTime: v.optional(v.string()),
checkOutTime: v.optional(v.string()), status: v.string(),
hoursWorked: v.optional(v.number()),
})),
handler: async (ctx, args) => {
await requireAuth(ctx);
const records = await ctx.db.query("attendance")
.withIndex("by_employee_and_date", (q: any) =>
q.eq("employeeId", args.employeeId).eq("date", args.date)).collect();
return records.map(r => ({
_id: r._id, checkInTime: r.checkInTime, checkOutTime: r.checkOutTime,
status: r.status, hoursWorked: r.hoursWorked,
}));
},
});

export const getStorageUrl = query({
  args: { storageId: v.id("_storage") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const generateUploadUrl = mutation({
args: {},
returns: v.string(),
handler: async (ctx) => {
await requireAuth(ctx);
return await ctx.storage.generateUploadUrl();
},
});

// Employee can get their own attendance
export const getMyAttendance = query({
  args: { employeeId: v.id("employees"), month: v.optional(v.number()), year: v.optional(v.number()) },
  returns: v.array(attendanceReturn),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const records = await ctx.db.query("attendance")
      .withIndex("by_employee_and_date", (q: any) => q.eq("employeeId", args.employeeId))
      .collect();
    const results = [];
    for (const r of records) {
      // Filter by month/year if provided
      if (args.month && args.year) {
        const [y, m] = r.date.split("-").map(Number);
        if (y !== args.year || m !== args.month) continue;
      }
      const emp = await ctx.db.get(r.employeeId);
      if (!emp) continue;
      const ciUrl = r.checkInImageId ? await ctx.storage.getUrl(r.checkInImageId) : null;
      const coUrl = r.checkOutImageId ? await ctx.storage.getUrl(r.checkOutImageId) : null;
      const empFaceUrl = emp.faceImageId ? await ctx.storage.getUrl(emp.faceImageId) : null;
      
      // Get shift and threshold info
      let shiftStartTime: string | undefined;
      let lateThresholdMinutes: number | undefined;
      
      if (emp.shiftId) {
        const shift = await ctx.db.get(emp.shiftId);
        if (shift) shiftStartTime = shift.startTime;
      }
      
      if (emp.companyId) {
        const company = await ctx.db.get(emp.companyId);
        if (company) lateThresholdMinutes = company.lateThresholdMinutes;
      }
      
      results.push({
        _id: r._id, _creationTime: r._creationTime,
        employeeId: r.employeeId, employeeName: emp.firstName ? `${emp.firstName} ${emp.lastName || ''}`.trim() : (emp.fullName || ''),
        employeeFaceUrl: empFaceUrl ?? undefined,
        department: emp.department, companyId: r.companyId,
        date: r.date, checkInTime: r.checkInTime, checkOutTime: r.checkOutTime,
        status: r.status, hoursWorked: r.hoursWorked, overtimeHours: r.overtimeHours,
        checkInImageUrl: ciUrl ?? undefined, checkOutImageUrl: coUrl ?? undefined,
        notes: r.notes, shiftStartTime, lateThresholdMinutes,
      });
    }
    return results.sort((a, b) => b.date.localeCompare(a.date));
  },
});

// Employee: get today's attendance record
export const getMyTodayAttendance = query({
  args: { employeeId: v.id("employees"), date: v.string() },
  returns: v.union(v.object({
    status: v.string(),
    checkInTime: v.optional(v.string()),
    checkOutTime: v.optional(v.string()),
  }), v.null()),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const record = await ctx.db.query("attendance")
      .withIndex("by_employee_and_date", (q: any) => q.eq("employeeId", args.employeeId).eq("date", args.date))
      .unique();
    if (!record) return null;
    return { status: record.status, checkInTime: record.checkInTime, checkOutTime: record.checkOutTime };
  },
});

// Employee: get monthly attendance summary + last 7 days
export const getMyMonthSummary = query({
  args: { employeeId: v.id("employees"), monthPrefix: v.string() },
  returns: v.object({
    present: v.number(),
    late: v.number(),
    absent: v.number(),
    total: v.number(),
    last7days: v.array(v.object({ date: v.string(), status: v.optional(v.string()) })),
  }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const records = await ctx.db.query("attendance")
      .withIndex("by_employee_and_date", (q: any) => q.eq("employeeId", args.employeeId))
      .collect();
    const monthRecords = records.filter((r: any) => r.date.startsWith(args.monthPrefix));
    const present = monthRecords.filter((r: any) => r.status === "present").length;
    const late = monthRecords.filter((r: any) => r.status === "late").length;
    const absent = monthRecords.filter((r: any) => r.status === "absent").length;
    const last7days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const rec = records.find((r: any) => r.date === dateStr);
      last7days.push({ date: dateStr, status: rec?.status });
    }
    return { present, late, absent, total: monthRecords.length, last7days };
  },
});

// Employee: get attendance records for a specific month
export const getMyAttendanceByMonth = query({
  args: { employeeId: v.id("employees"), monthPrefix: v.string() },
  returns: v.array(v.object({
    _id: v.id("attendance"),
    date: v.string(),
    status: v.string(),
    checkInTime: v.optional(v.string()),
    checkOutTime: v.optional(v.string()),
    hoursWorked: v.optional(v.number()),
  })),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const records = await ctx.db.query("attendance")
      .withIndex("by_employee_and_date", (q: any) => q.eq("employeeId", args.employeeId))
      .collect();
    return records
      .filter((r: any) => r.date.startsWith(args.monthPrefix))
      .map((r: any) => ({
        _id: r._id,
        date: r.date,
        status: r.status,
        checkInTime: r.checkInTime,
        checkOutTime: r.checkOutTime,
        hoursWorked: r.hoursWorked,
      }))
      .sort((a: any, b: any) => b.date.localeCompare(a.date));
  },
});

export const selfCheckIn = mutation({
  args: { employeeId: v.id("employees"), date: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.query("attendance")
      .withIndex("by_employee_and_date", (q: any) => q.eq("employeeId", args.employeeId).eq("date", args.date))
      .unique();
    if (existing) throw new Error("Already checked in today");
    const now = new Date();
    const checkInTime = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const employee = await ctx.db.get(args.employeeId);
    let status = "present";
    if (employee?.shiftId) {
      const shift = await ctx.db.get(employee.shiftId);
      if (shift?.startTime) {
        const [sh, sm] = shift.startTime.split(':').map(Number);
        const shiftStart = sh * 60 + sm;
        const nowMins = now.getHours() * 60 + now.getMinutes();
        const company = employee.companyId ? await ctx.db.get(employee.companyId) : null;
        const lateThreshold = company?.lateThresholdMinutes || 15;
        if (nowMins > shiftStart + lateThreshold) status = "late";
      }
    }
    await ctx.db.insert("attendance", {
      employeeId: args.employeeId,
      companyId: employee?.companyId,
      date: args.date,
      checkInTime,
      status,
    });
    return null;
  },
});

export const selfCheckOut = mutation({
  args: { employeeId: v.id("employees"), date: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.query("attendance")
      .withIndex("by_employee_and_date", (q: any) => q.eq("employeeId", args.employeeId).eq("date", args.date))
      .unique();
    if (!existing) throw new Error("No check-in record found for today");
    if (existing.checkOutTime) throw new Error("Already checked out today");
    const now = new Date();
    const checkOutTime = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    let hoursWorked: number | undefined;
    if (existing.checkInTime) {
      const parseTime = (t: string) => {
        const [time, period] = t.split(' ');
        let [h, m] = time.split(':').map(Number);
        if (period === 'PM' && h !== 12) h += 12;
        if (period === 'AM' && h === 12) h = 0;
        return h * 60 + m;
      };
      hoursWorked = Math.round(((parseTime(checkOutTime) - parseTime(existing.checkInTime)) / 60) * 10) / 10;
    }
    await ctx.db.patch(existing._id, { checkOutTime, hoursWorked });
    return null;
  },
});

export const employeeFaceScanAttendance = mutation({
  args: {
    employeeId: v.id("employees"),
    date: v.string(),
    photoStorageId: v.optional(v.id("_storage")),
    timezoneOffset: v.optional(v.number()),
    deviceId: v.optional(v.string()), // Device capturing the image
    imageAccount: v.optional(v.string()), // "office@gmail.com" or "employee@gmail.com" etc.
    imageStorageType: v.optional(v.string()), // "convex" (default) or other storage type
  },
  returns: v.object({ message: v.string(), status: v.string() }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    // VALIDATION: Image must be provided for attendance
    if (!args.photoStorageId) {
      throw new Error("Image upload failed: Cannot proceed without verified image. Please try again.");
    }

    // VALIDATION: Verify the image actually exists in storage
    try {
      const imageBlob = await ctx.storage.get(args.photoStorageId);
      if (!imageBlob) {
        throw new Error("Image upload failed: Image file not found in storage. Please retake the photo and try again.");
      }
    } catch (storageErr: any) {
      const msg = storageErr?.message || '';
      if (msg.includes('not found')) {
        throw new Error("Image upload failed: Photo could not be verified. Please try again.");
      }
      throw storageErr;
    }

    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error("Employee not found");

    // ===========================
    // STEP 1 — LEAVE CHECK FIRST
    // ===========================
    const allLeaves = await ctx.db.query("leaveRequests")
      .withIndex("by_employee", (q: any) =>
        q.eq("employeeId", args.employeeId))
      .collect();

    const now = new Date();
    const offsetMs = (args.timezoneOffset ?? 0) * 60 * 1000;
    const localNow = new Date(now.getTime() - offsetMs);

    const formatTime = (date: Date) => {
      let hours = date.getUTCHours();
      const minutes = date.getUTCMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const minuteStr = minutes < 10 ? '0' + minutes : String(minutes);
      return `${hours}:${minuteStr} ${ampm}`;
    };

    const formatDateStr = (date: Date) => {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const timeStr = formatTime(localNow);
    const attendanceDate = formatDateStr(localNow);

    // Hard block — approved leave found
    const approvedLeave = allLeaves.find((leave: any) => {
      if (leave.status !== "approved") return false;
      return attendanceDate >= leave.startDate &&
             attendanceDate <= leave.endDate;
    });

    if (approvedLeave) {
      // Auto mark absent if not already done
      const existingRecord = await ctx.db.query("attendance")
        .withIndex("by_employee_and_date", (q: any) =>
          q.eq("employeeId", args.employeeId).eq("date", attendanceDate))
        .unique();

      if (!existingRecord) {
        await ctx.db.insert("attendance", {
          employeeId: args.employeeId,
          companyId: employee.companyId,
          date: attendanceDate,
          status: "absent",
          notes: `On approved ${approvedLeave.leaveType} leave`,
        });
      }

      // Hard throw — cannot proceed with face scan
      throw new Error(
        `LEAVE_BLOCKED:${approvedLeave.leaveType}:${approvedLeave.startDate}:${approvedLeave.endDate}`
      );
    }

    // ===========================
    // STEP 2 — NORMAL ATTENDANCE
    // ===========================
    const existing = await ctx.db.query("attendance")
      .withIndex("by_employee_and_date", (q: any) =>
        q.eq("employeeId", args.employeeId).eq("date", attendanceDate))
      .unique();

    // CHECK OUT
    if (existing && existing.checkInTime && !existing.checkOutTime) {
      const parseTime = (t: string) => {
        const clean = t.trim();
        const [timePart, period] = clean.split(' ');
        let [h, m] = timePart.split(':').map(Number);
        if (period === 'PM' && h !== 12) h += 12;
        if (period === 'AM' && h === 12) h = 0;
        return h * 60 + m;
      };
      const inMins = parseTime(existing.checkInTime);
      const outMins = parseTime(timeStr);
      const diff = outMins >= inMins
        ? outMins - inMins
        : (outMins + 1440) - inMins;
      const hoursWorked = Math.round((diff / 60) * 10) / 10;

      // VALIDATION: Check working hours are valid (not negative, not zero, same date)
      if (hoursWorked < 0.25) {
        throw new Error("Cannot checkout: Working hours must be at least 15 minutes. Check times are invalid.");
      }

      await ctx.db.patch(existing._id, {
        checkOutTime: timeStr,
        hoursWorked,
        checkOutImageId: args.photoStorageId,
        checkOutImageAccount: args.imageAccount,
        checkOutImageStorageType: args.imageStorageType || "convex",
        checkOutDeviceId: args.deviceId,
      });

      const admins = await ctx.db.query("users")
        .withIndex("by_role", (q: any) => q.eq("role", "superadmin"))
        .collect();
      for (const admin of admins) {
        await ctx.db.insert("notifications", {
          userId: admin._id,
          title: "Employee Checked Out",
          message: `${employee.firstName} ${employee.lastName || ''} checked out at ${timeStr}. Hours: ${hoursWorked}h`,
          type: "attendance",
          read: false,
          createdAt: Date.now(),
        });
      }

      return {
        message: `✓ Checked out at ${timeStr}\nHours worked: ${hoursWorked}h`,
        status: "checkout",
      };
    }

    if (existing && existing.checkOutTime) {
      throw new Error("Attendance already completed for today. See you tomorrow!");
    }

    // CHECK IN
    let status = "present";
    if (employee.shiftId) {
      const shift = await ctx.db.get(employee.shiftId);
      if (shift?.startTime) {
        const [sh, sm] = shift.startTime.split(':').map(Number);
        const shiftStartMins = sh * 60 + sm;
        const nowMins = localNow.getUTCHours() * 60 + localNow.getUTCMinutes();
        const company = employee.companyId
          ? await ctx.db.get(employee.companyId)
          : null;
        const lateThreshold = company?.lateThresholdMinutes ?? 15;
        if (nowMins > shiftStartMins + lateThreshold) status = "late";
      }
    }

    await ctx.db.insert("attendance", {
      employeeId: args.employeeId,
      companyId: employee.companyId,
      date: attendanceDate,
      checkInTime: timeStr,
      status,
      checkInImageId: args.photoStorageId,
      checkInImageAccount: args.imageAccount,
      checkInImageStorageType: args.imageStorageType || "convex",
      checkInDeviceId: args.deviceId,
    });

    const admins = await ctx.db.query("users")
      .withIndex("by_role", (q: any) => q.eq("role", "superadmin"))
      .collect();
    for (const admin of admins) {
      await ctx.db.insert("notifications", {
        userId: admin._id,
        title: status === 'late' ? "⚠ Late Check In" : "✓ Employee Checked In",
        message: `${employee.firstName} ${employee.lastName || ''} checked in at ${timeStr}${status === 'late' ? ' — LATE' : ''}`,
        type: "attendance",
        read: false,
        createdAt: Date.now(),
      });
    }

    return {
      message: `✓ Checked in at ${timeStr}${status === 'late' ? '\n⚠ Marked as Late' : '\n✓ Marked as Present'}`,
      status: "checkin",
    };
  },
});

export const checkLeaveForDate = query({
  args: {
    employeeId: v.id("employees"),
    date: v.string(),
  },
  returns: v.union(
    v.object({
      hasLeave: v.literal(true),
      leaveType: v.string(),
      startDate: v.string(),
      endDate: v.string(),
      status: v.string(),
    }),
    v.object({
      hasLeave: v.literal(false),
    })
  ),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const allLeaves = await ctx.db.query("leaveRequests")
      .withIndex("by_employee", (q: any) => q.eq("employeeId", args.employeeId))
      .collect();

    const leaveToday = allLeaves.find((leave: any) => {
      if (leave.status !== "approved") return false;
      return args.date >= leave.startDate && args.date <= leave.endDate;
    });

    if (leaveToday) {
      return {
        hasLeave: true as const,
        leaveType: leaveToday.leaveType,
        startDate: leaveToday.startDate,
        endDate: leaveToday.endDate,
        status: leaveToday.status,
      };
    }

    return { hasLeave: false as const };
  },
});

export const autoMarkLeaveAbsent = mutation({
  args: {
    employeeId: v.id("employees"),
    date: v.string(),
  },
  returns: v.object({
    blocked: v.boolean(),
    reason: v.optional(v.string()),
    leaveType: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    // Check approved leave for this date
    const allLeaves = await ctx.db.query("leaveRequests")
      .withIndex("by_employee", (q: any) =>
        q.eq("employeeId", args.employeeId))
      .collect();

    const approvedLeave = allLeaves.find((leave: any) => {
      if (leave.status !== "approved") return false;
      return args.date >= leave.startDate && args.date <= leave.endDate;
    });

    if (!approvedLeave) {
      return { blocked: false };
    }

    // Check if attendance already exists for today
    const existing = await ctx.db.query("attendance")
      .withIndex("by_employee_and_date", (q: any) =>
        q.eq("employeeId", args.employeeId).eq("date", args.date))
      .unique();

    // Auto insert absent record if not already marked
    if (!existing) {
      const employee = await ctx.db.get(args.employeeId);
      await ctx.db.insert("attendance", {
        employeeId: args.employeeId,
        companyId: employee?.companyId,
        date: args.date,
        status: "absent",
        notes: `On approved ${approvedLeave.leaveType} leave`,
      });
    } else if (existing.status !== "absent") {
      await ctx.db.patch(existing._id, {
        status: "absent",
        notes: `On approved ${approvedLeave.leaveType} leave`,
        checkInTime: undefined,
        checkOutTime: undefined,
      });
    }

    return {
      blocked: true,
      reason: `You are on approved ${approvedLeave.leaveType} leave from ${approvedLeave.startDate} to ${approvedLeave.endDate}. Attendance marked as Absent automatically.`,
      leaveType: approvedLeave.leaveType,
    };
  },
});

export const getAllForExport = query({
  args: { monthPrefix: v.optional(v.string()) },
  returns: v.array(v.object({
    _id: v.id("attendance"),
    employeeName: v.optional(v.string()),
    employeeEmail: v.optional(v.string()),
    department: v.optional(v.string()),
    date: v.string(),
    checkInTime: v.optional(v.string()),
    checkOutTime: v.optional(v.string()),
    status: v.string(),
    hoursWorked: v.optional(v.number()),
    notes: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    let records = await ctx.db.query("attendance").collect();
    if (args.monthPrefix) {
      records = records.filter((r: any) => r.date.startsWith(args.monthPrefix));
    }
    const results = [];
    for (const r of records) {
      const emp = await ctx.db.get(r.employeeId);
      results.push({
        _id: r._id,
        employeeName: emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim() : '',
        employeeEmail: emp?.email || '',
        department: emp?.department || '',
        date: r.date,
        checkInTime: r.checkInTime,
        checkOutTime: r.checkOutTime,
        status: r.status,
        hoursWorked: r.hoursWorked,
        notes: r.notes,
      });
    }
    return results.sort((a: any, b: any) => b.date.localeCompare(a.date));
  },
});

// Auto-complete checkout at midnight for employees with incomplete sessions
export const autoCompleteCheckoutAtMidnight = mutation({
  args: {},
  returns: v.object({
    processed: v.number(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    // Get yesterday's date
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    // Find all attendance records from yesterday with checkInTime but NO checkOutTime
    const allRecords = await ctx.db.query("attendance")
      .withIndex("by_date", (q: any) => q.eq("date", yesterdayStr))
      .collect();

    const incompleteRecords = allRecords.filter((r: any) => r.checkInTime && !r.checkOutTime);

    let processedCount = 0;

    for (const record of incompleteRecords) {
      try {
        // Get employee and company info
        const employee = await ctx.db.get(record.employeeId);
        if (!employee) continue;

        const company = employee.companyId ? await ctx.db.get(employee.companyId) : null;
        const overtimeThreshold = company?.overtimeThresholdHours ?? 8;

        // Parse check-in time
        const parseTime = (t: string) => {
          const clean = t.trim();
          const [timePart, period] = clean.split(' ');
          let [h, m] = timePart.split(':').map(Number);
          if (period === 'PM' && h !== 12) h += 12;
          if (period === 'AM' && h === 12) h = 0;
          return h * 60 + m;
        };

        const checkInMins = parseTime(record.checkInTime);
        // Auto checkout at 23:59 (1439 minutes)
        const checkOutMins = 23 * 60 + 59;
        const diffMins = checkOutMins >= checkInMins
          ? checkOutMins - checkInMins
          : (checkOutMins + 1440) - checkInMins;

        const hoursWorked = Math.round((diffMins / 60) * 100) / 100;
        const overtimeHours = Math.max(0, hoursWorked - overtimeThreshold);

        // Update the attendance record
        await ctx.db.patch(record._id, {
          checkOutTime: "11:59 PM",
          hoursWorked: hoursWorked,
          overtimeHours: Math.round(overtimeHours * 100) / 100,
          notes: (record.notes || '') + (record.notes ? ' | ' : '') + 'Auto-completed at midnight (no manual checkout)',
        });

        processedCount++;
      } catch (e) {
        console.error("Error auto-completing checkout:", e);
      }
    }

    return {
      processed: processedCount,
      message: `Auto-completed ${processedCount} incomplete checkout(s) from ${yesterdayStr}`,
    };
  },
});