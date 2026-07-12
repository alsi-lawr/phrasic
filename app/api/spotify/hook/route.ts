import {
  emptyPlaybackWireState,
  failurePlaybackWireState,
} from "@/domain/playback-stream";
import type {
  PlaybackStreamOutcome,
  PlaybackWireState,
} from "@/domain/playback-stream";
import { providerFailure } from "@/domain/playback";
import { spotifyTrackService } from "@/services/SpotifyClient/SpotifyTrackServiceController";

type PlaybackStreamEmission =
  | {
      readonly kind: "emit";
      readonly state: PlaybackWireState;
    }
  | {
      readonly kind: "suppress";
    };

export async function GET(req: Request): Promise<Response> {
  if (!spotifyTrackService.getIsRunning()) {
    return new Response("Not running", { status: 500 });
  }

  let cancelPolling: (() => void) | undefined;
  const responseStream = new ReadableStream<Uint8Array>({
    start(controller): void {
      const encoder = new TextEncoder();
      const pollAbortController = new AbortController();
      let closed = false;

      const stopPolling = (): void => {
        if (closed) {
          return;
        }

        closed = true;
        req.signal.removeEventListener("abort", close);
        pollAbortController.abort();
      };

      const close = (): void => {
        stopPolling();
        controller.close();
      };

      const send = (state: PlaybackWireState): void => {
        if (closed) {
          return;
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(state)}\n\n`),
        );
      };

      const pollForUpdates = async (): Promise<void> => {
        while (!pollAbortController.signal.aborted) {
          try {
            const outcome = await spotifyTrackService.pollPlayback();
            if (pollAbortController.signal.aborted) {
              break;
            }

            const emission = playbackStreamEmission(outcome);
            if (emission.kind === "emit") {
              send(emission.state);
            }
          } catch {
            if (!pollAbortController.signal.aborted) {
              send(failurePlaybackWireState(providerFailure("network")));
            }
          }

          if (pollAbortController.signal.aborted) {
            break;
          }

          await waitForNextPoll(
            spotifyTrackService.getTimeoutMs(),
            pollAbortController.signal,
          );
        }
      };

      cancelPolling = stopPolling;
      req.signal.addEventListener("abort", close, { once: true });
      void pollForUpdates();
    },
    cancel(): void {
      cancelPolling?.();
    },
  });

  return new Response(responseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function playbackStreamEmission(
  outcome: PlaybackStreamOutcome,
): PlaybackStreamEmission {
  switch (outcome.kind) {
    case "changed":
    case "unsupported":
    case "failure":
      return Object.freeze({ kind: "emit", state: outcome.state });
    case "empty":
      return Object.freeze({ kind: "emit", state: emptyPlaybackWireState() });
    case "unchanged":
      return Object.freeze({ kind: "suppress" });
  }

  return assertNever(outcome);
}

function waitForNextPoll(
  delayMilliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve): void => {
    const onAbort = (): void => {
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout((): void => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMilliseconds);

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function assertNever(value: never): never {
  throw new Error(`Unexpected playback stream outcome: ${String(value)}`);
}
