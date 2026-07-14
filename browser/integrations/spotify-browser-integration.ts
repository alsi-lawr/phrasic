import {
  parseSpotifyPublicConfiguration,
  type SpotifyPublicConfiguration,
} from "../config.ts";
import type {
  BrowserIntegrationPreparationResult,
  BrowserIntegrationUrlResult,
  BrowserPlaybackIntegration,
} from "./browser-integration.ts";

const spotifyAuthorizationOrigin = "https://accounts.spotify.com";
const spotifyAuthorizationParameterNames: ReadonlyArray<string> = Object.freeze(
  [
    "client_id",
    "response_type",
    "redirect_uri",
    "code_challenge_method",
    "code_challenge",
    "state",
    "scope",
  ],
);
const callbackQueryParameterNames: ReadonlyArray<string> = Object.freeze([
  "code",
  "error",
  "error_description",
  "error_uri",
  "state",
]);
const displayQueryParameterNames: ReadonlyArray<string> = Object.freeze([
  "width",
  "setup",
]);

type WorkerPublicConfiguration = {
  readonly spotify: {
    readonly clientId: string;
    readonly redirectUri: string;
  };
};

export const spotifyBrowserIntegration: BrowserPlaybackIntegration =
  Object.freeze({
    applicationPath: "/spotify/",

    async prepare(options): Promise<BrowserIntegrationPreparationResult> {
      const callbackUrl = captureCallbackUrl(options.currentUrl);
      const configurationUrl = new URL(
        "/config.json",
        options.applicationUrl.origin,
      );

      try {
        const response = await options.fetchConfiguration({
          signal: options.signal,
          url: configurationUrl,
        });
        if (!response.ok) {
          return preparationFailure();
        }

        const source = await response.readJson();
        const configuration = parseSpotifyPublicConfiguration(source, {
          applicationUrl: options.applicationUrl,
        });
        if (configuration.kind === "failure") {
          return preparationFailure();
        }

        return Object.freeze({
          kind: "success",
          callbackUrl,
          configuration: serializeWorkerPublicConfiguration(
            configuration.value,
          ),
        });
      } catch {
        return preparationFailure();
      }
    },

    validateAuthorizationUrl(input, currentUrl): BrowserIntegrationUrlResult {
      return parseSpotifyAuthorizationUrl(input, currentUrl);
    },

    validateRestoredUrl(input, currentUrl): BrowserIntegrationUrlResult {
      return parseRestoredCallbackUrl(input, currentUrl);
    },
  });

function captureCallbackUrl(
  currentUrl: URL,
): Extract<
  BrowserIntegrationPreparationResult,
  { readonly kind: "success" }
>["callbackUrl"] {
  const isCallback = callbackQueryParameterNames.some((parameter): boolean =>
    currentUrl.searchParams.has(parameter),
  );
  if (!isCallback) {
    return Object.freeze({ kind: "unavailable" });
  }

  const callbackUrl = new URL(currentUrl);
  for (const parameter of displayQueryParameterNames) {
    callbackUrl.searchParams.delete(parameter);
  }

  return Object.freeze({ kind: "available", value: callbackUrl.toString() });
}

function serializeWorkerPublicConfiguration(
  configuration: SpotifyPublicConfiguration,
): WorkerPublicConfiguration {
  return Object.freeze({
    spotify: Object.freeze({
      clientId: configuration.spotify.clientId.toAuthorizationParameter(),
      redirectUri: configuration.spotify.redirectUri.toAuthorizationParameter(),
    }),
  });
}

function parseSpotifyAuthorizationUrl(
  input: string,
  applicationUrl: URL,
): BrowserIntegrationUrlResult {
  try {
    const url = new URL(input);
    if (
      url.protocol !== "https:" ||
      url.origin !== spotifyAuthorizationOrigin ||
      url.pathname !== "/authorize" ||
      url.username !== "" ||
      url.password !== "" ||
      url.hash !== "" ||
      !hasExpectedSpotifyAuthorizationParameters(url, applicationUrl)
    ) {
      return invalidUrl();
    }

    return Object.freeze({ kind: "valid", value: url });
  } catch {
    return invalidUrl();
  }
}

function hasExpectedSpotifyAuthorizationParameters(
  authorizationUrl: URL,
  applicationUrl: URL,
): boolean {
  const parameters = authorizationUrl.searchParams;
  const hasOneValueForEachParameter = spotifyAuthorizationParameterNames.every(
    (parameter): boolean => parameters.getAll(parameter).length === 1,
  );
  if (
    !hasOneValueForEachParameter ||
    Array.from(parameters.keys()).length !==
      spotifyAuthorizationParameterNames.length
  ) {
    return false;
  }

  if (
    parameters.getAll("response_type")[0] !== "code" ||
    parameters.getAll("code_challenge_method")[0] !== "S256" ||
    parameters.getAll("scope")[0] !== "user-read-currently-playing"
  ) {
    return false;
  }

  const publicParameters: ReadonlyArray<string | undefined> = [
    parameters.getAll("client_id")[0],
    parameters.getAll("code_challenge")[0],
    parameters.getAll("state")[0],
  ];
  if (
    publicParameters.some(
      (parameter): boolean =>
        parameter === undefined || parameter.trim().length === 0,
    )
  ) {
    return false;
  }

  const redirectUri = parameters.getAll("redirect_uri")[0];
  return (
    redirectUri !== undefined &&
    isSameOriginSpotifyCallback(redirectUri, applicationUrl)
  );
}

function isSameOriginSpotifyCallback(
  input: string,
  applicationUrl: URL,
): boolean {
  try {
    const redirectUri = new URL(input);
    return (
      redirectUri.protocol === "https:" &&
      redirectUri.origin === applicationUrl.origin &&
      redirectUri.pathname === "/spotify/" &&
      redirectUri.username === "" &&
      redirectUri.password === "" &&
      redirectUri.search === "" &&
      redirectUri.hash === ""
    );
  } catch {
    return false;
  }
}

function parseRestoredCallbackUrl(
  input: string,
  currentUrl: URL,
): BrowserIntegrationUrlResult {
  try {
    const parsed = new URL(input);
    if (
      parsed.origin !== currentUrl.origin ||
      parsed.pathname !== "/spotify/" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.hash !== ""
    ) {
      return invalidUrl();
    }

    const widthValues = parsed.searchParams.getAll("width");
    const setupValues = parsed.searchParams.getAll("setup");
    if (
      widthValues.length !== 1 ||
      setupValues.length > 1 ||
      Array.from(parsed.searchParams.keys()).length !==
        widthValues.length + setupValues.length
    ) {
      return invalidUrl();
    }

    const width = widthValues[0];
    if (width === undefined || !/^\d+$/.test(width)) {
      return invalidUrl();
    }

    const parsedWidth = Number(width);
    if (
      !Number.isSafeInteger(parsedWidth) ||
      parsedWidth < 320 ||
      parsedWidth > 7_680
    ) {
      return invalidUrl();
    }

    const setup = setupValues[0];
    if (setup !== undefined && setup !== "1") {
      return invalidUrl();
    }

    const restored = new URL("/spotify/", currentUrl.origin);
    restored.searchParams.set("width", `${parsedWidth}`);
    if (setup === "1") {
      restored.searchParams.set("setup", "1");
    }

    return Object.freeze({ kind: "valid", value: restored });
  } catch {
    return invalidUrl();
  }
}

function preparationFailure(): BrowserIntegrationPreparationResult {
  return Object.freeze({ kind: "failure" });
}

function invalidUrl(): BrowserIntegrationUrlResult {
  return Object.freeze({ kind: "invalid" });
}
