import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Migration: Auto-assign all employees to shared accounts based on their role/department
 * Run this ONCE to set up existing employees
 */
export const autoAssignEmployeesToAccounts = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // Get all employees
    const employees = await ctx.db.query("employees").collect();

    // Define role mappings
    const employeeAccountRoles = ["Property Manager", "Technician", "Housekeeping"];
    const officeAccountRoles = ["Software", "Accounting", "General", "Management"];

    let assigned = 0;

    for (const employee of employees) {
      const employeePosition = (employee as any).position || (employee as any).department || "";

      // Skip if no position
      if (!employeePosition) continue;

      const assignments: any[] = [];

      // Check if employee role matches employee@gmail.com allowed roles
      if (employeeAccountRoles.includes(employeePosition)) {
        assignments.push({
          accountEmail: "employee@gmail.com",
          allowedRole: employeePosition,
          assignedAt: Date.now(),
        });
      }

      // Check if employee role matches office@gmail.com allowed roles
      if (officeAccountRoles.includes(employeePosition)) {
        assignments.push({
          accountEmail: "office@gmail.com",
          allowedRole: employeePosition,
          assignedAt: Date.now(),
        });
      }

      // Update employee with assignments
      if (assignments.length > 0) {
        await ctx.db.patch(employee._id, {
          sharedAccountAssignments: assignments,
        });
        assigned++;
      }
    }

    console.log(`Auto-assigned ${assigned} employees to shared accounts`);
    return null;
  },
});
