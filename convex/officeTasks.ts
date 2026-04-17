import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

function getWeekNumber(dateStr: string): number {
  const date = new Date(dateStr);
  const firstDay = new Date(date.getFullYear(), 0, 1);
  return Math.ceil((((date.getTime() - firstDay.getTime()) / 86400000) + firstDay.getDay() + 1) / 7);
}

function calculateDeadline(date: string, difficulty: string): string {
  if (difficulty.toLowerCase() === "hard") {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + 2);
    return d.toISOString().split("T")[0];
  }
  return date; // Easy/Medium = same day
}

export const getEmployeeTasks = query({
  args: { employeeId: v.id("employees"), date: v.string() },
  handler: async (ctx, args) => {
    const tasks = await ctx.db.query("dailyTasks")
      .withIndex("by_employee_date", q => q.eq("employeeId", args.employeeId).eq("date", args.date))
      .collect();
    const extReqs = await ctx.db.query("taskExtensionRequests").collect();
    const submissions = await ctx.db.query("taskUpdateSubmissions")
      .withIndex("by_employee_date", q => q.eq("employeeId", args.employeeId).eq("date", args.date))
      .collect();
    return tasks.map(t => {
      const ext = extReqs.find(e => e.taskId.toString() === t._id.toString());
      const sub = submissions.find(s => s.taskId.toString() === t._id.toString());
      return {
        _id: t._id, title: t.title, description: t.description, difficulty: t.difficulty,
        status: t.status, deadline: t.deadline || t.date,
        assignedBy: t.assignedBy, assignedAt: t.assignedAt,
        extensionRequest: ext ? { _id: ext._id, status: ext.status, reason: ext.reason, isAutoApproved: ext.isAutoApproved } : null,
        submission: sub ? { _id: sub._id, status: sub.status, reason: sub.reason, adminResponse: sub.adminResponse, responseNote: sub.responseNote } : null,
      };
    });
  },
});

export const updateTaskStatus = mutation({
  args: { taskId: v.id("dailyTasks"), status: v.string() },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return { success: false, message: "Task not found" };
    await ctx.db.patch(args.taskId, {
      status: args.status, statusUpdatedAt: Date.now(),
      completedAt: args.status === "completed" ? Date.now() : undefined,
    });
    return { success: true, message: `Task marked as ${args.status}` };
  },
});

export const assignTask = mutation({
  args: {
    employeeId: v.id("employees"), date: v.string(), title: v.string(),
    description: v.optional(v.string()), difficulty: v.string(), assignedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const emp = await ctx.db.get(args.employeeId);
    if (!emp) return { success: false, message: "Employee not found" };
    
    const deadline = calculateDeadline(args.date, args.difficulty);
    
    // Create task
    const taskId = await ctx.db.insert("dailyTasks", {
      employeeId: args.employeeId, companyId: emp.companyId, date: args.date,
      title: args.title, description: args.description, difficulty: args.difficulty,
      status: "pending", deadline, assignedBy: args.assignedBy, assignedAt: Date.now(),
    });
    
    // If hard task, auto-create 2-day extension
    if (args.difficulty.toLowerCase() === "hard") {
      const weekNum = getWeekNumber(args.date);
      await ctx.db.insert("taskExtensionRequests", {
        taskId, employeeId: args.employeeId, date: args.date,
        reason: "Hard task: 2-day auto-extension", status: "auto_approved",
        requestedAt: Date.now(), weekNumber: weekNum, isAutoApproved: true,
      });
    }
    
    return { success: true, message: "Task assigned" + (args.difficulty.toLowerCase() === "hard" ? ` (Deadline: ${deadline})` : "") };
  },
});

export const requestTaskExtension = mutation({
  args: { taskId: v.id("dailyTasks"), reason: v.string() },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return { success: false, message: "Task not found" };
    if (task.difficulty !== "hard") return { success: false, message: "Only Hard tasks can request extensions" };
    if (task.status === "completed" || task.status === "extended") return { success: false, message: "Task already completed/extended" };
    const existing = await ctx.db.query("taskExtensionRequests").collect();
    if (existing.find(e => e.taskId.toString() === args.taskId.toString())) {
      return { success: false, message: "Extension already requested" };
    }
    const weekNum = getWeekNumber(task.date);
    const weekReqs = await ctx.db.query("taskExtensionRequests")
      .withIndex("by_employee_week", q => q.eq("employeeId", task.employeeId).eq("weekNumber", weekNum)).collect();
    const autoCount = weekReqs.filter(r => r.isAutoApproved).length;
    const isAuto = autoCount < 2;
    await ctx.db.insert("taskExtensionRequests", {
      taskId: args.taskId, employeeId: task.employeeId, date: task.date, reason: args.reason,
      status: isAuto ? "auto_approved" : "pending", requestedAt: Date.now(), weekNumber: weekNum, isAutoApproved: isAuto,
    });
    if (isAuto) {
      await ctx.db.patch(args.taskId, { status: "extended" });
    } else {
      await ctx.db.patch(args.taskId, { status: "extension_requested" });
    }
    return { success: true, isAutoApproved: isAuto,
      message: isAuto ? "Auto-approved (within weekly limit). No deduction." : "Extension request sent. Awaiting approval." };
  },
});

