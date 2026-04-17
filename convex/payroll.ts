import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireAdminOrHR, requireAdminForDelete } from "./helpers";
import { internal } from "./_generated/api";

const payrollReturn = v.object({
  _id: v.id("payroll"), _creationTime: v.number(),
  employeeId: v.id("employees"), employeeName: v.optional(v.string()),
  department: v.optional(v.string()), companyId: v.optional(v.id("companies")),
  companyName: v.optional(v.string()), month: v.string(), year: v.number(),
  baseSalary: v.number(), daysWorked: v.number(), totalDays: v.number(),
  nonWorkingDays: v.optional(v.number()), leaveDays: v.optional(v.number()),
  approvedLeaveDays: v.optional(v.number()), rejectedLeaveDays: v.optional(v.number()),
  absentDays: v.optional(v.number()),
  halfDays: v.optional(v.number()), workingDaysInMonth: v.optional(v.number()),
  hoursWorked: v.optional(v.number()), overtimeHours: v.optional(v.number()),
  overtimePay: v.number(), deductions: v.number(), bonus: v.optional(v.number()),
  netSalary: v.number(), status: v.string(), salaryType: v.optional(v.string()),
  paidDate: v.optional(v.string()), paymentMode: v.optional(v.string()),
  paymentReference: v.optional(v.string()),
});

export const getByMonth = query({
  args: { month: v.string(), year: v.number(), companyId: v.optional(v.id("companies")) },
  returns: v.array(payrollReturn),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    let records;
    if (args.companyId) {
      records = await ctx.db.query("payroll")
        .withIndex("by_company_and_month", (q: any) =>
          q.eq("companyId", args.companyId).eq("month", args.month).eq("year", args.year)).collect();
    } else {
      records = await ctx.db.query("payroll")
        .withIndex("by_month", (q: any) =>
          q.eq("month", args.month).eq("year", args.year)).collect();
    }
    const results = [];
    for (const r of records) {
      const emp = await ctx.db.get(r.employeeId);
      const company = r.companyId ? await ctx.db.get(r.companyId) : null;
      results.push({
        ...r, employeeName: emp ? (emp.firstName ? `${emp.firstName} ${emp.lastName || ''}`.trim() : (emp.fullName || '')) : undefined, department: emp?.department,
        companyName: company?.name, salaryType: emp?.salaryType,
      });
    }
    return results;
  },
});

export const getMyPayroll = query({
  args: { employeeId: v.id("employees") },
  returns: v.array(payrollReturn),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const records = await ctx.db.query("payroll")
      .withIndex("by_employee_and_month", (q: any) => q.eq("employeeId", args.employeeId)).collect();
    const results = [];
    for (const r of records) {
      const emp = await ctx.db.get(r.employeeId);
      const company = r.companyId ? await ctx.db.get(r.companyId) : null;
      results.push({
        ...r, employeeName: emp ? (emp.firstName ? `${emp.firstName} ${emp.lastName || ''}`.trim() : (emp.fullName || '')) : undefined, department: emp?.department,
        companyName: company?.name, salaryType: emp?.salaryType,
      });
    }
    return results;
  },
});

