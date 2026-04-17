// This file previously contained attendance mutations (duplicated from attendance.ts).
// Those functions now live exclusively in attendance.ts.
// This file is now the Convex Auth configuration, replacing auth.config.ts.

import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});