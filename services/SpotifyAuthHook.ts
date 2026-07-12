import { PrismaClient } from "@prisma/client";
import { RefreshToken } from "../domain/playback";

const sqlClient = new PrismaClient({
  // log: ["query", "info", "warn", "error"],
});

export type StoredRefreshTokenLookup =
  | {
      readonly kind: "found";
      readonly refreshToken: RefreshToken;
    }
  | {
      readonly kind: "invalid";
    }
  | {
      readonly kind: "not-found";
    };

export async function storeRefreshToken(
  refreshToken: RefreshToken,
): Promise<void> {
  await sqlClient.refreshToken.deleteMany();
  await sqlClient.refreshToken.create({
    data: {
      token: refreshToken.value,
    },
  });
}

export async function findStoredRefreshToken(): Promise<StoredRefreshTokenLookup> {
  const storedToken = await sqlClient.refreshToken.findFirst();
  if (storedToken === null) {
    return Object.freeze({ kind: "not-found" });
  }

  const refreshToken = RefreshToken.create(storedToken.token);
  if (refreshToken.kind === "failure") {
    return Object.freeze({ kind: "invalid" });
  }

  return Object.freeze({ kind: "found", refreshToken: refreshToken.value });
}
