import {
  parseProviderId,
  type ProviderId,
} from "../../../../../packages/domain/src/playback-values.ts";

export const fakeProviderId = requiredProviderId("fake");
export const spotifyProviderId = requiredProviderId("spotify");

function requiredProviderId(value: string): ProviderId {
  const providerId = parseProviderId(value);
  if (providerId.kind === "success") {
    return providerId.value;
  }

  throw new Error("A configured playback provider identifier is invalid.");
}
