import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireAdminOrHR, requireAdminForDelete } from "./helpers";
import { internal } from "./_generated/api";

const employeeReturn = v.object({
  _id: v.id("employees"), _creationTime: v.number(),
  firstName: v.optional(v.string()), lastName: v.optional(v.string()), employeeId: v.optional(v.string()),
  email: v.string(), department: v.string(), position: v.string(),
  companyId: v.optional(v.id("companies")), companyName: v.optional(v.string()),
  shiftId: v.optional(v.id("shifts")), shiftName: v.optional(v.string()),
  salaryType: v.string(), salaryRate: v.number(),
  branch: v.optional(v.string()), status: v.string(),
  faceImageUrl: v.optional(v.string()),
  bankName: v.optional(v.string()), bankAccountNumber: v.optional(v.string()),
  bankIfscCode: v.optional(v.string()), aadharNumber: v.optional(v.string()),
  aadharImageUrl: v.optional(v.string()), bankProofImageUrl: v.optional(v.string()),
});

export const list = query({
  args: { companyId: v.optional(v.id("companies")), search: v.optional(v.string()), department: v.optional(v.string()), status: v.optional(v.string()) },
  returns: v.array(employeeReturn),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    let employees;
    if (args.companyId) {
      employees = await ctx.db.query("employees")
        .withIndex("by_company", (q: any) => q.eq("companyId", args.companyId)).collect();
    } else {
      employees = await ctx.db.query("employees").collect();
    }
    // Filter
    let filtered = employees;
    if (args.status) filtered = filtered.filter(e => e.status === args.status);
    if (args.department) filtered = filtered.filter(e => e.department === args.department);
    if (args.search) {
      const s = args.search.toLowerCase();
      filtered = filtered.filter(e =>
        `${e.firstName} ${e.lastName || ''}`.toLowerCase().includes(s) ||
        (e.employeeId || "").toLowerCase().includes(s) ||
        e.email.toLowerCase().includes(s) ||
        e.department.toLowerCase().includes(s)
      );
    }
    const results = [];
    for (const e of filtered) {
      const faceUrl = e.faceImageId ? await ctx.storage.getUrl(e.faceImageId) : null;
      const aadharUrl = e.aadharImageId ? await ctx.storage.getUrl(e.aadharImageId) : null;
      const bankProofUrl = e.bankProofImageId ? await ctx.storage.getUrl(e.bankProofImageId) : null;
      const company = e.companyId ? await ctx.db.get(e.companyId) : null;
      let shiftName: string | undefined;
      if (e.shiftId) { const shift = await ctx.db.get(e.shiftId); shiftName = shift?.name; }
      results.push({
        _id: e._id, _creationTime: e._creationTime,
        firstName: e.firstName || e.fullName?.split(' ')[0] || '', lastName: e.lastName || (e.fullName?.split(' ').slice(1).join(' ')) || undefined, employeeId: e.employeeId,
        email: e.email, department: e.department, position: e.position,
        companyId: e.companyId, companyName: company?.name,
        shiftId: e.shiftId, shiftName,
        salaryType: e.salaryType, salaryRate: e.salaryRate,
        branch: e.branch, status: e.status,
        faceImageUrl: faceUrl ?? undefined,
        bankName: e.bankName, bankAccountNumber: e.bankAccountNumber,
        bankIfscCode: e.bankIfscCode, aadharNumber: e.aadharNumber,
        aadharImageUrl: aadharUrl ?? undefined,
        bankProofImageUrl: bankProofUrl ?? undefined,
      });
    }
    return results;
  },
});

export const getActiveWithFaces = query({
  args: { companyId: v.optional(v.id("companies")) },
  returns: v.array(v.object({
    _id: v.id("employees"), firstName: v.optional(v.string()), lastName: v.optional(v.string()), department: v.string(),
    faceImageUrl: v.optional(v.string()), companyId: v.optional(v.id("companies")),
    shiftId: v.optional(v.id("shifts")),
  })),
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
    const results = [];
    for (const e of active) {
      const faceUrl = e.faceImageId ? await ctx.storage.getUrl(e.faceImageId) : null;
      results.push({
        _id: e._id, firstName: e.firstName || e.fullName?.split(' ')[0] || '', lastName: e.lastName || (e.fullName?.split(' ').slice(1).join(' ')) || undefined, department: e.department,
        faceImageUrl: faceUrl ?? undefined, companyId: e.companyId, shiftId: e.shiftId,
      });
    }
    return results;
  },
});

