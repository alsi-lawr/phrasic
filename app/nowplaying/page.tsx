import type { ReactElement } from "react";
import { AuthorizationCode } from "@/domain/playback";
import NowPlaying from "@/components/NowPlaying";
import { findStoredRefreshToken } from "@/services/SpotifyAuthHook";
import { spotifyTrackService } from "@/services/SpotifyClient/SpotifyTrackServiceController";
import { redirect } from "next/navigation";

type NowPlayingPageProps = {
  readonly searchParams: Readonly<{
    readonly code?: unknown;
  }>;
};

export default async function Page({
  searchParams,
}: NowPlayingPageProps): Promise<ReactElement> {
  const authorizationCode = AuthorizationCode.create(searchParams.code);
  if (authorizationCode.kind === "success") {
    if (!spotifyTrackService.getIsRunning()) {
      spotifyTrackService.startServiceFromAuthorizationCode(
        authorizationCode.value,
      );
    }

    await waitForSpotifyAuthorization();
    redirect("/nowplaying");
  }

  const storedRefreshToken = await findStoredRefreshToken();
  if (storedRefreshToken.kind === "found") {
    spotifyTrackService.startServiceFromRefreshToken(
      storedRefreshToken.refreshToken,
    );
    return <NowPlaying />;
  }

  redirect(spotifyTrackService.getAuthUrl());
}

function waitForSpotifyAuthorization(): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    setTimeout(resolve, 3_000);
  });
}
