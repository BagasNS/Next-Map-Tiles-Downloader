// This File for Caching Prisma Client Instance
// All Prisma Client must import from this file
// reference: https://www.prisma.io/docs/guides/performance-and-optimization/connection-management
import { PrismaClient } from '@prisma/client'


const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma || new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