export const create = mutation({
  args: {
    firstName: v.optional(v.string()), lastName: v.optional(v.string()), employeeId: v.optional(v.string()),
    email: v.string(), department: v.string(), position: v.string(),
    companyId: v.optional(v.id("companies")), shiftId: v.optional(v.id("shifts")),
    salaryType: v.string(), salaryRate: v.number(), branch: v.optional(v.string()),
    bankName: v.optional(v.string()), bankAccountNumber: v.optional(v.string()),
    bankIfscCode: v.optional(v.string()), aadharNumber: v.optional(v.string()),
  },
  returns: v.id("employees"),
  handler: async (ctx, args) => {
    await requireAdminOrHR(ctx);

    // Auto-assign to shared accounts based on position
    const sharedAccountAssignments = await autoAssignToSharedAccounts(ctx, args.position);
    const employeeDoc: any = {
      ...args,
      status: "active",
    };
    if (sharedAccountAssignments.length > 0) {
      employeeDoc.sharedAccountAssignments = sharedAccountAssignments;
    }

    const newEmployeeId = await ctx.db.insert("employees", employeeDoc);

    // Instant sync to Supabase
    await ctx.scheduler.runAfter(
      0,
      internal.supabaseSync.syncToSupabase,
      {
        tableName: "employees",
        recordId: newEmployeeId.toString(),
        payload: {
          employee_code: args.employeeId || '',
          first_name: args.firstName || '',
          last_name: args.lastName || '',
          email: args.email,
          department: args.department,
          position: args.position,
          company_name: '',
          shift_name: '',
          salary_type: args.salaryType,
          salary_rate: args.salaryRate,
          bank_name: args.bankName || '',
          bank_account: args.bankAccountNumber || '',
          ifsc_code: args.bankIfscCode || '',
          aadhar_number: args.aadharNumber || '',
          status: 'active',
          synced_at: new Date().toISOString(),
        }
      }
    );

    return newEmployeeId;
  },
});

export const update = mutation({
  args: {
    id: v.id("employees"), firstName: v.optional(v.string()), lastName: v.optional(v.string()), employeeId: v.optional(v.string()),
    email: v.string(), department: v.string(), position: v.string(),
    companyId: v.optional(v.id("companies")), shiftId: v.optional(v.id("shifts")),
    salaryType: v.string(), salaryRate: v.number(), branch: v.optional(v.string()),
    bankName: v.optional(v.string()), bankAccountNumber: v.optional(v.string()),
    bankIfscCode: v.optional(v.string()), aadharNumber: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminOrHR(ctx);
    const { id, ...data } = args;

    // Auto-assign to shared accounts based on position
    const sharedAccountAssignments = await autoAssignToSharedAccounts(ctx, args.position);
    const patchDoc: any = { ...data };
    // Optional schema field: never write null, use undefined to clear.
    patchDoc.sharedAccountAssignments =
      sharedAccountAssignments.length > 0 ? sharedAccountAssignments : undefined;

    await ctx.db.patch(id, patchDoc);

    // Instant sync to Supabase
    await ctx.scheduler.runAfter(
      0,
      internal.supabaseSync.syncToSupabase,
      {
        tableName: "employees",
        recordId: id.toString(),
        payload: {
          employee_code: args.employeeId || '',
          first_name: args.firstName || '',
          last_name: args.lastName || '',
          email: args.email,
          department: args.department,
          position: args.position,
          company_name: '',
          shift_name: '',
          salary_type: args.salaryType,
          salary_rate: args.salaryRate,
          bank_name: args.bankName || '',
          bank_account: args.bankAccountNumber || '',
          ifsc_code: args.bankIfscCode || '',
          aadhar_number: args.aadharNumber || '',
          status: 'active',
          synced_at: new Date().toISOString(),
        }
      }
    );

    return null;
  },
});

export const deactivate = mutation({
  args: { id: v.id("employees") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminOrHR(ctx);
    await ctx.db.patch(args.id, { status: "deactivated" });
    return null;
  },
});

export const reactivate = mutation({
  args: { id: v.id("employees") },
  returns: v.null(),
  handler: async (ctx, args) => { await requireAdminOrHR(ctx); await ctx.db.patch(args.id, { status: "active" }); return null; },
});

