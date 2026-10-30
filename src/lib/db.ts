import { PrismaClient } from "@prisma/client";

// Все даты интерпретируются в часовом поясе клиники
if (!process.env.TZ) process.env.TZ = "Europe/Moscow";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
