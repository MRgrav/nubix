import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Prevent multiple instances of Prisma Client in development
const prismaClientSingleton = () => {
  return new PrismaClient();
};

const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