export const generate = mutation({
  args: { companyId: v.optional(v.id("companies")), month: v.string(), year: v.union(v.string(), v.number()) },
  handler: async (ctx, { companyId, month, year }) => {
    await requireAdminOrHR(ctx);

    const yearNum = typeof year === 'string' ? parseInt(year as string) : (year as number);
    const monthNum = parseInt(month);
    const daysInMonth = new Date(yearNum, monthNum, 0).getDate();

    // Get employees — filter by company if provided, otherwise get all active employees
    let employees;
    if (companyId) {
      employees = (await ctx.db.query("employees").collect()).filter(
        (e: any) => e.companyId === companyId && e.status === "active"
      );
    } else {
      employees = (await ctx.db.query("employees").collect()).filter(
        (e: any) => e.status === "active"
      );
    }

    for (const emp of employees) {
      // Get attendance records for this employee this month
      const allAttendance = (await ctx.db.query("attendance").collect()).filter(
        (a: any) => a.employeeId === emp._id
      );
      const recordsThisMonth = allAttendance.filter((a: any) => {
        const aDate = new Date(a.date);
        return aDate.getMonth() + 1 === monthNum && aDate.getFullYear() === yearNum;
      });

      // Count full days and half days
      const fullDaysAttended = recordsThisMonth.filter((r: any) => !r.isHalfDay).length;
      const halfDaysWorked = recordsThisMonth.filter((r: any) => r.isHalfDay === true).length;

      // Get leave records for this employee
      const allLeaves = (await ctx.db.query("leaveRequests").collect()).filter(
        (l: any) => l.employeeId === emp._id
      );

      // Count actual approved leave days in this month
      let leaveDays = 0;
      for (const leave of allLeaves) {
        if (leave.status !== "approved") continue;
        const fromDate = new Date(leave.startDate || leave.fromDate);
        const toDate = new Date(leave.endDate || leave.toDate);
        if (fromDate.getMonth() + 1 === monthNum && fromDate.getFullYear() === yearNum) {
          const diffTime = toDate.getTime() - fromDate.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
          leaveDays += diffDays;
        }
      }

      // Count non-working days (Sundays) in the month
      let nonWorkingDays = 0;
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(yearNum, monthNum - 1, day);
        if (date.getDay() === 0) nonWorkingDays++;
      }

      // Pending days = future/unaccounted days (treated as present)
      const pendingDays = Math.max(0, daysInMonth - fullDaysAttended - halfDaysWorked - leaveDays - nonWorkingDays);

      // Days Worked = attendance + half days + non-working days + pending days
      const daysWorked = fullDaysAttended + halfDaysWorked + nonWorkingDays + pendingDays;
      // Absent Days = approved leave days only
      const absentDays = leaveDays;

      // Per Day Salary = Base Salary / Total Calendar Days
      const baseSalary = emp.salaryRate;
      const perDaySalary = baseSalary / daysInMonth;

      // Total Deductions = (absent days × per day salary) + (half days × per day salary × 0.5)
      const absentDeduction = absentDays * perDaySalary;
      const halfDayDeduction = halfDaysWorked * (perDaySalary * 0.5);
      const totalDeductions = absentDeduction + halfDayDeduction;

      // Salary = Base Salary - Total Deductions
      const salary = baseSalary - totalDeductions;
      // Net Salary = Salary + Bonus (lumpsum)
      const bonus = 0;
      const netSalary = salary + bonus;

      // Check if payroll already exists for this employee/month/year
      const allPayroll = await ctx.db.query("payroll").collect();
      const existing = allPayroll.find(
        (p: any) => p.employeeId === emp._id && p.month === month && p.year === yearNum
      );

      const payrollData = {
        baseSalary: Math.round(baseSalary * 100) / 100,
        daysWorked,
        totalDays: daysInMonth,
        absentDays,
        halfDays: halfDaysWorked,
        nonWorkingDays,
        approvedLeaveDays: leaveDays,
        rejectedLeaveDays: 0,
        leaveDays,
        workingDaysInMonth: daysInMonth - nonWorkingDays,
        hoursWorked: 0,
        overtimeHours: 0,
        overtimePay: 0,
        deductions: Math.round(totalDeductions * 100) / 100,
        bonus,
        netSalary: Math.round(netSalary * 100) / 100,
      };

      if (existing) {
        await ctx.db.patch(existing._id, payrollData);
      } else {
        await ctx.db.insert("payroll", {
          employeeId: emp._id,
          companyId: emp.companyId,
          month,
          year: yearNum,
          ...payrollData,
          status: "draft",
        });
      }

      // Instant sync to Supabase
      const empName = emp.firstName
        ? `${emp.firstName} ${emp.lastName || ''}`.trim()
        : '';
      await ctx.scheduler.runAfter(
        0,
        internal.supabaseSync.syncToSupabase,
        {
          tableName: "payroll",
          recordId: emp._id.toString() + "_" + month,
          payload: {
            employee_name: empName,
            month: month,
            year: yearNum,
            base_salary: payrollData.baseSalary,
            days_worked: payrollData.daysWorked,
            total_days: payrollData.totalDays,
            overtime_pay: payrollData.overtimePay,
            deductions: payrollData.deductions,
            bonus: payrollData.bonus,
            net_salary: payrollData.netSalary,
            status: 'draft',
            paid_date: null,
            synced_at: new Date().toISOString(),
          }
        }
      );
    }

    return { success: true, message: `Generated payroll for ${employees.length} employees` };
  },
});

export const approve = mutation({
  args: { id: v.id("payroll") },
  returns: v.null(),
  handler: async (ctx, args) => { await requireAdminOrHR(ctx); await ctx.db.patch(args.id, { status: "approved" }); return null; },
});

export const markPaid = mutation({
  args: {
    id: v.id("payroll"),
    paidDate: v.string(),
    paymentMode: v.string(),
    paymentReference: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminOrHR(ctx);
    await ctx.db.patch(args.id, {
      status: "paid",
      paidDate: args.paidDate,
      paymentMode: args.paymentMode,
      paymentReference: args.paymentReference || undefined,
    });

    // Instant sync to Supabase
    await ctx.scheduler.runAfter(
      0,
      internal.supabaseSync.syncToSupabase,
      {
        tableName: "payroll",
        recordId: args.id.toString(),
        payload: {
          employee_name: '',
          month: '',
          year: 0,
          base_salary: 0,
          days_worked: 0,
          total_days: 0,
          overtime_pay: 0,
          deductions: 0,
          bonus: 0,
          net_salary: 0,
          status: 'paid',
          paid_date: args.paidDate,
          synced_at: new Date().toISOString(),
        }
      }
    );

    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("payroll") },
  returns: v.null(),
  handler: async (ctx, args) => { await requireAdminForDelete(ctx); await ctx.db.delete(args.id); return null; },
});

// Update bonus on an existing payroll record
export const updateBonus = mutation({
  args: { id: v.id("payroll"), bonus: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminOrHR(ctx);
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");
    // Net = (Base - Deductions) + Bonus
    const salary = record.baseSalary - record.deductions;
    const newNet = salary + args.bonus;
    await ctx.db.patch(args.id, {
      bonus: args.bonus,
      netSalary: Math.round(newNet * 100) / 100,
    });
    return null;
  },
});

export const list = query({
  args: {},
  returns: v.array(payrollReturn),
  handler: async (ctx) => {
    // For internal sync use - returns all payroll records
    const records = await ctx.db.query("payroll").collect();
    const results = [];
    for (const r of records) {
      const emp = await ctx.db.get(r.employeeId);
      const company = r.companyId ? await ctx.db.get(r.companyId) : null;
      results.push({
        ...r,
        employeeName: emp ? (emp.firstName ? `${emp.firstName} ${emp.lastName || ''}`.trim() : (emp.fullName || '')) : undefined,
        department: emp?.department,
        companyName: company?.name,
        salaryType: emp?.salaryType,
      });
    }
    return results;
  },
});