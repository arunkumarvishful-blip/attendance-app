import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Initialize the complete attendance system
 * Call this ONCE to set up all configurations
 */
export const initializeAttendanceSystem = mutation({
  args: {},
  returns: v.object({
    rolesConfigured: v.number(),
    deviceBindingsConfigured: v.number(),
    employeesAssigned: v.number(),
  }),
  handler: async (ctx) => {
    // 1. Initialize role configurations
    const existingRoles = await ctx.db
      .query("sharedAccountRoles")
      .collect();
    
    let rolesConfigured = 0;
    
    if (existingRoles.length === 0) {
      // Create employee@ roles
      await ctx.db.insert("sharedAccountRoles", {
        accountEmail: "employee@gmail.com",
        allowedRoles: [
          "Property Manager", 
          "Technician", 
          "Housekeeping"
        ],
        description: "Property management and operations staff",
        isActive: true,
        createdAt: Date.now(),
      });
      rolesConfigured++;

      // Create office@ roles
      await ctx.db.insert("sharedAccountRoles", {
        accountEmail: "office@gmail.com",
        allowedRoles: [
          "Software", 
          "Sr Software Developer", 
          "Junior Software Developer", 
          "Accounting", 
          "General", 
          "Management"
        ],
        description: "Administrative and office staff",
        isActive: true,
        createdAt: Date.now(),
      });
      rolesConfigured++;
    }

    // 2. Initialize device bindings
    const existingBindings = await ctx.db
      .query("accountDeviceBindings")
      .collect();
    
    let deviceBindingsConfigured = 0;

    if (existingBindings.length === 0) {
      // Bind employee@ to specific device (will be updated by admin)
      await ctx.db.insert("accountDeviceBindings", {
        accountEmail: "employee@gmail.com",
        allowedDeviceIds: [],
        allowMultipleDevices: false,
        description: "Restricted to registered office devices",
        isActive: true,
        createdAt: Date.now(),
      });
      deviceBindingsConfigured++;

      // Bind office@ to multiple devices
      await ctx.db.insert("accountDeviceBindings", {
        accountEmail: "office@gmail.com",
        allowedDeviceIds: [],
        allowMultipleDevices: true,
        description: "Allowed on any registered device",
        isActive: true,
        createdAt: Date.now(),
      });
      deviceBindingsConfigured++;
    }

    // 3. Auto-assign existing employees
    const employees = await ctx.db.query("employees").collect();
    let employeesAssigned = 0;

    for (const employee of employees) {
      if (!employee.sharedAccountAssignments || employee.sharedAccountAssignments.length === 0) {
        const assignments: any[] = [];
        const employeeRole = employee.position;

        // Check if role matches employee@ allowed roles
        if (["Property Manager", "Technician", "Housekeeping"].includes(employeeRole)) {
          assignments.push({
            accountEmail: "employee@gmail.com",
            roleForThisAccount: employeeRole,
            assignedAt: Date.now(),
          });
        }

        // Check if role matches office@ allowed roles
        if (["Software", "Accounting", "General", "Management"].includes(employeeRole)) {
          assignments.push({
            accountEmail: "office@gmail.com",
            roleForThisAccount: employeeRole,
            assignedAt: Date.now(),
          });
        }

        // Update employee if there are assignments
        if (assignments.length > 0) {
          await ctx.db.patch(employee._id, {
            sharedAccountAssignments: assignments,
          });
          employeesAssigned++;
        }
      }
    }

    return {
      rolesConfigured,
      deviceBindingsConfigured,
      employeesAssigned,
    };
  },
});

