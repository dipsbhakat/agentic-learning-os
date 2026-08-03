import { createClerkClient } from "@clerk/backend";
import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc, type AuthFn } from "eve/channels/auth";

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
});

function clerkSession(): AuthFn<Request> {
  return async (request) => {
    const requestState = await clerkClient.authenticateRequest(request);
    const auth = requestState.toAuth();

    if (!auth?.userId) return null;

    return {
      authenticator: "clerk",
      principalId: auth.userId,
      principalType: "user",
      attributes: {},
    };
  };
}

export default eveChannel({
  auth: [
    clerkSession(),
    // Lets the eve TUI and Vercel-to-Vercel callers (subagents, remote agents) reach the deployed agent.
    vercelOidc(),
    // Open on localhost for `eve dev` and the REPL; ignored in production.
    localDev(),
  ],
});
