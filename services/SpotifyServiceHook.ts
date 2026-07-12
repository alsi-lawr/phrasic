import { APIResult } from "@/types/API";
import axios from "axios";

export async function startSpotifyService(
  authCode: string,
): Promise<APIResult<string>> {
  const url = `/api/spotify`;
  try {
    const response = await axios.post(url, JSON.stringify(authCode), {
      headers: {
        "Content-Type": "application/json",
      },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const providerStatus = error.response?.status;
      if (typeof providerStatus === "number") {
        console.error({
          operation: "spotify-service-start",
          providerStatus,
        });
      } else {
        console.error({ operation: "spotify-service-start" });
      }
    } else {
      console.error({ operation: "spotify-service-start" });
    }
    return { result: null, status: 500 };
  }
}

export async function stopSpotifyService(): Promise<APIResult<string>> {
  const url = "/api/spotify/stop";
  const response = await fetch(url, {
    method: "POST",
  });

  if (!response.ok) {
    return { result: null, status: response.status };
  }
  return response.json();
}