// Force insert office@gmail.com if missing (debugging helper)
export const ensureOfficeConfigExists = mutation({
  args: {},
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    rolesCount: v.number(),
    bindingsCount: v.number(),
  }),
  handler: async (ctx) => {
    // Check office@gmail.com role config
    const officeRoleConfig = await ctx.db
      .query("sharedAccountRoles")
      .withIndex("by_account_email", (q: any) => q.eq("accountEmail", "office@gmail.com"))
      .first();

    if (!officeRoleConfig) {
      // Insert office@gmail.com role config
      await ctx.db.insert("sharedAccountRoles", {
        accountEmail: "office@gmail.com",
        allowedRoles: [
          "Software", 
          "Sr Software Developer", 
          "Junior Software Developer", 
          "Accounting", 
          "General", 
          "Management"
        ],
        description: "For office and administrative staff",
        isActive: true,
        createdAt: Date.now(),
      });
    }

    // Check office@gmail.com device binding
    const officeDeviceBinding = await ctx.db
      .query("accountDeviceBindings")
      .withIndex("by_account_email", (q: any) => q.eq("accountEmail", "office@gmail.com"))
      .first();

    if (!officeDeviceBinding) {
      // Insert office@gmail.com device binding
      await ctx.db.insert("accountDeviceBindings", {
        accountEmail: "office@gmail.com",
        allowedDeviceIds: [],
        allowMultipleDevices: true,
        description: "Works on any registered device",
        isActive: true,
        createdAt: Date.now(),
      });
    }

    // Get final counts
    const roles = await ctx.db.query("sharedAccountRoles").collect();
    const bindings = await ctx.db.query("accountDeviceBindings").collect();

    return {
      success: true,
      message: `Configuration complete. Roles: ${roles.length}, Bindings: ${bindings.length}`,
      rolesCount: roles.length,
      bindingsCount: bindings.length,
    };
  },
});

export const ensureOfficeAccountConfigExists = mutation({
  args: {},
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    config: v.optional(v.any()),
  }),
  handler: async (ctx) => {
    // Check if office@gmail.com already exists
    const existing = await ctx.db
      .query("sharedAccountRoles")
      .withIndex("by_account_email", q => q.eq("accountEmail", "office@gmail.com"))
      .first();

    if (existing) {
      return {
        success: true,
        message: "office@gmail.com configuration already exists",
        config: {
          accountEmail: existing.accountEmail,
          allowedRoles: existing.allowedRoles,
          isActive: existing.isActive,
        },
      };
    }

    // Create office@gmail.com role configuration
    const roleConfigId = await ctx.db.insert("sharedAccountRoles", {
      accountEmail: "office@gmail.com",
      allowedRoles: [
        "Software", 
        "Sr Software Developer", 
        "Junior Software Developer", 
        "Accounting", 
        "General", 
        "Management"
      ],
      description: "For office and administrative staff - works on any registered device",
      isActive: true,
      createdAt: Date.now(),
    });

    // Create device binding for office@gmail.com
    const deviceBindingId = await ctx.db.insert("accountDeviceBindings", {
      accountEmail: "office@gmail.com",
      allowedDeviceIds: [],
      allowMultipleDevices: true,
      description: "Works on any registered device",
      isActive: true,
      createdAt: Date.now(),
    });

    return {
      success: true,
      message: "office@gmail.com configuration initialized successfully",
      config: {
        accountEmail: "office@gmail.com",
        allowedRoles: [
          "Software", 
          "Sr Software Developer", 
          "Junior Software Developer", 
          "Accounting", 
          "General", 
          "Management"
        ],
        allowMultipleDevices: true,
        roleConfigId,
        deviceBindingId,
      },
    };
  },
});

