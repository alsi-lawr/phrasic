import type { BrowserConfigurationResponse } from "./application.ts";

type ConfigurationFetchResponse = {
  readonly ok: boolean;
  readonly json: () => Promise<unknown>;
};

type FetchBrowserConfigurationOptions = {
  readonly fetchImplementation: (
    url: URL,
    init: RequestInit,
  ) => Promise<ConfigurationFetchResponse>;
  readonly signal: AbortSignal;
  readonly url: URL;
};

export async function fetchBrowserConfiguration(
  options: FetchBrowserConfigurationOptions,
): Promise<BrowserConfigurationResponse> {
  const response = await options.fetchImplementation(options.url, {
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
    signal: options.signal,
  });
  const configurationResponse: BrowserConfigurationResponse = {
    ok: response.ok,
    async readJson(): Promise<unknown> {
      const source: unknown = await response.json();
      return source;
    },
  };

  return Object.freeze(configurationResponse);
}
