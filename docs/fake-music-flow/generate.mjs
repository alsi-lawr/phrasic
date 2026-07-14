#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const projectRoot = path.resolve(import.meta.dirname, "../..");
const output = path.join(projectRoot, "docs/fake-music-flow.webp");
const workspace = fs.mkdtempSync(
  path.join(os.tmpdir(), "obs-nowplaying-fake-music-flow-"),
);
const framesDirectory = path.join(workspace, "frames");
const previewPort = process.env.PREVIEW_PORT ?? "18082";
const debugPort = process.env.CHROME_DEBUG_PORT ?? "9223";
const previewOrigin = `http://127.0.0.1:${previewPort}`;
const chromeExecutable = process.env.CHROME_BIN ?? "google-chrome";
const childProcesses = [];

fs.mkdirSync(framesDirectory, { recursive: true });

try {
  await run("npm", ["run", "build"]);
  installArtworkFixtures();

  const preview = start(path.join(projectRoot, "node_modules/.bin/vite"), [
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    previewPort,
  ]);
  childProcesses.push(preview);
  await waitForUrl(`${previewOrigin}/fake/`);

  const chrome = start(chromeExecutable, [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--hide-scrollbars",
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${path.join(workspace, "chrome-profile")}`,
    "--window-size=1280,360",
    "about:blank",
  ]);
  childProcesses.push(chrome);
  await waitForUrl(`http://127.0.0.1:${debugPort}/json/list`);

  await recordFlow();
  await encodeTransparentGif();
  await encodeWebp();
  fs.renameSync(path.join(workspace, "fake-music-flow.webp"), output);
  process.stdout.write(`Generated ${path.relative(projectRoot, output)}\n`);
} finally {
  for (const child of childProcesses.reverse()) {
    child.kill("SIGTERM");
  }
  fs.rmSync(workspace, { force: true, recursive: true });
}

function installArtworkFixtures() {
  for (const fileName of ["appaloosa-bones.png", "that-sea-the-gambler.png"]) {
    fs.copyFileSync(
      path.join(import.meta.dirname, fileName),
      path.join(projectRoot, "dist", fileName),
    );
  }
}

function start(command, arguments_) {
  return spawn(command, arguments_, {
    cwd: projectRoot,
    stdio: "ignore",
  });
}

async function run(command, arguments_) {
  const child = spawn(command, arguments_, {
    cwd: projectRoot,
    stdio: "inherit",
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (exitCode !== 0) {
    throw new Error(`${command} exited with status ${String(exitCode)}.`);
  }
}

async function waitForUrl(url) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The process has not opened its local listener yet.
    }
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

async function recordFlow() {
  const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(
    (response) => response.json(),
  );
  const target = targets.find((candidate) => candidate.type === "page");
  if (target === undefined) {
    throw new Error("Chrome did not expose a page target.");
  }

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let nextId = 1;
  let frameNumber = 0;
  let latestScreencastFrame = null;
  const pending = new Map();
  const browserErrors = [];
  const requests = [];

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (typeof message.id === "number") {
      const completion = pending.get(message.id);
      if (completion !== undefined) {
        pending.delete(message.id);
        if (message.error === undefined) {
          completion.resolve(message.result);
        } else {
          completion.reject(new Error(message.error.message));
        }
      }
      return;
    }

    if (message.method === "Runtime.exceptionThrown") {
      browserErrors.push(message.params.exceptionDetails.text);
    }
    if (
      message.method === "Log.entryAdded" &&
      message.params.entry.level === "error"
    ) {
      browserErrors.push(message.params.entry.text);
    }
    if (message.method === "Network.requestWillBeSent") {
      requests.push(message.params.request.url);
    }
    if (message.method === "Page.screencastFrame") {
      latestScreencastFrame = message.params.data;
      void send("Page.screencastFrameAck", {
        sessionId: message.params.sessionId,
      });
    }
  });

  function send(method, params = {}) {
    const id = nextId;
    nextId += 1;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(id, { reject, resolve });
    });
  }

  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails !== undefined) {
      throw new Error(result.exceptionDetails.text);
    }
    return result.result.value;
  }

  async function waitForText(text) {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const found = await evaluate(
        `document.body.innerText.includes(${JSON.stringify(text)})`,
      );
      if (found === true) {
        return;
      }
      await delay(50);
    }
    throw new Error(`Timed out waiting for: ${text}`);
  }

  async function captureFor(durationMilliseconds) {
    const frameDurationMilliseconds = 1_000 / 24;
    let nextFrameAt = Date.now();
    const deadline = Date.now() + durationMilliseconds;
    while (Date.now() < deadline) {
      if (latestScreencastFrame === null) {
        await delay(5);
        continue;
      }
      frameNumber += 1;
      fs.writeFileSync(
        path.join(
          framesDirectory,
          `frame-${String(frameNumber).padStart(4, "0")}.png`,
        ),
        Buffer.from(latestScreencastFrame, "base64"),
      );
      nextFrameAt += frameDurationMilliseconds;
      await delay(Math.max(0, nextFrameAt - Date.now()));
    }
  }

  async function post(command) {
    const envelope = {
      source: "obs-nowplaying-fake",
      version: 1,
      command,
    };
    await evaluate(
      `window.postMessage(${JSON.stringify(envelope)}, window.location.origin)`,
    );
  }

  function track({ artwork, collectionId, collectionTitle, id, title }) {
    return {
      kind: "set-track",
      playback: "playing",
      itemId: id,
      title,
      itemUrl: `https://example.test/tracks/${id}`,
      artworkUrl: `${previewOrigin}/${artwork}`,
      creators: [
        {
          creatorId: "gregory-alan-isakov",
          name: "Gregory Alan Isakov",
          url: "https://example.test/artists/gregory-alan-isakov",
        },
      ],
      collectionId,
      collectionTitle,
      collectionUrl: `https://example.test/albums/${collectionId}`,
    };
  }

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Network.enable");
  await send("Emulation.setDefaultBackgroundColorOverride", {
    color: { r: 0, g: 0, b: 0, a: 0 },
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 360,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
  });
  await send("Page.startScreencast", {
    format: "png",
    maxWidth: 1280,
    maxHeight: 360,
    everyNthFrame: 1,
  });
  await send("Page.navigate", {
    url: `${previewOrigin}/fake/?width=1280`,
  });

  await waitForText("Connect Fake Music");
  await captureFor(1_200);
  const clicked = await evaluate(
    `(() => { const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent === 'Connect Fake Music'); button?.click(); return button !== undefined; })()`,
  );
  if (clicked !== true) {
    throw new Error("Connect Fake Music was not clickable.");
  }

  await waitForText("Waiting for Fake Music authorization.");
  await captureFor(1_200);
  await post(
    track({
      artwork: "appaloosa-bones.png",
      collectionId: "appaloosa-bones",
      collectionTitle: "Appaloosa Bones",
      id: "light-year",
      title: "Light Year",
    }),
  );
  await post({ kind: "resolve-authorization", decision: "approved" });
  await captureFor(2_800);

  await post({
    kind: "set-provider-failure",
    failure: { kind: "network-failure" },
  });
  await captureFor(1_800);

  await post(
    track({
      artwork: "that-sea-the-gambler.png",
      collectionId: "that-sea-the-gambler",
      collectionTitle: "That Sea, the Gambler",
      id: "the-moon-was-red-and-dangerous",
      title: "The Moon Was Red and Dangerous",
    }),
  );
  await captureFor(12_000);

  await post(
    track({
      artwork: "that-sea-the-gambler.png",
      collectionId: "that-sea-the-gambler",
      collectionTitle: "That Sea, the Gambler",
      id: "unwritable-girl",
      title: "Unwritable Girl",
    }),
  );
  await captureFor(2_800);

  const finalText = await evaluate("document.body.innerText");
  const forbiddenRequests = requests.filter((url) =>
    /accounts\.spotify\.com|api\.spotify\.com|\/config\.json/.test(url),
  );
  if (
    browserErrors.length > 0 ||
    forbiddenRequests.length > 0 ||
    !finalText.includes("Unwritable Girl")
  ) {
    throw new Error("The Fake Music recording flow failed validation.");
  }

  await send("Page.stopScreencast");
  socket.close();
}

async function encodeTransparentGif() {
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-y",
    "-framerate",
    "24",
    "-i",
    path.join(framesDirectory, "frame-%04d.png"),
    "-filter_complex",
    "[0:v]crop=1280:293:0:0,split=2[frames][palette_source];[palette_source]palettegen=reserve_transparent=1:transparency_color=0x000000:stats_mode=diff[palette];[frames][palette]paletteuse=alpha_threshold=128:dither=sierra2_4a:diff_mode=rectangle[gif]",
    "-map",
    "[gif]",
    "-loop",
    "0",
    path.join(workspace, "fake-music-flow.gif"),
  ]);
}

async function encodeWebp() {
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-y",
    "-ignore_loop",
    "1",
    "-i",
    path.join(workspace, "fake-music-flow.gif"),
    "-an",
    "-c:v",
    "libwebp_anim",
    "-quality",
    "100",
    "-compression_level",
    "3",
    "-lossless",
    "0",
    "-loop",
    "0",
    path.join(workspace, "fake-music-flow.webp"),
  ]);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
