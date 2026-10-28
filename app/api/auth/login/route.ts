import { createLoginHandler } from "@/platform/auth/server";
import { getHomeDb } from "@/apps/home/db";

export const POST = createLoginHandler(getHomeDb);
