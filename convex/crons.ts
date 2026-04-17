import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Every night at midnight IST = 18:30 UTC
// DISABLED: Supabase sync is no longer needed - all data is in Convex
// {
//   cron: "0 2 * * *",
//   name: "nightly-supabase-sync",
//   fn: internal.sync.runFullSync,
// }

// Every 6 hours for more frequent updates
crons.interval(
  "six-hourly-sync",
  { hours: 6 },
  internal.sync.runFullSync,
);

// Retry failed syncs every 1 hour
crons.interval(
  "retry-failed-syncs",
  { hours: 1 },
  internal.supabaseSync.retryFailedSyncs,
);

// Auto-complete checkout at midnight for employees who didn't checkout
crons.daily(
  "auto-complete-checkout-midnight",
  { hourUTC: 18, minuteUTC: 29 }, // 1 minute before sync at 18:30
  internal.attendance.autoCompleteCheckoutAtMidnight,
);

export default crons;