import { NextResponse } from "next/server";
import { spotifyTrackService } from "@/services/SpotifyClient/SpotifyTrackServiceController";

const stopResponse = Object.freeze({
  kind: "success",
  result: "OK",
  status: 200,
});

export async function POST(): Promise<Response> {
  spotifyTrackService.stopService();
  return NextResponse.json(stopResponse);
}
