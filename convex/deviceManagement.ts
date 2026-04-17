import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdminOrHR, requireSuperAdmin, requireAuth } from "./helpers";

export const registerDevice = mutation({
  args: {
    deviceId: v.string(),
    deviceName: v.string(),
    companyId: v.id("companies"),
    notes: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
  },
  returns: v.id("registeredDevices"),
  handler: async (ctx, args) => {
    const user = await requireAdminOrHR(ctx);

    // Check if device already registered
    const existing = await ctx.db
      .query("registeredDevices")
      .withIndex("by_device_id", (q: any) => q.eq("deviceId", args.deviceId))
      .first();

    if (existing) {
      throw new Error("Device already registered");
    }

    const deviceId = await ctx.db.insert("registeredDevices", {
      companyId: args.companyId,
      deviceId: args.deviceId,
      deviceName: args.deviceName,
      registeredBy: user._id,
      registeredAt: Date.now(),
      status: "active",
      notes: args.notes,
      ipAddress: args.ipAddress,
    });

    return deviceId;
  },
});

export const updateDeviceStatus = mutation({
  args: {
    registeredDeviceId: v.id("registeredDevices"),
    status: v.union(v.literal("active"), v.literal("inactive"), v.literal("revoked")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminOrHR(ctx);
    await ctx.db.patch(args.registeredDeviceId, { status: args.status });
    return null;
  },
});

export const getRegisteredDevices = query({
  args: { companyId: v.id("companies") },
  returns: v.array(v.object({
    _id: v.id("registeredDevices"),
    deviceId: v.string(),
    deviceName: v.string(),
    status: v.string(),
    registeredAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    await requireAdminOrHR(ctx);

    const devices = await ctx.db
      .query("registeredDevices")
      .withIndex("by_company", (q: any) => q.eq("companyId", args.companyId))
      .collect();

    return devices.map((d: any) => ({
      _id: d._id,
      deviceId: d.deviceId,
      deviceName: d.deviceName,
      status: d.status,
      registeredAt: d.registeredAt,
      lastUsedAt: d.lastUsedAt,
      notes: d.notes,
    }));
  },
});

// ✅ FIX: Added getAllDevices — used by faceRecognitionAction for device validation
// This is an internal query (no auth check needed — called from within actions)
export const getAllDevices = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("registeredDevices"),
    deviceId: v.string(),
    deviceName: v.string(),
    status: v.string(),
    companyId: v.id("companies"),
  })),
  handler: async (ctx) => {
    const devices = await ctx.db.query("registeredDevices").collect();
    return devices.map((d: any) => ({
      _id: d._id,
      deviceId: d.deviceId,
      deviceName: d.deviceName,
      status: d.status,
      companyId: d.companyId,
    }));
  },
});

export const getDeviceAccessLogsForAdmin = query({
  args: {
    companyId: v.id("companies"),
    date: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.object({
    _id: v.id("deviceAccessLogs"),
    deviceId: v.string(),
    accountEmail: v.string(),
    action: v.string(),
    allowed: v.boolean(),
    blockReason: v.optional(v.string()),
    timestamp: v.number(),
    date: v.string(),
  })),
  handler: async (ctx, args) => {
    await requireAdminOrHR(ctx);

    let logs = await ctx.db.query("deviceAccessLogs").collect();

    if (args.date) {
      logs = logs.filter((l: any) => l.date === args.date);
    }

    const devices = await ctx.db
      .query("registeredDevices")
      .withIndex("by_company", (q: any) => q.eq("companyId", args.companyId))
      .collect();

    const deviceIds = new Set(devices.map((d: any) => d.deviceId));
    logs = logs.filter((l: any) => deviceIds.has(l.deviceId));

    return logs
      .sort((a: any, b: any) => b.timestamp - a.timestamp)
      .slice(0, args.limit || 100)
      .map((l: any) => ({
        _id: l._id,
        deviceId: l.deviceId,
        accountEmail: l.accountEmail,
        action: l.action,
        allowed: l.allowed,
        blockReason: l.blockReason,
        timestamp: l.timestamp,
        date: l.date,
      }));
  },
});

