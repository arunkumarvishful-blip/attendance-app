import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";

export const getMyNotifications = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("notifications"),
    title: v.string(),
    message: v.string(),
    type: v.string(),
    read: v.boolean(),
    createdAt: v.number(),
    leaveRequestId: v.optional(v.id("leaveRequests")),
  })),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const notifs = await ctx.db.query("notifications")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();
    return notifs
      .sort((a: any, b: any) => b.createdAt - a.createdAt)
      .slice(0, 50)
      .map((n: any) => ({
        _id: n._id,
        title: n.title,
        message: n.message,
        type: n.type,
        read: n.read,
        createdAt: n.createdAt,
        leaveRequestId: n.leaveRequestId,
      }));
  },
});

export const markAllRead = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const notifs = await ctx.db.query("notifications")
      .withIndex("by_user_and_read", (q: any) => q.eq("userId", user._id).eq("read", false))
      .collect();
    for (const n of notifs) {
      await ctx.db.patch(n._id, { read: true });
    }
    return null;
  },
});

export const getUnreadCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const notifs = await ctx.db.query("notifications")
      .withIndex("by_user_and_read", (q: any) => q.eq("userId", user._id).eq("read", false))
      .collect();
    return notifs.length;
  },
});
