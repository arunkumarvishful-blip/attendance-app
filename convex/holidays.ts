import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireAdminOrHR } from "./helpers";

const holidayReturn = v.object({
  _id: v.id("holidays"),
  name: v.string(),
  date: v.string(),
  type: v.string(),
  companyId: v.optional(v.id("companies")),
  companyName: v.optional(v.string()),
  year: v.number(),
});

export const list = query({
  args: { year: v.number(), companyId: v.optional(v.id("companies")) },
  returns: v.array(holidayReturn),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const holidays = await ctx.db.query("holidays")
      .withIndex("by_year", (q: any) => q.eq("year", args.year))
      .collect();
    
    // Filter by company if specified
    const filtered = args.companyId
      ? holidays.filter((h: any) => h.companyId === args.companyId)
      : holidays;
    
    const results = [];
    for (const h of filtered) {
      let companyName: string | undefined;
      if (h.companyId) {
        const company = await ctx.db.get(h.companyId);
        companyName = company?.name;
      }
      results.push({
        _id: h._id, name: h.name, date: h.date,
        type: h.type, companyId: h.companyId, companyName, year: h.year,
      });
    }
    return results;
  },
});

export const create = mutation({
  args: { name: v.string(), date: v.string(), type: v.string(), companyIds: v.optional(v.array(v.id("companies"))), year: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    await requireAdminOrHR(ctx);
    
    // If no companies provided, add for all companies
    let targetCompanyIds = args.companyIds || [];
    if (targetCompanyIds.length === 0) {
      const allCompanies = await ctx.db.query("companies").collect();
      targetCompanyIds = allCompanies.map((c: any) => c._id);
    }
    
    // Check for duplicates and insert
    const existing = await ctx.db.query("holidays")
      .withIndex("by_year", (q: any) => q.eq("year", args.year))
      .collect();
    
    let count = 0;
    for (const companyId of targetCompanyIds) {
      const alreadyExists = existing.some((e: any) => e.date === args.date && e.name === args.name && e.companyId === companyId);
      if (!alreadyExists) {
        await ctx.db.insert("holidays", { name: args.name, date: args.date, type: args.type, year: args.year, companyId });
        count++;
      }
    }
    return count;
  },
});

export const bulkCreate = mutation({
  args: {
    holidays: v.array(v.object({
      name: v.string(),
      date: v.string(),
      type: v.string(),
      year: v.number(),
    })),
    companyIds: v.array(v.id("companies")),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    await requireAdminOrHR(ctx);
    
    // If no companies selected, get ALL companies
    let targetCompanyIds = args.companyIds;
    if (targetCompanyIds.length === 0) {
      const allCompanies = await ctx.db.query("companies").collect();
      targetCompanyIds = allCompanies.map((c: any) => c._id);
    }
    
    let count = 0;
    const existing = await ctx.db.query("holidays")
      .withIndex("by_year", (q: any) => q.eq("year", args.holidays[0]?.year ?? new Date().getFullYear()))
      .collect();
      
    for (const holiday of args.holidays) {
      for (const companyId of targetCompanyIds) {
        const alreadyExists = existing.some((e: any) => e.date === holiday.date && e.name === holiday.name && e.companyId === companyId);
        if (!alreadyExists) {
          await ctx.db.insert("holidays", { ...holiday, companyId });
          count++;
        }
      }
    }
    return count;
  },
});

export const remove = mutation({
  args: { id: v.id("holidays") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminOrHR(ctx);
    await ctx.db.delete(args.id);
    return null;
  },
});

export const fetchGovernmentHolidays = action({
  args: { year: v.number(), country: v.optional(v.string()) },
  returns: v.array(v.object({ name: v.string(), date: v.string(), type: v.string() })),
  handler: async (ctx, args) => {
    try {
      const resp = await fetch("https://api.a0.dev/ai/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: `List all Indian government/national holidays for year ${args.year}. Include Republic Day, Independence Day, Gandhi Jayanti, Diwali, Holi, Eid, Christmas, Good Friday, Dussehra, Mahashivratri, Ganesh Chaturthi, Raksha Bandhan, Janmashtami, Pongal, Onam, Baisakhi, Navratri, Karva Chauth, Lohri, Makar Sankranti, and any other major public holidays. Provide exact dates.` }],
          schema: {
            type: "object",
            properties: {
              holidays: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    date: { type: "string", description: "YYYY-MM-DD format" },
                    type: { type: "string", enum: ["public", "restricted", "regional"] }
                  },
                  required: ["name", "date", "type"]
                }
              }
            },
            required: ["holidays"]
          }
        }),
      });
      const data = await resp.json();
      if (data.schema_data?.holidays) {
        return data.schema_data.holidays;
      }
      return [];
    } catch (e) {
      return [];
    }
  },
});