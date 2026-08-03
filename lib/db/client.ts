import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Db = NeonHttpDatabase<typeof schema>;

let cached: Db | undefined;

function getDb(): Db {
  if (!cached) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set.");
    }
    cached = drizzle(neon(connectionString), { schema });
  }
  return cached;
}

// Lazy so importing this module (e.g. during eve's static discovery, before
// env vars are loaded) never throws — only an actual query does.
export const db: Db = new Proxy({} as Db, {
  get(_target, property, receiver) {
    return Reflect.get(getDb(), property, receiver);
  },
});