export const getExtensionRequests = query({
  args: {},
  handler: async (ctx) => {
    const reqs = await ctx.db.query("taskExtensionRequests")
      .withIndex("by_status", q => q.eq("status", "pending")).collect();
    const enriched = [];
    for (const req of reqs) {
      const task = await ctx.db.get(req.taskId);
      const emp = await ctx.db.get(req.employeeId);
      enriched.push({
        ...req, taskTitle: task?.title || "Unknown", taskDifficulty: task?.difficulty || "",
        employeeName: `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim(), employeeDepartment: emp?.department || "",
      });
    }
    return enriched;
  },
});

export const respondToExtension = mutation({
  args: { requestId: v.id("taskExtensionRequests"), approved: v.boolean(), respondedBy: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const req = await ctx.db.get(args.requestId);
    if (!req) return { success: false, message: "Request not found" };
    if (req.status !== "pending") return { success: false, message: "Already processed" };
    await ctx.db.patch(args.requestId, {
      status: args.approved ? "approved" : "rejected", respondedAt: Date.now(), respondedBy: args.respondedBy,
    });
    if (args.approved) await ctx.db.patch(req.taskId, { status: "extended" });
    return { success: true, message: args.approved ? "Extension approved" : "Extension rejected" };
  },
});

export const submitTaskUpdate = mutation({
  args: {
    employeeId: v.id("employees"),
    taskId: v.id("dailyTasks"),
    status: v.string(), // "completed" or "incomplete"
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return { success: false, message: "Task not found" };
    
    // Check for existing submission
    const existing = await ctx.db.query("taskUpdateSubmissions")
      .withIndex("by_employee_date", q => q.eq("employeeId", args.employeeId).eq("date", task.date))
      .collect();
    if (existing.find(s => s.taskId.toString() === args.taskId.toString() && s.adminResponse === "pending")) {
      return { success: false, message: "Submission already pending for this task" };
    }
    
    // Create submission
    await ctx.db.insert("taskUpdateSubmissions", {
      employeeId: args.employeeId,
      taskId: args.taskId,
      date: task.date,
      status: args.status,
      reason: args.reason,
      adminResponse: "pending",
      submittedAt: Date.now(),
    });
    
    return { success: true, message: "Task update submitted for admin review" };
  },
});

export const getTaskUpdateSubmissions = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const submissions = args.status
      ? await ctx.db.query("taskUpdateSubmissions")
          .withIndex("by_status", q => q.eq("adminResponse", args.status))
          .collect()
      : await ctx.db.query("taskUpdateSubmissions").collect();
    
    const enriched = [];
    for (const sub of submissions) {
      const emp = await ctx.db.get(sub.employeeId);
      const task = await ctx.db.get(sub.taskId);
      enriched.push({
        ...sub,
        employeeName: `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim(),
        employeeDept: emp?.department || "",
        taskTitle: task?.title || "Unknown",
        taskDifficulty: task?.difficulty || "",
      });
    }
    return enriched.sort((a, b) => b.submittedAt - a.submittedAt);
  },
});

export const respondToTaskUpdate = mutation({
  args: {
    submissionId: v.id("taskUpdateSubmissions"),
    approved: v.boolean(),
    responseNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.submissionId);
    if (!sub) return { success: false, message: "Submission not found" };
    if (sub.adminResponse !== "pending") return { success: false, message: "Already reviewed" };
    
    await ctx.db.patch(args.submissionId, {
      adminResponse: args.approved ? "approved" : "rejected",
      responseNote: args.responseNote,
      respondedAt: Date.now(),
    });
    
    // If approved and status is "completed", mark the task as completed
    if (args.approved && sub.status === "completed") {
      await ctx.db.patch(sub.taskId, {
        status: "completed",
        completedAt: Date.now(),
        statusUpdatedAt: Date.now(),
      });
    }
    
    return { success: true, message: args.approved ? "Submission approved" : "Submission rejected" };
  },
});