import { PrismaClient } from "@prisma/client";

// One client per process, including across dev-mode reloads.
const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };
const prisma = (globalForPrisma.prisma ??= new PrismaClient());

export default prisma;
