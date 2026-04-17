import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireAdminOrHR } from "./helpers";

export const list = query({
args: { companyId: v.optional(v.id("companies")) },
returns: v.array(v.object({
_id: v.id("departments"),
_creationTime: v.number(),
name: v.string(),
companyId: v.optional(v.id("companies")),
companyName: v.optional(v.string()),
})),
handler: async (ctx, args) => {
await requireAuth(ctx);
let departments;
if (args.companyId) {
departments = await ctx.db.query("departments")
.withIndex("by_company", (q: any) => q.eq("companyId", args.companyId))
.collect();
} else {
departments = await ctx.db.query("departments").collect();
}
const results = [];
for (const d of departments) {
let companyName: string | undefined;
if (d.companyId) {
const c = await ctx.db.get(d.companyId);
if (c) companyName = c.name;
}
results.push({
_id: d._id, _creationTime: d._creationTime,
name: d.name, companyId: d.companyId, companyName,
});
}
return results.sort((a, b) => a.name.localeCompare(b.name));
},
});

export const create = mutation({
args: { name: v.string(), companyId: v.optional(v.id("companies")) },
returns: v.id("departments"),
handler: async (ctx, args) => {
await requireAdminOrHR(ctx);
return await ctx.db.insert("departments", args);
},
});

export const update = mutation({
args: { id: v.id("departments"), name: v.string(), companyId: v.optional(v.id("companies")) },
returns: v.null(),
handler: async (ctx, args) => {
await requireAdminOrHR(ctx);
const { id, ...data } = args;
await ctx.db.patch(id, data);
return null;
},
});

export const remove = mutation({
args: { id: v.id("departments") },
returns: v.null(),
handler: async (ctx, args) => {
await requireAdminOrHR(ctx);
await ctx.db.delete(args.id);
return null;
},
});
