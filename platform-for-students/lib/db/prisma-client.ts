import 'server-only';
import { PrismaClient } from '@prisma/client';

/**
 * В dev Next перезагружает модули на каждое изменение. Без кеша в globalThis
 * это порождало бы новый пул соединений на каждый hot reload, и Postgres
 * упирался бы в max_connections через десяток правок.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
