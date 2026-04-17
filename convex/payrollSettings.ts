import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireAdminOrHR } from "./helpers";

const settingsReturn = v.object({
_id: v.id("payrollSettings"),
companyId: v.id("companies"),
overtimeMultiplier: v.number(),
latePenaltyPercent: v.number(),
taxPercent: v.optional(v.number()),
pfPercent: v.optional(v.number()),
esiPercent: v.optional(v.number()),
});

export const getByCompany = query({
args: { companyId: v.id("companies") },
returns: v.union(settingsReturn, v.null()),
handler: async (ctx, args) => {
await requireAuth(ctx);
const s = await ctx.db.query("payrollSettings")
.withIndex("by_company", (q: any) => q.eq("companyId", args.companyId))
.first();
if (!s) return null;
return {
_id: s._id,
companyId: s.companyId,
overtimeMultiplier: s.overtimeMultiplier,
latePenaltyPercent: s.latePenaltyPercent,
taxPercent: s.taxPercent,
pfPercent: s.pfPercent,
esiPercent: s.esiPercent,
};
},
});

export const upsert = mutation({
args: {
companyId: v.id("companies"),
overtimeMultiplier: v.number(),
latePenaltyPercent: v.number(),
taxPercent: v.optional(v.number()),
pfPercent: v.optional(v.number()),
esiPercent: v.optional(v.number()),
},
returns: v.null(),
handler: async (ctx, args) => {
await requireAdminOrHR(ctx);
const existing = await ctx.db.query("payrollSettings")
.withIndex("by_company", (q: any) => q.eq("companyId", args.companyId))
.first();
if (existing) {
await ctx.db.patch(existing._id, {
overtimeMultiplier: args.overtimeMultiplier,
latePenaltyPercent: args.latePenaltyPercent,
taxPercent: args.taxPercent,
pfPercent: args.pfPercent,
esiPercent: args.esiPercent,
});
} else {
await ctx.db.insert("payrollSettings", args);
}
return null;
},
});
