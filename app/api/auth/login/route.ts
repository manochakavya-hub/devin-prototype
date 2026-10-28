import { createLoginHandler } from "@/platform/auth/server";
import { getDb } from "@/apps/kyc/db";

export const POST = createLoginHandler(getDb);