export const registerIPhoneDeviceForKrisharun = mutation({
  args: {},
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx) => {
    try {
      // Get the employee's company
      const employee = await ctx.db
        .query("employees")
        .filter(q => q.eq(q.field("email"), "krisharun6789@gmail.com"))
        .first();

      if (!employee || !employee.companyId) {
        return {
          success: false,
          message: "Employee not found or has no company assigned",
        };
      }

      // Get first admin user
      const adminUser = await ctx.db
        .query("users")
        .filter(q => q.eq(q.field("role"), "admin"))
        .first();

      if (!adminUser) {
        return {
          success: false,
          message: "No admin user found to register device",
        };
      }

      // Check if iPhone already registered
      const existing = await ctx.db
        .query("registeredDevices")
        .withIndex("by_device_id", q => q.eq("deviceId", "iPhone"))
        .first();

      if (existing) {
        return {
          success: false,
          message: `iPhone already registered with status: ${existing.status}`,
        };
      }

      // Register iPhone
      await ctx.db.insert("registeredDevices", {
        companyId: employee.companyId,
        deviceId: "iPhone",
        deviceName: "Office iPhone - Krisharun",
        registeredBy: adminUser._id,
        registeredAt: Date.now(),
        status: "active",
        notes: "Registered for krisharun6789@gmail.com on office@gmail.com account",
      });

      return {
        success: true,
        message: "iPhone device registered successfully",
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
      };
    }
  },
});

export const fixOfficeAccessIssues = mutation({
  args: {},
  handler: async (ctx) => {
    const results = {
      office_config: { status: "pending", message: "" },
      employee_position: { status: "pending", message: "" },
      device_registration: { status: "pending", message: "" },
    };

    // Fix 1: Create office@gmail.com configuration if missing
    try {
      const existing = await ctx.db
        .query("sharedAccountRoles")
        .withIndex("by_account_email", q => q.eq("accountEmail", "office@gmail.com"))
        .first();

      if (!existing) {
        await ctx.db.insert("sharedAccountRoles", {
          accountEmail: "office@gmail.com",
          allowedRoles: [
            "Software", 
            "Sr Software Developer", 
            "Junior Software Developer", 
            "Accounting", 
            "General", 
            "Management"
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

        results.office_config = {
          status: "fixed",
          message: "office@gmail.com configuration created",
        };
      } else {
        results.office_config = {
          status: "already_exists",
          message: "office@gmail.com already configured",
        };
      }
    } catch (error: any) {
      results.office_config = {
        status: "error",
        message: error.message,
      };
    }

    // Fix 2: Update employee position from "Jr Software Developer" to "Software"
    try {
      const allEmployees = await ctx.db.query("employees").collect();
      const targetEmployee = allEmployees.find(
        e => e.email?.toLowerCase() === "krisharun6789@gmail.com".toLowerCase()
      );

      if (targetEmployee && targetEmployee.position === "Jr Software Developer") {
        await ctx.db.patch(targetEmployee._id, {
          position: "Software",
        });

        results.employee_position = {
          status: "fixed",
          message: `Updated ${targetEmployee.firstName} position to "Software"`,
        };
      } else if (targetEmployee) {
        results.employee_position = {
          status: "already_correct",
          message: `Position is already "${targetEmployee.position}"`,
        };
      } else {
        results.employee_position = {
          status: "not_found",
          message: "Employee not found",
        };
      }
    } catch (error: any) {
      results.employee_position = {
        status: "error",
        message: error.message,
      };
    }

    // Fix 3: Register iPhone device if not already registered
    try {
      const existing = await ctx.db
        .query("registeredDevices")
        .withIndex("by_device_id", q => q.eq("deviceId", "iPhone"))
        .first();

      if (!existing) {
        await ctx.db.insert("registeredDevices", {
          deviceId: "iPhone",
          deviceName: "Office iPhone",
          status: "active",
          createdAt: Date.now(),
        });

        results.device_registration = {
          status: "fixed",
          message: "iPhone device registered and activated",
        };
      } else {
        results.device_registration = {
          status: "already_exists",
          message: `iPhone already registered with status: ${existing.status}`,
        };
      }
    } catch (error: any) {
      results.device_registration = {
        status: "error",
        message: error.message,
      };
    }

    return {
      timestamp: Date.now(),
      summary: "Office access issue fixes attempted",
      results,
      nextStep: "Try scanning face on office@gmail.com again",
    };
  },
});