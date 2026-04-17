/**
* Shared auth helpers with role hierarchy:
* superadmin > admin > employee
*/
export async function requireAuth(ctx: any) {
const identity = await ctx.auth.getUserIdentity();
// If no identity (internal action context), return a system user
if (!identity) {
  // Return a dummy superadmin user for internal/sync operations
  return { _id: "system", role: "superadmin" };
}
if (identity.email) {
const user = await ctx.db.query("users")
.withIndex("email", (q: any) => q.eq("email", identity.email)).unique();
if (user) return user;
}
const subject = identity.subject;
if (subject) {
try { const user = await ctx.db.get(subject as any); if (user) return user; } catch {}
for (const part of subject.split("|")) {
try { const user = await ctx.db.get(part.trim() as any); if (user) return user; } catch {}
}
}
throw new Error("User not found");
}

export async function requireAdminOrHR(ctx: any) {
const user = await requireAuth(ctx);
if (!["superadmin", "admin", "hr"].includes(user.role)) {
throw new Error("Unauthorized: admin role required");
}
return user;
}

export async function requireSuperAdmin(ctx: any) {
const user = await requireAuth(ctx);
if (user.role !== "superadmin") {
throw new Error("Unauthorized: super admin role required");
}
return user;
}

export async function requireAdminForDelete(ctx: any) {
const user = await requireAuth(ctx);
if (user.role !== "superadmin") {
throw new Error("Unauthorized: only super admin can delete records");
}
return user;
}

/**
 * Attendance validation guard - checks device, account type, and role
 * Returns validation result with detailed reason if blocked
 */
export async function validateAttendanceAccess(ctx: any, args: {
  deviceId: string;
  accountEmail: string;
  employeeId: string;
  action?: string;
}): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const blockReasons: string[] = [];

    // Step 1: Check if account is shared
    if (args.accountEmail !== "employee@gmail.com" && args.accountEmail !== "office@gmail.com") {
      blockReasons.push("Personal accounts cannot mark attendance");
      await logAccessAttempt(ctx, { deviceId: args.deviceId, accountEmail: args.accountEmail, employeeId: args.employeeId, allowed: false, blockReason: blockReasons[0], action: args.action || "unknown" });
      return { allowed: false, reason: blockReasons[0] };
    }

    // Step 2: Check if device is registered
    const device = await ctx.db
      .query("registeredDevices")
      .withIndex("by_device_id", (q: any) => q.eq("deviceId", args.deviceId))
      .first();

    if (!device) {
      blockReasons.push("This device is not registered. Contact administrator.");
      await logAccessAttempt(ctx, { deviceId: args.deviceId, accountEmail: args.accountEmail, employeeId: args.employeeId, allowed: false, blockReason: blockReasons[0], action: args.action || "unknown" });
      return { allowed: false, reason: blockReasons[0] };
    }

    // Step 3: Check if device is active
    if (device.status !== "active") {
      blockReasons.push(`This device has been ${device.status}. Contact administrator.`);
      await logAccessAttempt(ctx, { deviceId: args.deviceId, accountEmail: args.accountEmail, employeeId: args.employeeId, allowed: false, blockReason: blockReasons[0], action: args.action || "unknown" });
      return { allowed: false, reason: blockReasons[0] };
    }

    // Step 4: NEW - Check device-account binding
    const deviceBinding = await ctx.db
      .query("accountDeviceBindings")
      .withIndex("by_account_email", (q: any) => q.eq("accountEmail", args.accountEmail))
      .first();

    if (deviceBinding) {
      if (!deviceBinding.allowMultipleDevices) {
        // Strict binding: only specific devices allowed for this account
        if (!deviceBinding.allowedDeviceIds.includes(args.deviceId)) {
          const allowedDeviceName = deviceBinding.allowedDeviceIds.length > 0 
            ? `${deviceBinding.allowedDeviceIds[0]} (${device.deviceName})` 
            : device.deviceName;
          blockReasons.push(
            `Account '${args.accountEmail}' can only be used on '${allowedDeviceName}' device.`
          );
          await logAccessAttempt(ctx, { deviceId: args.deviceId, accountEmail: args.accountEmail, employeeId: args.employeeId, allowed: false, blockReason: blockReasons[0], action: args.action || "unknown" });
          return { allowed: false, reason: blockReasons[0] };
        }
      }
      // If allowMultipleDevices is true, skip this check - any registered device is OK
    }

    // Step 5: Check account-specific role validation
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) {
      blockReasons.push("Employee record not found.");
      await logAccessAttempt(ctx, { 
        ...args, 
        allowed: false, 
        blockReason: blockReasons[0],
        action: args.action || "unknown"
      });
      return { allowed: false, reason: blockReasons[0] };
    }

    // Fetch role config for this account
    const roleConfig = await ctx.db
      .query("sharedAccountRoles")
      .withIndex("by_account_email", (q: any) => q.eq("accountEmail", args.accountEmail))
      .first();

    if (!roleConfig) {
      blockReasons.push(`Account '${args.accountEmail}' is not configured.`);
      await logAccessAttempt(ctx, { 
        ...args, 
        allowed: false, 
        blockReason: blockReasons[0],
        action: args.action || "unknown"
      });
      return { allowed: false, reason: blockReasons[0] };
    }

    const employeeRole = (employee as any).position;
    
    // Normalize and check roles
    const normalizedEmployeeRole = employeeRole?.trim().toLowerCase() || "";
    const normalizedAllowedRoles = roleConfig.allowedRoles.map((r: string) => r.trim().toLowerCase());
    
    // Add developer roles as implicit allowed roles for office@gmail.com
    if (args.accountEmail === "office@gmail.com") {
      normalizedAllowedRoles.push("sr software developer", "jr software developer");
    }
    
    if (!normalizedAllowedRoles.includes(normalizedEmployeeRole)) {
      blockReasons.push(
        `Role '${employeeRole}' is not allowed for ${args.accountEmail} account. ` +
        `Allowed roles: ${roleConfig.allowedRoles.join(", ")}`
      );
      await logAccessAttempt(ctx, { 
        ...args, 
        allowed: false, 
        blockReason: blockReasons[0],
        action: args.action || "unknown"
      });
      return { allowed: false, reason: blockReasons[0] };
    }

    // All validations passed
    await logAccessAttempt(ctx, { 
      ...args, 
      allowed: true,
      action: args.action || "unknown"
    });
    return { allowed: true };
  } catch (error: any) {
    const errorMessage = `System error during validation: ${error.message}`;
    await logAccessAttempt(ctx, { deviceId: args.deviceId, accountEmail: args.accountEmail, employeeId: args.employeeId, allowed: false, blockReason: errorMessage, action: args.action || "unknown" });
    return { allowed: false, reason: errorMessage };
  }
}

