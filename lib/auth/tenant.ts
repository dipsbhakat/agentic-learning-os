import type { SessionContext } from "eve/context";

export interface TenantCaller {
  clerkUserId: string;
}

/** Reads the verified caller off route auth. Never trust a userId from the model or a tool argument. */
export function requireTenantCaller(ctx: SessionContext): TenantCaller {
  const caller = ctx.session.auth.current;

  if (caller?.principalType !== "user" || typeof caller.principalId !== "string") {
    throw new Error("An authenticated user is required.");
  }

  return { clerkUserId: caller.principalId };
}
