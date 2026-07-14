import type { BrowserPlaybackIntegration } from "../integrations/browser-integration.ts";

export const fakeBrowserIntegration: BrowserPlaybackIntegration = Object.freeze(
  {
    applicationPath: "/fake/",

    prepare(): Promise<{
      readonly kind: "success";
      readonly callbackUrl: { readonly kind: "unavailable" };
      readonly configuration: { readonly fake: object };
    }> {
      return Promise.resolve(
        Object.freeze({
          kind: "success",
          callbackUrl: Object.freeze({ kind: "unavailable" }),
          configuration: Object.freeze({ fake: Object.freeze({}) }),
        }),
      );
    },

    validateAuthorizationUrl() {
      return Object.freeze({ kind: "invalid" });
    },

    validateRestoredUrl() {
      return Object.freeze({ kind: "invalid" });
    },
  },
);
