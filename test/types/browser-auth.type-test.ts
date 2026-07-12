import {
  SpotifyClientId,
  type SpotifyPublicConfiguration,
  SpotifyRedirectUri,
} from "../../browser/config.ts";
import {
  AuthorizationAttemptTimestamp,
  type DisplayReturnConfiguration,
  type DisplayWidth,
  PendingAuthorizationAttempt,
  type PendingAuthorizationAttemptOptions,
  PkceState,
  type PkceStateCandidate,
  type PkceVerifier,
  type SpotifyAuthorizationCode,
} from "../../browser/auth/pkce.ts";
import type { RefreshSpotifyConnectionResult } from "../../browser/auth/session.ts";
import {
  SpotifyRefreshTokenConnection,
  type SpotifyAuthStoragePort,
} from "../../browser/auth/storage.ts";
import {
  type SpotifyAccessToken,
  type SpotifyRefreshToken,
} from "../../browser/auth/token.ts";

declare const clientId: SpotifyClientId;
declare const redirectUri: SpotifyRedirectUri;
declare const state: PkceState;
declare const stateCandidate: PkceStateCandidate;
declare const verifier: PkceVerifier;
declare const authorizationCode: SpotifyAuthorizationCode;
declare const createdAt: AuthorizationAttemptTimestamp;
declare const expiresAt: AuthorizationAttemptTimestamp;
declare const width: DisplayWidth;
declare const accessToken: SpotifyAccessToken;
declare const refreshToken: SpotifyRefreshToken;
declare const storage: SpotifyAuthStoragePort;
declare const refreshResult: RefreshSpotifyConnectionResult;

const returnTo: DisplayReturnConfiguration = Object.freeze({
  width,
  setup: Object.freeze({ kind: "setup-requested" }),
});
const configuration: SpotifyPublicConfiguration = Object.freeze({
  spotify: Object.freeze({ clientId, redirectUri }),
});
const pendingOptions: PendingAuthorizationAttemptOptions = Object.freeze({
  state,
  verifier,
  createdAt,
  returnTo,
});
const pending = PendingAuthorizationAttempt.create(pendingOptions);
const refreshConnection = SpotifyRefreshTokenConnection.create(refreshToken);
const rawConfiguration = Object.freeze({
  spotify: Object.freeze({
    clientId: "browser-client-id",
    redirectUri: "https://nowplaying.example/spotify/",
  }),
});

// @ts-expect-error Browser configuration requires values validated by their factories.
const unvalidatedConfiguration: SpotifyPublicConfiguration = rawConfiguration;
// @ts-expect-error Callback state candidates cannot become trusted pending states.
const unverifiedState: PkceState = stateCandidate;
// @ts-expect-error Authorization codes are distinct from PKCE verifiers.
const verifierFromAuthorizationCode: PkceVerifier = authorizationCode;
// @ts-expect-error Display return widths cannot be supplied as unvalidated numbers.
const rawDisplayReturn: DisplayReturnConfiguration = Object.freeze({
  width: 1_280,
  setup: Object.freeze({ kind: "setup-requested" }),
});
// @ts-expect-error Pending authorization attempts require a trusted PKCE state.
const candidatePendingOptions: PendingAuthorizationAttemptOptions =
  Object.freeze({
    state: stateCandidate,
    verifier,
    createdAt,
    returnTo,
  });
const arbitraryExpiry = PendingAuthorizationAttempt.create({
  state,
  verifier,
  createdAt,
  returnTo,
  // @ts-expect-error Pending authorization attempts derive their fixed ten-minute expiry.
  expiresAt,
});
// @ts-expect-error Spotify client IDs can only be constructed by their parser.
const constructedClientId = new SpotifyClientId("browser-client-id");
// @ts-expect-error PKCE states can only be constructed by their parser.
const constructedState = new PkceState("A".repeat(43));
void storage.saveSpotifyRefreshTokenConnection(refreshConnection);
if (refreshResult.kind === "success") {
  // @ts-expect-error Access-token refresh success retains credentials only in trusted memory.
  void refreshResult.refreshToken;
}
// @ts-expect-error Refresh-token storage cannot accept an access token.
void storage.saveSpotifyRefreshTokenConnection(accessToken);

void configuration;
void pending;
void unvalidatedConfiguration;
void unverifiedState;
void verifierFromAuthorizationCode;
void rawDisplayReturn;
void candidatePendingOptions;
void arbitraryExpiry;
void constructedClientId;
void constructedState;
void refreshConnection;
