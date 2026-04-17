import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireAdminOrHR } from "./helpers";

const companyReturn = v.object({
_id: v.id("companies"),
_creationTime: v.number(),
name: v.string(),
address: v.optional(v.string()),
gstNumber: v.optional(v.string()),
lateThresholdMinutes: v.number(),
overtimeThresholdHours: v.number(),
weeklyOffDay: v.optional(v.number()),
status: v.string(),
sharedAccountOnlyDepartments: v.optional(v.array(v.string())),
});

export const list = query({
args: {},
returns: v.array(companyReturn),
handler: async (ctx) => {
await requireAuth(ctx);
const companies = await ctx.db.query("companies")
.withIndex("by_status", (q: any) => q.eq("status", "active"))
.collect();
return companies.map((c) => ({
_id: c._id, _creationTime: c._creationTime,
name: c.name, address: c.address, gstNumber: c.gstNumber,
lateThresholdMinutes: c.lateThresholdMinutes,
overtimeThresholdHours: c.overtimeThresholdHours,
weeklyOffDay: c.weeklyOffDay, status: c.status,
sharedAccountOnlyDepartments: c.sharedAccountOnlyDepartments,
}));
},
});

export const listAll = query({
args: {},
returns: v.array(companyReturn),
handler: async (ctx) => {
await requireAuth(ctx);
const companies = await ctx.db.query("companies").collect();
return companies.map((c) => ({
_id: c._id, _creationTime: c._creationTime,
name: c.name, address: c.address, gstNumber: c.gstNumber,
lateThresholdMinutes: c.lateThresholdMinutes,
overtimeThresholdHours: c.overtimeThresholdHours,
weeklyOffDay: c.weeklyOffDay, status: c.status,
sharedAccountOnlyDepartments: c.sharedAccountOnlyDepartments,
}));
},
});

export const create = mutation({
args: {
name: v.string(), address: v.optional(v.string()),
gstNumber: v.optional(v.string()),
lateThresholdMinutes: v.number(), overtimeThresholdHours: v.number(),
weeklyOffDay: v.optional(v.number()),
},
returns: v.id("companies"),
handler: async (ctx, args) => {
await requireAdminOrHR(ctx);
return await ctx.db.insert("companies", { ...args, status: "active" });
},
});

export const update = mutation({
args: {
id: v.id("companies"), name: v.string(),
address: v.optional(v.string()), gstNumber: v.optional(v.string()),
lateThresholdMinutes: v.number(), overtimeThresholdHours: v.number(),
weeklyOffDay: v.optional(v.number()),
},
returns: v.null(),
handler: async (ctx, args) => {
await requireAdminOrHR(ctx);
const { id, ...data } = args;
await ctx.db.patch(id, data);
return null;
},
});

export const deactivate = mutation({
args: { id: v.id("companies") },
returns: v.null(),
handler: async (ctx, args) => {
await requireAdminOrHR(ctx);
await ctx.db.patch(args.id, { status: "inactive" });
return null;
},
});

export const remove = mutation({
args: { id: v.id("companies") },
returns: v.null(),
handler: async (ctx, args) => {
await requireAdminOrHR(ctx);
await ctx.db.delete(args.id);
return null;
},
});
// ─── Shared-Account-Only Department Restrictions ───────────────────────────

// Get departments that are restricted to shared-account check-in only
export const getSharedOnlyDepartments = query({
  args: { companyId: v.id("companies") },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const company = await ctx.db.get(args.companyId);
    return company?.sharedAccountOnlyDepartments ?? [];
  },
});

// Set which departments must use shared account only (admin only)
export const setSharedOnlyDepartments = mutation({
  args: {
    companyId: v.id("companies"),
    departments: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminOrHR(ctx);
    await ctx.db.patch(args.companyId, {
      sharedAccountOnlyDepartments: args.departments,
    });
    return null;
  },
});

// Check if the current user's department is restricted to shared-account only
// Used by AttendanceScreen to block self-marking
export const checkCanSelfMark = query({
  args: {},
  returns: v.object({
    canSelfMark: v.boolean(),
    reason: v.optional(v.string()),
    department: v.optional(v.string()),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { canSelfMark: true }; // Not logged in → don't block, let auth handle it

    // Guard: identity.email may be undefined in some auth flows
    if (!identity.email) return { canSelfMark: true };

    // Find the user
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q: any) => q.eq("email", identity.email))
      .first();
    if (!user) return { canSelfMark: true }; // No user record yet → don't block

    // Only employee role is subject to this restriction
    if (user.role !== "employee") return { canSelfMark: true };

    // Find linked employee record
    let emp = user.employeeId ? await ctx.db.get(user.employeeId) : null;
    if (!emp && identity.email) {
      emp = await ctx.db
        .query("employees")
        .withIndex("by_email", (q: any) => q.eq("email", identity.email))
        .first();
    }
    if (!emp) return { canSelfMark: true }; // No employee record, allow

    const companyId = emp.companyId;
    if (!companyId) return { canSelfMark: true };

    const company = await ctx.db.get(companyId);
    const restricted: string[] = company?.sharedAccountOnlyDepartments ?? [];

    if (restricted.length === 0) return { canSelfMark: true, department: emp.department };

    const empDept = (emp.department || "").toLowerCase().trim();
    const isRestricted = restricted.some(d => d.toLowerCase().trim() === empDept);

    if (isRestricted) {
      return {
        canSelfMark: false,
        reason: `${emp.department} employees must use the shared attendance device to check in/out.`,
        department: emp.department,
      };
    }

    return { canSelfMark: true, department: emp.department };
  },
});