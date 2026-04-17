import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const fixOfficeAccessIssues = mutation({
  handler: async (ctx) => {
    const results: any = {
      office_config: { status: "pending" },
      device_registration: { status: "pending" },
    };

    // Fix 1: Ensure office@gmail.com configuration has all required roles
    try {
      const existing = await ctx.db
        .query("sharedAccountRoles")
        .withIndex("by_account_email", (q: any) => q.eq("accountEmail", "office@gmail.com"))
        .first();

      if (!existing) {
        await ctx.db.insert("sharedAccountRoles", {
          accountEmail: "office@gmail.com",
          allowedRoles: [
            "Software",
            "Sr Software Developer",
            "Jr Software Developer",
            "Accounting",
            "General",
            "Management",
          ],
          description: "For office and administrative staff",
          isActive: true,
          createdAt: Date.now(),
        });

        await ctx.db.insert("accountDeviceBindings", {
          accountEmail: "office@gmail.com",
          allowedDeviceIds: [],
          allowMultipleDevices: true,
          description: "Works on any registered device",
          isActive: true,
          createdAt: Date.now(),
        });

        results.office_config = { status: "created", roles: [
          "Software",
          "Sr Software Developer",
          "Jr Software Developer",
          "Accounting",
          "General",
          "Management",
        ] };
      } else {
        // Update existing to ensure all roles are included
        const allowedRoles = [
          "Software",
          "Sr Software Developer",
          "Jr Software Developer",
          "Accounting",
          "General",
          "Management",
        ];
        await ctx.db.patch(existing._id, { allowedRoles });
        results.office_config = { status: "updated", roles: allowedRoles };
      }
    } catch (e: any) {
      results.office_config = { status: "error", message: e.message };
    }

    // Fix 2: Register device
    try {
      const existing = await ctx.db
        .query("registeredDevices")
        .withIndex("by_device_id", (q: any) => q.eq("deviceId", "iPhone"))
        .first();

      if (!existing) {
        await ctx.db.insert("registeredDevices", {
          deviceId: "iPhone",
          deviceName: "Office iPhone",
          status: "active",
          createdAt: Date.now(),
        });
        results.device_registration = { status: "registered" };
      } else {
        results.device_registration = { status: "already_exists", status_value: existing.status };
      }
    } catch (e: any) {
      results.device_registration = { status: "error", message: e.message };
    }

    return { success: true, timestamp: Date.now(), results };
  },
});

export const verifyFixes = query({
  handler: async (ctx) => {
    const officeConfig = await ctx.db
      .query("sharedAccountRoles")
      .withIndex("by_account_email", (q: any) => q.eq("accountEmail", "office@gmail.com"))
      .first();

    const iPhoneDevice = await ctx.db
      .query("registeredDevices")
      .withIndex("by_device_id", (q: any) => q.eq("deviceId", "iPhone"))
      .first();

    const requiredRoles = [
      "Software",
      "Sr Software Developer",
      "Jr Software Developer",
      "Accounting",
      "General",
      "Management",
    ];

    return {
      office_config_ready: !!officeConfig,
      has_all_required_roles: officeConfig?.allowedRoles && requiredRoles.every(role => officeConfig.allowedRoles.includes(role)),
      device_registered: !!iPhoneDevice && iPhoneDevice.status === "active",
      allowed_roles: officeConfig?.allowedRoles || [],
      all_ready: !!officeConfig && !!iPhoneDevice && officeConfig.allowedRoles && requiredRoles.every(role => officeConfig.allowedRoles.includes(role)),
    };
  },
});

export const updateOfficeRoles = mutation({
  handler: async (ctx) => {
    const officeConfig = await ctx.db
      .query("sharedAccountRoles")
      .withIndex("by_account_email", (q: any) => q.eq("accountEmail", "office@gmail.com"))
      .first();
    
    if (officeConfig) {
      const newRoles = [
        "Software",
        "Sr Software Developer",
        "Jr Software Developer",
        "Accounting",
        "General",
        "Management",
      ];
      await ctx.db.patch(officeConfig._id, { allowedRoles: newRoles });
      return { status: "updated", allowedRoles: newRoles };
    }
    return { status: "not_found" };
  },
});