import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSuperAdmin } from "./helpers";

/**
 * Bulk migration to assign all existing employees to shared accounts
 * based on their position matching the allowed roles
 */
export const bulkAssignExistingEmployees = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    
    const employees = await ctx.db.query("employees").collect();
    
    const employeeAccountRoles = ["Property Manager", "Technician", "Housekeeping"];
    const officeAccountRoles = ["Software", "Accounting", "General", "Management"];
    
    let assigned = 0;
    
    for (const employee of employees) {
      const position = employee.position || employee.department || "";
      
      if (!position) continue;
      
      const assignments: any[] = [];
      
      if (employeeAccountRoles.includes(position)) {
        assignments.push({
          accountEmail: "employee@gmail.com",
          allowedRole: position,
          assignedAt: Date.now(),
        });
      }
      
      if (officeAccountRoles.includes(position)) {
        assignments.push({
          accountEmail: "office@gmail.com",
          allowedRole: position,
          assignedAt: Date.now(),
        });
      }
      
      if (assignments.length > 0) {
        await ctx.db.patch(employee._id, {
          sharedAccountAssignments: assignments,
        });
        assigned++;
      }
    }
    
    return assigned;
  },
});
