export type PairingResult =
  | { readonly kind: "paired-or-existing-session" }
  | { readonly kind: "unavailable" };

type PairingPorts = {
  readonly currentUrl: () => URL;
  readonly fetch: (
    input: URL,
    init: RequestInit,
  ) => Promise<Pick<Response, "ok">>;
  readonly replaceHistory: (path: string) => void;
};

const pairingCapabilityPattern = /^[A-Za-z0-9_-]{43}$/;

export async function redeemPairingCapability(
  ports: PairingPorts,
  signal: AbortSignal,
): Promise<PairingResult> {
  const current = ports.currentUrl();
  const fragment = current.hash.slice(1);
  ports.replaceHistory(`${current.pathname}${current.search}`);

  if (fragment.length === 0) {
    return { kind: "paired-or-existing-session" };
  }
  if (!pairingCapabilityPattern.test(fragment)) {
    return { kind: "unavailable" };
  }

  try {
    const response = await ports.fetch(new URL("/local/pair", current.origin), {
      body: fragment,
      cache: "no-store",
      credentials: "same-origin",
      headers: { "content-type": "text/plain;charset=UTF-8" },
      method: "POST",
      signal,
    });
    return response.ok
      ? { kind: "paired-or-existing-session" }
      : { kind: "unavailable" };
  } catch (caught: unknown) {
    if (caught instanceof Error && caught.name === "AbortError") {
      return { kind: "unavailable" };
    }
    return { kind: "unavailable" };
  }
}
