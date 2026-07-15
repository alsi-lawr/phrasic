import type { BrowserPlaybackIntegration } from "../integrations/browser-integration.ts";

export const fakeBrowserIntegration: BrowserPlaybackIntegration = {
  applicationPath: "/fake/",

  prepare(): Promise<{
    readonly kind: "success";
    readonly callbackUrl: { readonly kind: "unavailable" };
    readonly configuration: { readonly fake: object };
  }> {
    return Promise.resolve({
      kind: "success",
      callbackUrl: { kind: "unavailable" },
      configuration: { fake: {} },
    });
  },

  validateAuthorizationUrl() {
    return { kind: "invalid" };
  },

  validateRestoredUrl() {
    return { kind: "invalid" };
  },
};
