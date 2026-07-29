import { timingSafeEqual } from "node:crypto";

const capabilityBytes = 32;
const capabilityLifetimeMilliseconds = 120_000;
const sessionCookieName = "phrasic_local_session";

export type PairingRedemption =
  | { readonly kind: "accepted"; readonly setCookie: string }
  | { readonly kind: "rejected" };

export type PairingAuthority = {
  readonly authenticate: (cookieHeader: string | null) => boolean;
  readonly capabilityFragment: () => string;
  readonly redeem: (capability: string) => PairingRedemption;
  readonly revoke: () => void;
};

type PairingAuthorityPorts = {
  readonly monotonicNow: () => number;
  readonly randomBytes: () => Uint8Array;
};

type PairingState =
  | {
      readonly kind: "issued";
      readonly capability: SecretValue;
      readonly expiresAt: number;
    }
  | {
      readonly kind: "paired";
      readonly session: SecretValue;
    }
  | { readonly kind: "revoked" };

class SecretValue {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  static random(bytes: Uint8Array): SecretValue {
    if (bytes.byteLength !== capabilityBytes) {
      throw new Error("Local pairing randomness has an invalid length.");
    }
    return new SecretValue(Buffer.from(bytes).toString("base64url"));
  }

  matches(candidate: string): boolean {
    const left = Buffer.from(this.#value);
    const right = Buffer.from(candidate);
    return left.byteLength === right.byteLength && timingSafeEqual(left, right);
  }

  toString(): string {
    return this.#value;
  }
}

export function createPairingAuthority(
  ports: PairingAuthorityPorts = productionPairingPorts(),
): PairingAuthority {
  const capability = SecretValue.random(ports.randomBytes());
  let state: PairingState = {
    kind: "issued",
    capability,
    expiresAt: ports.monotonicNow() + capabilityLifetimeMilliseconds,
  };

  return {
    authenticate(cookieHeader: string | null): boolean {
      if (state.kind !== "paired") {
        return false;
      }
      const candidate = sessionCookie(cookieHeader);
      return candidate !== undefined && state.session.matches(candidate);
    },

    capabilityFragment(): string {
      return capability.toString();
    },

    redeem(candidate: string): PairingRedemption {
      if (state.kind !== "issued") {
        return { kind: "rejected" };
      }
      if (ports.monotonicNow() >= state.expiresAt) {
        state = { kind: "revoked" };
        return { kind: "rejected" };
      }
      if (!state.capability.matches(candidate)) {
        return { kind: "rejected" };
      }

      const session = SecretValue.random(ports.randomBytes());
      state = { kind: "paired", session };
      return {
        kind: "accepted",
        setCookie: `${sessionCookieName}=${session.toString()}; HttpOnly; SameSite=Strict; Path=/`,
      };
    },

    revoke(): void {
      state = { kind: "revoked" };
    },
  };
}

function productionPairingPorts(): PairingAuthorityPorts {
  return {
    monotonicNow(): number {
      return performance.now();
    },
    randomBytes(): Uint8Array {
      return crypto.getRandomValues(new Uint8Array(capabilityBytes));
    },
  };
}

function sessionCookie(cookieHeader: string | null): string | undefined {
  if (cookieHeader === null) {
    return undefined;
  }
  const matches = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${sessionCookieName}=`))
    .map((part) => part.slice(sessionCookieName.length + 1));
  return matches.length === 1 ? matches[0] : undefined;
}
