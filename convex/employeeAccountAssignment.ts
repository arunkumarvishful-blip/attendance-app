import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdminOrHR, requireSuperAdmin } from "./helpers";

// Assign an employee to a shared account with a specific role
export const assignEmployeeToAccount = mutation({
  args: {
    employeeId: v.id("employees"),
    accountEmail: v.union(v.literal("employee@gmail.com"), v.literal("office@gmail.com")),
    roleForThisAccount: v.string(), // e.g., "Property Manager" for employee@gmail.com
  },
  returns: v.id("employees"),
  handler: async (ctx, args) => {
    // Require admin or superadmin
    const user = await requireAdminOrHR(ctx);

    const employee = await ctx.db.get(args.employeeId);
    if (!employee) {
      throw new Error("Employee not found");
    }

    // Get or initialize sharedAccountAssignments
    const assignments = employee.sharedAccountAssignments || [];

    // Check if already assigned to this account
    const existingIndex = assignments.findIndex(
      (a: any) => a.accountEmail === args.accountEmail
    );

    if (existingIndex >= 0) {
      // Update existing assignment
      assignments[existingIndex] = {
        accountEmail: args.accountEmail,
        allowedRole: args.roleForThisAccount,
        assignedAt: Date.now(),
        assignedBy: user._id,
      };
    } else {
      // Add new assignment
      assignments.push({
        accountEmail: args.accountEmail,
        allowedRole: args.roleForThisAccount,
        assignedAt: Date.now(),
        assignedBy: user._id,
      });
    }

    await ctx.db.patch(args.employeeId, {
      sharedAccountAssignments: assignments,
    });

    return args.employeeId;
  },
});

// Remove an employee from a shared account
export const removeEmployeeFromAccount = mutation({
  args: {
    employeeId: v.id("employees"),
    accountEmail: v.union(v.literal("employee@gmail.com"), v.literal("office@gmail.com")),
  },
  returns: v.id("employees"),
  handler: async (ctx, args) => {
    await requireAdminOrHR(ctx);

    const employee = await ctx.db.get(args.employeeId);
    if (!employee) {
      throw new Error("Employee not found");
    }

    const assignments = employee.sharedAccountAssignments || [];
    const filtered = assignments.filter(
      (a: any) => a.accountEmail !== args.accountEmail
    );

    await ctx.db.patch(args.employeeId, {
      sharedAccountAssignments: filtered.length > 0 ? filtered : undefined,
    });

    return args.employeeId;
  },
});

// Get employee's shared account assignments
export const getEmployeeAccountAssignments = query({
  args: {
    employeeId: v.id("employees"),
  },
  returns: v.optional(
    v.array(
      v.object({
        accountEmail: v.string(),
        allowedRole: v.string(),
        assignedAt: v.number(),
      })
    )
  ),
  handler: async (ctx, args) => {
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) {
      return undefined;
    }
    return employee.sharedAccountAssignments;
  },
});

// Check if employee is allowed to use a specific account
export const isEmployeeAllowedForAccount = query({
  args: {
    employeeId: v.id("employees"),
    accountEmail: v.union(v.literal("employee@gmail.com"), v.literal("office@gmail.com")),
  },
  returns: v.object({
    allowed: v.boolean(),
    role: v.optional(v.string()),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) {
      return {
        allowed: false,
        reason: "Employee not found",
      };
    }

    const assignments = employee.sharedAccountAssignments || [];
    const assignment = assignments.find(
      (a: any) => a.accountEmail === args.accountEmail
    );

    if (!assignment) {
      return {
        allowed: false,
        reason: `Employee not assigned to ${args.accountEmail}`,
      };
    }

    return {
      allowed: true,
      role: assignment.allowedRole,
    };
  },
});

// Get all employees assigned to a specific account
export const getEmployeesForAccount = query({
  args: {
    accountEmail: v.union(v.literal("employee@gmail.com"), v.literal("office@gmail.com")),
    companyId: v.optional(v.id("companies")),
  },
  returns: v.array(
    v.object({
      _id: v.id("employees"),
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      email: v.string(),
      position: v.string(),
      department: v.string(),
      role: v.string(), // The role for this account
      assignedAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    let employees = await ctx.db.query("employees").collect();

    // Filter by company if provided
    if (args.companyId) {
      employees = employees.filter((e) => e.companyId === args.companyId);
    }

    // Filter to only those assigned to this account
    const assigned = employees
      .filter((e) => {
        const assignments = e.sharedAccountAssignments || [];
        return assignments.some((a: any) => a.accountEmail === args.accountEmail);
      })
      .map((e) => {
        const assignment = (e.sharedAccountAssignments || []).find(
          (a: any) => a.accountEmail === args.accountEmail
        );
        return {
          _id: e._id,
          firstName: e.firstName,
          lastName: e.lastName,
          email: e.email,
          position: e.position,
          department: e.department,
          role: assignment?.allowedRole || "",
          assignedAt: assignment?.assignedAt || 0,
        };
      });

    return assigned;
  },
});