export const remove = mutation({
  args: { id: v.id("employees") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminForDelete(ctx);
    
    const employee = await ctx.db.get(args.id);
    if (!employee) throw new Error("Employee not found");

    // Delete all attendance records
    const attendance = await ctx.db.query("attendance").collect();
    for (const a of attendance.filter(a => a.employeeId === args.id)) {
      await ctx.db.delete(a._id);
    }

    // Delete all daily tasks
    const tasks = await ctx.db.query("dailyTasks").collect();
    for (const t of tasks.filter(t => t.employeeId === args.id)) {
      await ctx.db.delete(t._id);
    }

    // Delete all lunch breaks
    const breaks = await ctx.db.query("lunchBreaks").collect();
    for (const b of breaks.filter(b => b.employeeId === args.id)) {
      await ctx.db.delete(b._id);
    }

    // Delete all task extension requests
    const extensions = await ctx.db.query("taskExtensionRequests").collect();
    for (const e of extensions.filter(e => e.employeeId === args.id)) {
      await ctx.db.delete(e._id);
    }

    // Delete all salary deductions
    const deductions = await ctx.db.query("salaryDeductions").collect();
    for (const d of deductions.filter(d => d.employeeId === args.id)) {
      await ctx.db.delete(d._id);
    }

    // Delete all office session logs
    const logs = await ctx.db.query("officeSessionLogs").collect();
    for (const l of logs.filter(l => l.employeeId === args.id)) {
      await ctx.db.delete(l._id);
    }

    // Delete all task update submissions
    const submissions = await ctx.db.query("taskUpdateSubmissions").collect();
    for (const s of submissions.filter(s => s.employeeId === args.id)) {
      await ctx.db.delete(s._id);
    }

    // Delete all leave requests
    const leaves = await ctx.db.query("leaveRequests").collect();
    for (const l of leaves.filter(l => l.employeeId === args.id)) {
      await ctx.db.delete(l._id);
    }

    // Delete all early leave permissions
    const permissions = await ctx.db.query("earlyLeavePermissions").collect();
    for (const p of permissions.filter(p => p.employeeId === args.id)) {
      await ctx.db.delete(p._id);
    }

    // Delete stored images from storage
    if (employee.faceImageId) {
      try { await ctx.storage.delete(employee.faceImageId); } catch {}
    }
    if (employee.aadharImageId) {
      try { await ctx.storage.delete(employee.aadharImageId); } catch {}
    }
    if (employee.bankProofImageId) {
      try { await ctx.storage.delete(employee.bankProofImageId); } catch {}
    }

    // Delete linked user account + auth accounts
    try {
      const linkedUser = await ctx.db.query("users").collect();
      const userRecord = linkedUser.find(u => u.employeeId === args.id);
      if (userRecord) {
        // Delete auth accounts linked to this user
        try {
          const authAccounts = await ctx.db.query("authAccounts").collect();
          for (const auth of authAccounts.filter(a => a.userId === userRecord._id)) {
            await ctx.db.delete(auth._id);
          }
        } catch {}
        // Delete auth sessions
        try {
          const sessions = await ctx.db.query("authSessions").collect();
          for (const s of sessions.filter(s => s.userId === userRecord._id)) {
            await ctx.db.delete(s._id);
          }
        } catch {}
        await ctx.db.delete(userRecord._id);
      }
    } catch {}

    // Finally delete the employee record — this MUST always execute
    await ctx.db.delete(args.id);

    return null;
  },
});

export const registerFace = mutation({
  args: { id: v.id("employees"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminOrHR(ctx);
    await ctx.db.patch(args.id, { faceImageId: args.storageId, faceRegistered: true });
    // Auto-enroll into AWS in background so attendance recognition works immediately.
    await ctx.scheduler.runAfter(0, internal.faceRecognitionAction.enrollEmployeeFaceInternal, {
      employeeId: args.id,
      storageId: args.storageId,
    });
    return null;
  },
});

export const saveFaceDescriptor = mutation({
  args: { id: v.id("employees"), faceDescriptor: v.array(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminOrHR(ctx);
    await ctx.db.patch(args.id, { faceDescriptor: args.faceDescriptor, faceRegistered: true });
    return null;
  },
});

export const getEmployeesWithDescriptors = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("employees"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    department: v.string(),
    faceDescriptor: v.array(v.number()),
  })),
  handler: async (ctx) => {
    await requireAuth(ctx);
    const employees = await ctx.db.query("employees").collect();
    const active = employees.filter(e => e.status === "active" && e.faceDescriptor && e.faceDescriptor.length > 0);
    return active.map(e => ({
      _id: e._id,
      firstName: e.firstName || (e as any).fullName?.split(' ')[0] || '',
      lastName: e.lastName || ((e as any).fullName?.split(' ').slice(1).join(' ')) || undefined,
      department: e.department,
      faceDescriptor: e.faceDescriptor!,
    }));
  },
});

