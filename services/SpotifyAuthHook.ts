import { PrismaClient } from "@prisma/client";

export const sqlClient: PrismaClient = new PrismaClient({
  // log: ["query", "info", "warn", "error"],
});

export async function storeToken(token: string) {
  await sqlClient.refreshToken.deleteMany();
  await sqlClient.refreshToken.create({
    data: {
      token: token,
    },
  });
}

export async function queryRefreshToken(): Promise<string | null> {
  const token = await sqlClient.refreshToken.findFirst();
  return token?.token ?? null;
}
