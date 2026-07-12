import { AuthorizationCode, type Result } from "../../../domain/playback.ts";

export type SpotifyAuthorizationRequestParseFailure = {
  readonly kind: "invalid-spotify-authorization-request";
  readonly reason: "expected-non-empty-string";
};

export function parseSpotifyAuthorizationRequest(
  input: unknown,
): Result<AuthorizationCode, SpotifyAuthorizationRequestParseFailure> {
  const authorizationCode = AuthorizationCode.create(input);
  if (authorizationCode.kind === "failure") {
    return Object.freeze({
      kind: "failure",
      error: Object.freeze({
        kind: "invalid-spotify-authorization-request",
        reason: "expected-non-empty-string",
      }),
    });
  }

  return authorizationCode;
}
