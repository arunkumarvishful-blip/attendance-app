import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireAdminOrHR } from "./helpers";

export const list = query({
args: { departmentId: v.optional(v.id("departments")) },
returns: v.array(v.object({
_id: v.id("positions"),
_creationTime: v.number(),
name: v.string(),
departmentId: v.optional(v.id("departments")),
departmentName: v.optional(v.string()),
})),
handler: async (ctx, args) => {
await requireAuth(ctx);
let positions;
if (args.departmentId) {
positions = await ctx.db.query("positions")
.withIndex("by_department", (q: any) => q.eq("departmentId", args.departmentId))
.collect();
} else {
positions = await ctx.db.query("positions").collect();
}
const results = [];
for (const p of positions) {
let departmentName: string | undefined;
if (p.departmentId) {
const d = await ctx.db.get(p.departmentId);
if (d) departmentName = d.name;
}
results.push({
_id: p._id, _creationTime: p._creationTime,
name: p.name, departmentId: p.departmentId, departmentName,
});
}
return results.sort((a, b) => a.name.localeCompare(b.name));
},
});

export const create = mutation({
args: { name: v.string(), departmentId: v.optional(v.id("departments")) },
returns: v.id("positions"),
handler: async (ctx, args) => {
await requireAdminOrHR(ctx);
return await ctx.db.insert("positions", args);
},
});

export const update = mutation({
args: { id: v.id("positions"), name: v.string(), departmentId: v.optional(v.id("departments")) },
returns: v.null(),
handler: async (ctx, args) => {
await requireAdminOrHR(ctx);
const { id, ...data } = args;
await ctx.db.patch(id, data);
return null;
},
});

export const remove = mutation({
args: { id: v.id("positions") },
returns: v.null(),
handler: async (ctx, args) => {
await requireAdminOrHR(ctx);
await ctx.db.delete(args.id);
return null;
},
});