export const removeDevice = mutation({
  args: { registeredDeviceId: v.id("registeredDevices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminOrHR(ctx);
    await ctx.db.delete(args.registeredDeviceId);
    return null;
  },
});

export const checkDeviceConflict = query({
  args: {
    deviceId: v.string(),
    accountEmail: v.union(v.literal("employee@gmail.com"), v.literal("office@gmail.com")),
  },
  returns: v.object({
    conflict: v.boolean(),
    boundTo: v.optional(v.string()),
    reason: v.optional(v.string()),
    canBind: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const device = await ctx.db
      .query("registeredDevices")
      .withIndex("by_device_id", (q: any) => q.eq("deviceId", args.deviceId))
      .first();

    if (!device) {
      return {
        conflict: true,
        reason: "Device not registered. Contact administrator to register this device.",
        canBind: false,
      };
    }

    if (device.status !== "active") {
      return {
        conflict: true,
        reason: `Device is ${device.status}. Contact administrator.`,
        canBind: false,
      };
    }

    const binding = await ctx.db
      .query("accountDeviceBindings")
      .withIndex("by_account_email", (q: any) => q.eq("accountEmail", args.accountEmail))
      .first();

    if (binding && binding.allowedDeviceIds.includes(args.deviceId)) {
      return { conflict: false, canBind: true };
    }

    const allBindings = await ctx.db.query("accountDeviceBindings").collect();
    const conflictBinding = allBindings.find((b: any) =>
      b.accountEmail !== args.accountEmail && b.allowedDeviceIds.includes(args.deviceId)
    );

    if (conflictBinding) {
      return {
        conflict: true,
        boundTo: conflictBinding.accountEmail,
        reason: `This device is already registered to ${conflictBinding.accountEmail}. One device can only be used with one account.`,
        canBind: false,
      };
    }

    return { conflict: false, canBind: true };
  },
});

export const bindDeviceToAccount = mutation({
  args: {
    deviceId: v.string(),
    accountEmail: v.union(v.literal("employee@gmail.com"), v.literal("office@gmail.com")),
  },
  returns: v.object({ success: v.boolean(), message: v.string() }),
  handler: async (ctx, args) => {
    const device = await ctx.db
      .query("registeredDevices")
      .withIndex("by_device_id", (q: any) => q.eq("deviceId", args.deviceId))
      .first();

    if (!device || device.status !== "active") {
      return { success: false, message: "Device is not registered or is inactive" };
    }

    const existingBinding = await ctx.db
      .query("accountDeviceBindings")
      .withIndex("by_account_email", (q: any) => q.eq("accountEmail", args.accountEmail))
      .first();

    if (existingBinding) {
      if (!existingBinding.allowedDeviceIds.includes(args.deviceId)) {
        if (existingBinding.allowMultipleDevices) {
          // Multi-device mode: safely append without removing existing devices
          await ctx.db.patch(existingBinding._id, {
            allowedDeviceIds: [...existingBinding.allowedDeviceIds, args.deviceId],
          });
        } else {
          // Bug fix 5: single-device mode — REJECT instead of silently replacing
          // This prevents an existing registered tablet from being de-registered without admin action
          const existingCount = existingBinding.allowedDeviceIds.length;
          if (existingCount > 0) {
            return {
              success: false,
              message: `Account ${args.accountEmail} is already bound to another device. Contact administrator to change device binding.`,
            };
          }
          await ctx.db.patch(existingBinding._id, {
            allowedDeviceIds: [args.deviceId],
          });
        }
      }
    } else {
      await ctx.db.insert("accountDeviceBindings", {
        accountEmail: args.accountEmail,
        allowedDeviceIds: [args.deviceId],
        allowMultipleDevices: false,
        description: `Device ${device.deviceName} bound to ${args.accountEmail}`,
        isActive: true,
        createdAt: Date.now(),
      });
    }

    await ctx.db.patch(device._id, { lastUsedAt: Date.now() });

    return { success: true, message: `Device bound to ${args.accountEmail}` };
  },
});