/**
 * Log all attendance access attempts (allowed and blocked)
 */
async function logAccessAttempt(ctx: any, args: {
  deviceId: string;
  accountEmail: string;
  employeeId: any;
  action: string;
  allowed: boolean;
  blockReason?: string;
}) {
  const now = new Date();
  const date = now.toISOString().split("T")[0];
  
  const logEntry: any = {
    deviceId: args.deviceId,
    accountEmail: args.accountEmail,
    action: args.action,
    allowed: args.allowed,
    timestamp: Date.now(),
    date,
  };

  // Only add employeeId if it has a value
  if (args.employeeId) {
    logEntry.employeeId = args.employeeId;
  }

  // Only add blockReason if provided
  if (args.blockReason) {
    logEntry.blockReason = args.blockReason;
  }

  await ctx.db.insert("deviceAccessLogs", logEntry);
}/**
* Shared auth helpers with role hierarchy:
* superadmin > admin > employee
*/
export async function requireAuth(ctx: any) {
const identity = await ctx.auth.getUserIdentity();
// If no identity (internal action context), return a system user
if (!identity) {
  // Return a dummy superadmin user for internal/sync operations
  return { _id: "system", role: "superadmin" };
}
if (identity.email) {
const user = await ctx.db.query("users")
.withIndex("email", (q: any) => q.eq("email", identity.email)).unique();
if (user) return user;
}
const subject = identity.subject;
if (subject) {
try { const user = await ctx.db.get(subject as any); if (user) return user; } catch {}
for (const part of subject.split("|")) {
try { const user = await ctx.db.get(part.trim() as any); if (user) return user; } catch {}
}
}
throw new Error("User not found");
}

export async function requireAdminOrHR(ctx: any) {
const user = await requireAuth(ctx);
if (!["superadmin", "admin", "hr"].includes(user.role)) {
throw new Error("Unauthorized: admin role required");
}
return user;
}

export async function requireSuperAdmin(ctx: any) {
const user = await requireAuth(ctx);
if (user.role !== "superadmin") {
throw new Error("Unauthorized: super admin role required");
}
return user;
}

export async function requireAdminForDelete(ctx: any) {
const user = await requireAuth(ctx);
if (user.role !== "superadmin") {
throw new Error("Unauthorized: only super admin can delete records");
}
return user;
}

/**
 * Attendance validation guard - checks device, account type, and role
 * Returns validation result with detailed reason if blocked
 */
