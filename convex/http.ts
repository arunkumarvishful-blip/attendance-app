import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

// Required: expose auth HTTP endpoints (sign in, sign out, session, etc.)
auth.addHttpRoutes(http);

export default http;