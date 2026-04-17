import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Get storage URL - used by actions that can't reliably call ctx.storage.getUrl()
export const getStorageUrl = internalQuery({
  args: { storageId: v.id("_storage") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

// Get all AWS face mappings
export const getAwsFaceMappings = internalQuery({
args: {},
returns: v.array(v.object({
_id: v.id("awsFaceMappings"),
employeeId: v.id("employees"),
awsFaceId: v.string(),
})),
handler: async (ctx) => {
const mappings = await ctx.db.query("awsFaceMappings").collect();
return mappings.map(m => ({
_id: m._id,
employeeId: m.employeeId,
awsFaceId: m.awsFaceId,
}));
},
});

// Save a new face mapping
export const saveAwsFaceMapping = internalMutation({
args: {
employeeId: v.id("employees"),
awsFaceId: v.string(),
},
returns: v.null(),
handler: async (ctx, args) => {
await ctx.db.insert("awsFaceMappings", {
employeeId: args.employeeId,
awsFaceId: args.awsFaceId,
});
return null;
},
});

// Delete face mapping for an employee
export const deleteAwsFaceMapping = internalMutation({
args: {
employeeId: v.id("employees"),
},
returns: v.null(),
handler: async (ctx, args) => {
const existing = await ctx.db.query("awsFaceMappings")
.withIndex("by_employee", (q) => q.eq("employeeId", args.employeeId))
.first();
if (existing) {
await ctx.db.delete(existing._id);
}
return null;
},
});

// Get active employees for name lookup
export const getEmployeeFaces = internalQuery({
args: {},
returns: v.array(v.object({
_id: v.id("employees"),
firstName: v.optional(v.string()),
lastName: v.optional(v.string()),
department: v.optional(v.string()),
companyId: v.optional(v.id("companies")),
shiftId: v.optional(v.id("shifts")),
})),
handler: async (ctx) => {
const employees = await ctx.db.query("employees").collect();
return employees
.filter(e => e.status === "active")
.map(e => ({
_id: e._id,
firstName: e.firstName || (e.fullName as string | undefined)?.split(" ")[0] || "",
lastName: e.lastName || (e.fullName as string | undefined)?.split(" ").slice(1).join(" ") || undefined,
department: e.department || undefined,
companyId: e.companyId,
shiftId: e.shiftId,
}));
},
});

// Helper: parse "9:42 AM" or "17:30" to total minutes since midnight
function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const cleaned = timeStr.trim();
  const isPM = /pm/i.test(cleaned);
  const isAM = /am/i.test(cleaned);
  // Remove AM/PM and any non-breaking spaces
  const timePart = cleaned.replace(/\s*(am|pm|\u202f)/gi, '').trim();
  const parts = timePart.split(':').map(Number);
  let hours = parts[0] || 0;
  const mins = parts[1] || 0;
  
  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;
  
  return hours * 60 + mins;
}

// Internal mutation to mark attendance (called from action)
export const markAttendanceInternal = internalMutation({
args: {
employeeId: v.id("employees"),
proofImageId: v.optional(v.id("_storage")),
localDate: v.string(),
localTime: v.string(),
allowedDepartments: v.optional(v.array(v.string())),
accountEmail: v.optional(v.string()),
deviceId: v.optional(v.string()),
},
returns: v.object({ action: v.string(), status: v.string(), requiredTime: v.optional(v.string()) }),
handler: async (ctx, args) => {
const employee = await ctx.db.get(args.employeeId);
if (!employee) throw new Error("Employee not found");

// IMAGE VALIDATION: Verify image exists if provided
if (args.proofImageId) {
  try {
    const imageUrl = await ctx.storage.getUrl(args.proofImageId);
    if (!imageUrl) {
      throw new Error("Image upload failed: Image file not found in storage. Please retake the photo and try again.");
    }
  } catch (storageErr: any) {
    const msg = storageErr?.message || '';
    if (msg.includes('not found')) {
      throw new Error("Image upload failed: Photo could not be verified. Please try again.");
    }
    throw storageErr;
  }
}

// SAFETY CHECK: Validate department before recording any attendance
if (args.allowedDepartments && args.allowedDepartments.length > 0) {
  const normalizedAllowed = args.allowedDepartments.map(d => d.toLowerCase().trim());
  const empDept = (employee.department || "").toLowerCase().trim();
  if (!normalizedAllowed.includes(empDept)) {
    throw new Error(
      `Access denied: Employee ${employee.firstName || ""} ${employee.lastName || ""} from department "${employee.department}" is not authorized. Only [${args.allowedDepartments.join(", ")}] allowed.`
    );
  }
}

const todayRecords = await ctx.db
.query("attendance")
.withIndex("by_employee_and_date", (q) =>
q.eq("employeeId", args.employeeId).eq("date", args.localDate)
)
.collect();

// GUARD 1: Already completed for today (has both check-in and check-out)
const completedSession = todayRecords.find(
  (r) => r.checkInTime && r.checkOutTime
);
if (completedSession) {
  return { action: "completed", status: "done" };
}

// GUARD 2: Duplicate scan protection — block if check-in within last 2 minutes
const lastRecord = todayRecords[todayRecords.length - 1];
if (lastRecord) {
  const recordCreatedAt = lastRecord._creationTime;
  const now = Date.now();
  const twoMinutes = 2 * 60 * 1000;
  if (now - recordCreatedAt < twoMinutes && lastRecord.checkInTime && !lastRecord.checkOutTime) {
    return { action: "duplicate", status: "blocked" };
  }
}

const openSession = todayRecords.find(
  (r) => r.checkInTime && !r.checkOutTime
);

if (openSession) {
// Check out — only allowed after extended checkout time OR with early leave permission
const nowMins = parseTimeToMinutes(args.localTime);

// Determine shift end time — use extended time if employee was late
let shiftEndMins = 17 * 60 + 30; // Default: 5:30 PM = 1050 minutes
if (employee.shiftId) {
  const shift = await ctx.db.get(employee.shiftId);
  if (shift && shift.endTime) {
    shiftEndMins = parseTimeToMinutes(shift.endTime);
  }
}

// If employee was late, use their extended checkout time instead
if (openSession.extendedCheckoutTime) {
  shiftEndMins = parseTimeToMinutes(openSession.extendedCheckoutTime);
}

// Check for early leave permission BEFORE blocking
if (nowMins < shiftEndMins) {
  const permission = await ctx.db
    .query("earlyLeavePermissions")
    .withIndex("by_employee_and_date", (q) =>
      q.eq("employeeId", args.employeeId).eq("date", args.localDate)
    )
    .first();

  if (permission && permission.status === "active") {
    // Permission granted — allow early checkout
    const ciMins = parseTimeToMinutes(openSession.checkInTime!);
    const coMins = nowMins;
    const hoursWorked = Math.max(0, (coMins - ciMins) / 60);

    await ctx.db.patch(openSession._id, {
      checkOutTime: args.localTime,
      ...(args.proofImageId ? { checkOutImageId: args.proofImageId } : {}),
      ...(args.accountEmail ? { checkOutImageAccount: args.accountEmail } : {}),
      ...(args.deviceId ? { checkOutDeviceId: args.deviceId } : {}),
      hoursWorked: Math.round(hoursWorked * 100) / 100,
      overtimeHours: 0,
      status: "permission",
      notes: `Early leave: ${permission.reason}`,
    });

    // Mark permission as used
    await ctx.db.patch(permission._id, {
      status: "used",
      usedAt: Date.now(),
    });

    return { action: "checkout", status: "permission" };
  }

  // No permission — block checkout before extended shift end
  // Bug fix 4: fixed noon (12:xx PM) displaying as 0:xx PM
  const reqHours = Math.floor(shiftEndMins / 60);
  const reqMins = shiftEndMins % 60;
  const period = reqHours >= 12 ? 'PM' : 'AM';
  const displayHour = reqHours === 0 ? 12 : reqHours > 12 ? reqHours - 12 : reqHours;
  const requiredTime = `${displayHour}:${reqMins.toString().padStart(2, '0')} ${period}`;
  
  return { action: "too_early", status: "warning", requiredTime };
}

// Proceed with checkout after shift end time
const ciMins = parseTimeToMinutes(openSession.checkInTime!);
const coMins = nowMins;
const hoursWorked = Math.max(0, (coMins - ciMins) / 60);

const company = employee.companyId ? await ctx.db.get(employee.companyId) : null;
const otThreshold = company?.overtimeThresholdHours ?? 8;
const overtimeHours = Math.max(0, hoursWorked - otThreshold);

await ctx.db.patch(openSession._id, {
checkOutTime: args.localTime,
...(args.proofImageId ? { checkOutImageId: args.proofImageId } : {}),
...(args.accountEmail ? { checkOutImageAccount: args.accountEmail } : {}),
...(args.deviceId ? { checkOutDeviceId: args.deviceId } : {}),
hoursWorked: Math.round(hoursWorked * 100) / 100,
overtimeHours: Math.round(overtimeHours * 100) / 100,
});
return { action: "checkout", status: openSession.status || "present" };
} else {
// Check in — determine late status
let status = "present";
const nowMins = parseTimeToMinutes(args.localTime);
let lateMinutes = 0;
let extendedCheckoutTime: string | undefined = undefined;

// Determine shift start and end times
let shiftStartMins = 9 * 60 + 30; // Default: 9:30 AM
let shiftEndMins = 17 * 60 + 30; // Default: 5:30 PM
let lateThreshold = 0; // Default: no grace period

if (employee.shiftId) {
  // Use assigned shift
  const shift = await ctx.db.get(employee.shiftId);
  if (shift) {
    const company = employee.companyId ? await ctx.db.get(employee.companyId) : null;
    lateThreshold = company?.lateThresholdMinutes ?? 15;
    shiftStartMins = parseTimeToMinutes(shift.startTime);
    if (shift.endTime) {
      shiftEndMins = parseTimeToMinutes(shift.endTime);
    }
  }
}

// Calculate late minutes and extended checkout time
if (nowMins > shiftStartMins + lateThreshold) {
  status = "late";
  lateMinutes = nowMins - shiftStartMins;
  // Extend checkout time by the late amount
  const extendedMins = shiftEndMins + lateMinutes;
  const extHours = Math.floor(extendedMins / 60);
  const extMins = extendedMins % 60;
  const period = extHours >= 12 ? 'PM' : 'AM';
  // Bug fix 4: fixed noon (12:xx PM) displaying as 0:xx PM
  const displayHour = extHours === 0 ? 12 : extHours > 12 ? extHours - 12 : extHours;
  extendedCheckoutTime = `${displayHour}:${extMins.toString().padStart(2, '0')} ${period}`;
}

await ctx.db.insert("attendance", {
employeeId: args.employeeId,
companyId: employee.companyId,
date: args.localDate,
checkInTime: args.localTime,
...(args.proofImageId ? { checkInImageId: args.proofImageId } : {}),
...(args.accountEmail ? { checkInImageAccount: args.accountEmail } : {}),
...(args.deviceId ? { checkInDeviceId: args.deviceId } : {}),
status,
source: "face_recognition",
markedBy: "system",
...(lateMinutes > 0 ? { lateMinutes } : {}),
...(extendedCheckoutTime ? { extendedCheckoutTime } : {}),
});
return { action: "checkin", status };
}
},
});

// Log security event for failed access attempts
export const logSecurityEvent = internalMutation({
  args: {
    eventType: v.string(),
    matchedEmployeeId: v.optional(v.id("employees")),
    matchedEmployeeName: v.optional(v.string()),
    matchedDepartment: v.optional(v.string()),
    attemptedAccount: v.optional(v.string()),
    allowedDepartments: v.optional(v.array(v.string())),
    confidence: v.optional(v.number()),
    reason: v.string(),
    date: v.string(),
    time: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("securityLogs", {
      ...args,
      timestamp: Date.now(),
    });
    return null;
  },
});

export const verifyFaceForSharedAccount = query({
  args: {
    employeeId: v.id("employees"),
    accountEmail: v.string(), // "employee@gmail.com" or "office@gmail.com"
  },
  returns: v.object({
    allowed: v.boolean(),
    reason: v.optional(v.string()),
    role: v.optional(v.string()), // The role for this account
  }),
  handler: async (ctx, args) => {
    const employee = await ctx.db.get(args.employeeId);
    
    if (!employee) {
      return {
        allowed: false,
        reason: "Employee not found",
      };
    }

    // Check if employee has sharedAccountAssignments
    if (!employee.sharedAccountAssignments) {
      return {
        allowed: false,
        reason: `Employee not assigned to any shared accounts`,
      };
    }

    // Find if employee is assigned to this account
    const accountAssignment = employee.sharedAccountAssignments.find(
      (a) => a.accountEmail === args.accountEmail
    );

    if (!accountAssignment) {
      return {
        allowed: false,
        reason: `Employee not assigned to ${args.accountEmail} account`,
      };
    }

    return {
      allowed: true,
      role: accountAssignment.allowedRole,
    };
  },
});

// Get company ID for a shared account email
export const getCompanyIdForAccount = internalQuery({
  args: {
    accountEmail: v.string(),
  },
  returns: v.union(v.id("companies"), v.null()),
  handler: async (ctx, args) => {
    // Map shared account emails to company IDs
    // This should match the company that owns each shared account
    const accountToCompanyMap: Record<string, string> = {
      "employee@gmail.com": "k173b8m9xkr4dcxhbdpy9ttvw182e59m",
      "office@gmail.com": "k173b8m9xkr4dcxhbdpy9ttvw182e59m",
    };
    
    const companyId = accountToCompanyMap[args.accountEmail];
    if (companyId) {
      return companyId as any;
    }
    
    return null;
  },
});

export const getAllEmbeddings = internalQuery({
  args: {},
  returns: v.array(v.object({
    employeeId: v.id("employees"),
    embedding: v.array(v.float64()),
  })),
  handler: async (ctx) => {
    const rows = await ctx.db.query("faceEmbeddings").collect();
    return rows.map(r => ({
      employeeId: r.employeeId,
      embedding: r.embedding,
    }));
  },
});

export const saveEmbedding = internalMutation({
  args: {
    employeeId: v.id("employees"),
    embedding: v.array(v.float64()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("faceEmbeddings")
      .withIndex("by_employee", q => q.eq("employeeId", args.employeeId))
      .first();
    if (existing) await ctx.db.delete(existing._id);

    await ctx.db.insert("faceEmbeddings", {
      employeeId: args.employeeId,
      embedding: args.embedding,
      createdAt: Date.now(),
    });
    return null;
  },
});