export const uploadAadhar = mutation({
  args: { id: v.id("employees"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => { await requireAuth(ctx); await ctx.db.patch(args.id, { aadharImageId: args.storageId }); return null; },
});

export const uploadBankProof = mutation({
  args: { id: v.id("employees"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => { await requireAuth(ctx); await ctx.db.patch(args.id, { bankProofImageId: args.storageId }); return null; },
});

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => { await requireAuth(ctx); return await ctx.storage.generateUploadUrl(); },
});

export const getDepartments = query({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    await requireAuth(ctx);
    const employees = await ctx.db.query("employees").collect();
    return Array.from(new Set(employees.map(e => e.department)));
  },
});

export const getByEmail = query({
  args: { email: v.string() },
  returns: v.union(v.object({ _id: v.id("employees"), firstName: v.optional(v.string()), lastName: v.optional(v.string()), companyId: v.optional(v.id("companies")) }), v.null()),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const email = args.email.toLowerCase();
    const emp = await ctx.db.query("employees")
      .withIndex("by_email", (q: any) => q.eq("email", email)).first();
    if (!emp) return null;
    return { _id: emp._id, firstName: emp.firstName || emp.fullName?.split(' ')[0] || '', lastName: emp.lastName || (emp.fullName?.split(' ').slice(1).join(' ')) || undefined, companyId: emp.companyId };
  },
});

export const migrateFullNameToFirstLast = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const employees = await ctx.db.query("employees").collect();
    let count = 0;
    for (const emp of employees) {
      if (emp.fullName && !emp.firstName) {
        const parts = emp.fullName.split(' ');
        const firstName = parts[0] || '';
        const lastName = parts.slice(1).join(' ') || undefined;
        await ctx.db.patch(emp._id, { firstName, lastName });
        count++;
      }
    }
    // Also migrate users
    const users = await ctx.db.query("users").collect();
    for (const u of users) {
      if (u.name && !u.firstName) {
        const parts = u.name.split(' ');
        await ctx.db.patch(u._id, { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || undefined });
        count++;
      }
    }
    return count;
  },
});

export const autoAssignExistingEmployees = mutation({
  args: {},
  returns: v.object({ updated: v.number(), failed: v.number() }),
  handler: async (ctx) => {
    // No auth required - system maintenance function
    const employees = await ctx.db.query("employees").collect();
    let updated = 0;
    let failed = 0;
    
    for (const emp of employees) {
      try {
        // Skip if already assigned
        if (emp.sharedAccountAssignments && Array.isArray(emp.sharedAccountAssignments) && emp.sharedAccountAssignments.length > 0) {
          continue;
        }
        
        // Auto-assign based on position using system assignments (no user ID)
        const employeeAccountRoles = ["Property Manager", "Technician", "Housekeeping"];
        const officeAccountRoles = ["Software", "Accounting", "General", "Management"];
        const assignments: any[] = [];
        
        if (employeeAccountRoles.includes(emp.position)) {
          assignments.push({
            accountEmail: "employee@gmail.com",
            allowedRole: emp.position,
            assignedAt: Date.now(),
          });
        }
        
        if (officeAccountRoles.includes(emp.position)) {
          assignments.push({
            accountEmail: "office@gmail.com",
            allowedRole: emp.position,
            assignedAt: Date.now(),
          });
        }
        
        if (assignments.length > 0) {
          await ctx.db.patch(emp._id, { sharedAccountAssignments: assignments });
          updated++;
        }
      } catch (err) {
        console.error(`Failed to assign shared accounts for employee ${emp._id}:`, err);
        failed++;
      }
    }
    
    return { updated, failed };
  },
});