export async function validateAttendanceAccess(ctx: any, args: {
  deviceId: string;
  accountEmail: string;
  employeeId: string;
  action?: string;
}): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const blockReasons: string[] = [];

    // Step 1: Check if account is shared
    if (args.accountEmail !== "employee@gmail.com" && args.accountEmail !== "office@gmail.com") {
      blockReasons.push("Personal accounts cannot mark attendance");
      await logAccessAttempt(ctx, { deviceId: args.deviceId, accountEmail: args.accountEmail, employeeId: args.employeeId, allowed: false, blockReason: blockReasons[0], action: args.action || "unknown" });
      return { allowed: false, reason: blockReasons[0] };
    }

    // Step 2: Check if device is registered
    const device = await ctx.db
      .query("registeredDevices")
      .withIndex("by_device_id", (q: any) => q.eq("deviceId", args.deviceId))
      .first();

    if (!device) {
      blockReasons.push("This device is not registered. Contact administrator.");
      await logAccessAttempt(ctx, { deviceId: args.deviceId, accountEmail: args.accountEmail, employeeId: args.employeeId, allowed: false, blockReason: blockReasons[0], action: args.action || "unknown" });
      return { allowed: false, reason: blockReasons[0] };
    }

    // Step 3: Check if device is active
    if (device.status !== "active") {
      blockReasons.push(`This device has been ${device.status}. Contact administrator.`);
      await logAccessAttempt(ctx, { deviceId: args.deviceId, accountEmail: args.accountEmail, employeeId: args.employeeId, allowed: false, blockReason: blockReasons[0], action: args.action || "unknown" });
      return { allowed: false, reason: blockReasons[0] };
    }

    // Step 4: NEW - Check device-account binding
    const deviceBinding = await ctx.db
      .query("accountDeviceBindings")
      .withIndex("by_account_email", (q: any) => q.eq("accountEmail", args.accountEmail))
      .first();

    if (deviceBinding) {
      if (!deviceBinding.allowMultipleDevices) {
        // Strict binding: only specific devices allowed for this account
        if (!deviceBinding.allowedDeviceIds.includes(args.deviceId)) {
          const allowedDeviceName = deviceBinding.allowedDeviceIds.length > 0 
            ? `${deviceBinding.allowedDeviceIds[0]} (${device.deviceName})` 
            : device.deviceName;
          blockReasons.push(
            `Account '${args.accountEmail}' can only be used on '${allowedDeviceName}' device.`
          );
          await logAccessAttempt(ctx, { deviceId: args.deviceId, accountEmail: args.accountEmail, employeeId: args.employeeId, allowed: false, blockReason: blockReasons[0], action: args.action || "unknown" });
          return { allowed: false, reason: blockReasons[0] };
        }
      }
      // If allowMultipleDevices is true, skip this check - any registered device is OK
    }

    // Step 5: Check account-specific role validation
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) {
      blockReasons.push("Employee record not found.");
      await logAccessAttempt(ctx, { 
        ...args, 
        allowed: false, 
        blockReason: blockReasons[0],
        action: args.action || "unknown"
      });
      return { allowed: false, reason: blockReasons[0] };
    }

    // Fetch role config for this account
    const roleConfig = await ctx.db
      .query("sharedAccountRoles")
      .withIndex("by_account_email", (q: any) => q.eq("accountEmail", args.accountEmail))
      .first();

    if (!roleConfig) {
      blockReasons.push(`Account '${args.accountEmail}' is not configured.`);
      await logAccessAttempt(ctx, { 
        ...args, 
        allowed: false, 
        blockReason: blockReasons[0],
        action: args.action || "unknown"
      });
      return { allowed: false, reason: blockReasons[0] };
    }

    const employeeRole = (employee as any).position;
    
    // Normalize and check roles
    const normalizedEmployeeRole = employeeRole?.trim().toLowerCase() || "";
    const normalizedAllowedRoles = roleConfig.allowedRoles.map((r: string) => r.trim().toLowerCase());
    
    // Add developer roles as implicit allowed roles for office@gmail.com
    if (args.accountEmail === "office@gmail.com") {
      normalizedAllowedRoles.push("sr software developer", "jr software developer");
    }
    
    if (!normalizedAllowedRoles.includes(normalizedEmployeeRole)) {
      blockReasons.push(
        `Role '${employeeRole}' is not allowed for ${args.accountEmail} account. ` +
        `Allowed roles: ${roleConfig.allowedRoles.join(", ")}`
      );
      await logAccessAttempt(ctx, { 
        ...args, 
        allowed: false, 
        blockReason: blockReasons[0],
        action: args.action || "unknown"
      });
      return { allowed: false, reason: blockReasons[0] };
    }

    // All validations passed
    await logAccessAttempt(ctx, { 
      ...args, 
      allowed: true,
      action: args.action || "unknown"
    });
    return { allowed: true };
  } catch (error: any) {
    const errorMessage = `System error during validation: ${error.message}`;
    await logAccessAttempt(ctx, { deviceId: args.deviceId, accountEmail: args.accountEmail, employeeId: args.employeeId, allowed: false, blockReason: errorMessage, action: args.action || "unknown" });
    return { allowed: false, reason: errorMessage };
  }
}

/**
 * Log all attendance access attempts (allowed and blocked)
 */
async function logAccessAttempt(ctx: any, args: {
  deviceId: string;
  accountEmail: string;
  employeeId: any;
  action: string;
  allowed: boolean;
  blockReason?: string;
}) {
  const now = new Date();
  const date = now.toISOString().split("T")[0];
  
  const logEntry: any = {
    deviceId: args.deviceId,
    accountEmail: args.accountEmail,
    action: args.action,
    allowed: args.allowed,
    timestamp: Date.now(),
    date,
  };

  // Only add employeeId if it has a value
  if (args.employeeId) {
    logEntry.employeeId = args.employeeId;
  }

  // Only add blockReason if provided
  if (args.blockReason) {
    logEntry.blockReason = args.blockReason;
  }

  await ctx.db.insert("deviceAccessLogs", logEntry);
}