import { NextResponse } from "next/server";
import { parseSpotifyAuthorizationRequest } from "./authorization-request";
import { spotifyTrackService } from "@/services/SpotifyClient/SpotifyTrackServiceController";

type SpotifyServiceResponse<Value> =
  | {
      readonly kind: "success";
      readonly result: Value;
      readonly status: 200;
    }
  | {
      readonly kind: "bad-request";
      readonly result: "Missing parameter AuthCode";
      readonly status: 400;
    }
  | {
      readonly kind: "failure";
      readonly result: "Unable to start Spotify service";
      readonly status: 500;
    };

const missingAuthorizationCode: SpotifyServiceResponse<never> = Object.freeze({
  kind: "bad-request",
  result: "Missing parameter AuthCode",
  status: 400,
});

const serviceStartFailure: SpotifyServiceResponse<never> = Object.freeze({
  kind: "failure",
  result: "Unable to start Spotify service",
  status: 500,
});

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(missingAuthorizationCode);
  }

  const authorizationCode = parseSpotifyAuthorizationRequest(body);
  if (authorizationCode.kind === "failure") {
    return NextResponse.json(missingAuthorizationCode);
  }

  try {
    spotifyTrackService.startServiceFromAuthorizationCode(
      authorizationCode.value,
    );
    return NextResponse.json(successfulResponse("OK"));
  } catch {
    return NextResponse.json(serviceStartFailure);
  }
}

export async function GET(): Promise<Response> {
  return NextResponse.json(
    successfulResponse(spotifyTrackService.getIsRunning()),
  );
}

function successfulResponse<Value>(
  result: Value,
): SpotifyServiceResponse<Value> {
  return Object.freeze({
    kind: "success",
    result,
    status: 200,
  });
}
