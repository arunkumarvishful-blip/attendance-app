"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
  const magB = Math.sqrt(b.reduce((s, x) => s + x * x, 0));
  return dot / (magA * magB);
}

export const recognizeFaceAndMarkAttendance = action({
  args: {
    embedding: v.array(v.float64()),
    localDate: v.string(),
    localTime: v.string(),
    proofImageId: v.optional(v.id("_storage")),
    allowedDepartments: v.optional(v.array(v.string())),
    accountEmail: v.optional(v.string()),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const MATCH_THRESHOLD = 0.72;

    const stored = await ctx.runQuery(
      internal.faceRecognition.getAllEmbeddings, {}
    );

    let bestMatch = { employeeId: null as any, score: 0 };
    for (const record of stored) {
      const score = cosineSimilarity(args.embedding, record.embedding);
      if (score > bestMatch.score) {
        bestMatch = { employeeId: record.employeeId, score };
      }
    }

    if (bestMatch.score < MATCH_THRESHOLD || !bestMatch.employeeId) {
      await ctx.runMutation(internal.faceRecognition.logSecurityEvent, {
        eventType: "no_match",
        reason: `Best score ${bestMatch.score.toFixed(3)} below threshold`,
        date: args.localDate,
        time: args.localTime,
      });
      return {
        success: false,
        action: "no_match",
        message: "Face not recognised. Please try again.",
      };
    }

    const result = await ctx.runMutation(
      internal.faceRecognition.markAttendanceInternal,
      {
        employeeId: bestMatch.employeeId,
        localDate: args.localDate,
        localTime: args.localTime,
        proofImageId: args.proofImageId,
        allowedDepartments: args.allowedDepartments,
        accountEmail: args.accountEmail,
        deviceId: args.deviceId,
      }
    );

    return { success: true, confidence: bestMatch.score, ...result };
  },
});

export const enrollFaceEmbedding = action({
  args: {
    employeeId: v.id("employees"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.faceRecognition.saveEmbedding, {
      employeeId: args.employeeId,
      embedding: args.embedding,
    });
    return { success: true };
  },
});