export const deactivateFromFaceRecognition = mutation({
  args: { id: v.id("employees") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminOrHR(ctx);
    
    const employee = await ctx.db.get(args.id);
    if (!employee) throw new Error("Employee not found");
    
    // Deactivate employee
    await ctx.db.patch(args.id, { status: "deactivated", faceRegistered: false });
    
    // Remove AWS face mapping for this employee if exists
    try {
      const mapping = await ctx.db.query("awsFaceMappings")
        .withIndex("by_employee", (q: any) => q.eq("employeeId", args.id))
        .first();
      
      if (mapping) {
        await ctx.db.delete(mapping._id);
      }
    } catch (err) {
      console.warn("Could not remove AWS face mapping:", err);
    }
    
    return null;
  },
});

async function autoAssignToSharedAccounts(ctx: any, position: string, userId?: any) {
  const employeeAccountRoles = ["Property Manager", "Technician", "Housekeeping"];
  const officeAccountRoles = ["Software", "Accounting", "General", "Management"];
  
  const assignments: any[] = [];
  
  // Get current user ID if not provided
  let assignedBy = userId;
  if (!assignedBy) {
    const identity = await ctx.auth.getUserIdentity();
    if (identity && identity.email) {
      const user = await ctx.db.query("users")
        .withIndex("email", (q: any) => q.eq("email", identity.email.toLowerCase()))
        .first();
      if (user) assignedBy = user._id;
    }
  }
  
  if (!assignedBy) {
    // No valid user - return empty (don't create assignments)
    return [];
  }
  
  if (employeeAccountRoles.includes(position)) {
    assignments.push({
      accountEmail: "employee@gmail.com",
      allowedRole: position,
      assignedAt: Date.now(),
      assignedBy,
    });
  }
  
  if (officeAccountRoles.includes(position)) {
    assignments.push({
      accountEmail: "office@gmail.com",
      allowedRole: position,
      assignedAt: Date.now(),
      assignedBy,
    });
  }
  
  return assignments;
}

async function autoAssignToSharedAccountsWithUser(ctx: any, position: string, userId: any) {
  const employeeAccountRoles = ["Property Manager", "Technician", "Housekeeping"];
  const officeAccountRoles = ["Software", "Accounting", "General", "Management"];
  
  const assignments: any[] = [];
  
  if (employeeAccountRoles.includes(position)) {
    assignments.push({
      accountEmail: "employee@gmail.com",
      allowedRole: position,
      assignedAt: Date.now(),
      assignedBy: userId,
    });
  }
  
  if (officeAccountRoles.includes(position)) {
    assignments.push({
      accountEmail: "office@gmail.com",
      allowedRole: position,
      assignedAt: Date.now(),
      assignedBy: userId,
    });
  }
  
  return assignments;
}
// Alias used by EmployeeAccountAssignmentScreen — returns all employees across all companies.
export const getAllEmployees = query({
  args: {},
  returns: v.array(employeeReturn),
  handler: async (ctx) => {
    await requireAuth(ctx);
    const employees = await ctx.db.query("employees").collect();
    const results = [];
    for (const e of employees) {
      const faceUrl = e.faceImageId ? await ctx.storage.getUrl(e.faceImageId) : null;
      const aadharUrl = e.aadharImageId ? await ctx.storage.getUrl(e.aadharImageId) : null;
      const bankProofUrl = e.bankProofImageId ? await ctx.storage.getUrl(e.bankProofImageId) : null;
      const company = e.companyId ? await ctx.db.get(e.companyId) : null;
      let shiftName: string | undefined;
      if (e.shiftId) { const shift = await ctx.db.get(e.shiftId); shiftName = shift?.name; }
      results.push({
        _id: e._id, _creationTime: e._creationTime,
        firstName: e.firstName || e.fullName?.split(' ')[0] || '',
        lastName: e.lastName || e.fullName?.split(' ').slice(1).join(' ') || undefined,
        employeeId: e.employeeId,
        email: e.email, department: e.department, position: e.position,
        companyId: e.companyId, companyName: company?.name,
        shiftId: e.shiftId, shiftName,
        salaryType: e.salaryType, salaryRate: e.salaryRate,
        branch: e.branch, status: e.status,
        faceImageUrl: faceUrl ?? undefined,
        bankName: e.bankName, bankAccountNumber: e.bankAccountNumber,
        bankIfscCode: e.bankIfscCode, aadharNumber: e.aadharNumber,
        aadharImageUrl: aadharUrl ?? undefined,
        bankProofImageUrl: bankProofUrl ?? undefined,
      });
    }
    return results;
  },
});