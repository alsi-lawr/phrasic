import type { BrowserConfigurationResponse } from "../configuration-response.ts";

export type BrowserIntegrationPreparationResult =
  | {
      readonly kind: "success";
      readonly callbackUrl:
        | { readonly kind: "available"; readonly value: string }
        | { readonly kind: "unavailable" };
      readonly configuration: unknown;
    }
  | {
      readonly kind: "failure";
    };

export type BrowserIntegrationUrlResult =
  | { readonly kind: "valid"; readonly value: URL }
  | { readonly kind: "invalid" };

export type BrowserPlaybackIntegration = {
  readonly applicationPath: string;
  readonly prepare: (options: {
    readonly applicationUrl: URL;
    readonly currentUrl: URL;
    readonly fetchConfiguration: (options: {
      readonly signal: AbortSignal;
      readonly url: URL;
    }) => Promise<BrowserConfigurationResponse>;
    readonly signal: AbortSignal;
  }) => Promise<BrowserIntegrationPreparationResult>;
  readonly validateAuthorizationUrl: (
    input: string,
    currentUrl: URL,
  ) => BrowserIntegrationUrlResult;
  readonly validateRestoredUrl: (
    input: string,
    currentUrl: URL,
  ) => BrowserIntegrationUrlResult;
};
