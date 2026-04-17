import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";

export const departmentStats = query({
args: { date: v.optional(v.string()), companyId: v.optional(v.id("companies")) },
returns: v.array(v.object({
department: v.string(),
total: v.number(),
present: v.number(),
late: v.number(),
absent: v.number(),
rate: v.number(),
})),
handler: async (ctx, args) => {
await requireAuth(ctx);
const date = args.date ?? new Date().toISOString().split("T")[0];

let employees;
if (args.companyId) {
employees = await ctx.db.query("employees")
.withIndex("by_company", (q: any) => q.eq("companyId", args.companyId))
.collect();
} else {
employees = await ctx.db.query("employees").collect();
}
const active = employees.filter((e: any) => e.status === "active");

const records = await ctx.db.query("attendance")
.withIndex("by_date", (q: any) => q.eq("date", date))
.collect();

const deptMap: Record<string, { total: number; present: number; late: number }> = {};
for (const emp of active) {
if (!deptMap[emp.department]) {
deptMap[emp.department] = { total: 0, present: 0, late: 0 };
}
deptMap[emp.department].total++;
}

for (const r of records) {
const emp = await ctx.db.get(r.employeeId);
if (!emp) continue;
if (deptMap[emp.department]) {
if (r.status === "present") deptMap[emp.department].present++;
if (r.status === "late") deptMap[emp.department].late++;
}
}

return Object.entries(deptMap).map(([dept, data]) => ({
department: dept,
total: data.total,
present: data.present,
late: data.late,
absent: Math.max(0, data.total - data.present - data.late),
rate: data.total > 0 ? Math.round(((data.present + data.late) / data.total) * 100) : 0,
}));
},
});
