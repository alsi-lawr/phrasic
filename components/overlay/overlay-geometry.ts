export const overlayViewBox = "0 0 4725 1080";
export const overlayViewBoxWidth = 4_725;
export const overlayViewBoxHeight = 1_080;
export const defaultOverlayDisplayWidth = 1_920;
export const minimumOverlayDisplayWidth = 320;
export const maximumOverlayDisplayWidth = 7_680;

export type OverlaySetupMode =
  | {
      readonly kind: "overlay";
    }
  | {
      readonly kind: "setup";
    };

type InvalidOverlayDisplayQueryDiagnostic = {
  readonly kind: "invalid-display-query";
  readonly reason:
    | "fractional-display-width"
    | "malformed-display-width"
    | "out-of-range-display-width"
    | "repeated-display-query-parameter"
    | "unsafe-display-width"
    | "unsupported-display-query";
};

export type OverlayDisplayDiagnostic =
  | {
      readonly kind: "none";
    }
  | InvalidOverlayDisplayQueryDiagnostic;

export type OverlayGeometry = {
  readonly diagnostic: OverlayDisplayDiagnostic;
  readonly height: OverlayDisplayHeight;
  readonly setupMode: OverlaySetupMode;
  readonly viewBox: typeof overlayViewBox;
  readonly width: OverlayDisplayWidth;
};

type OverlayDisplayQuery =
  | {
      readonly kind: "invalid";
      readonly diagnostic: InvalidOverlayDisplayQueryDiagnostic;
    }
  | {
      readonly kind: "none";
    }
  | {
      readonly kind: "setup";
    }
  | {
      readonly kind: "width";
      readonly width: number;
    }
  | {
      readonly kind: "width-and-setup";
      readonly width: number;
    };

const overlayMode: OverlaySetupMode = Object.freeze({ kind: "overlay" });
const setupMode: OverlaySetupMode = Object.freeze({ kind: "setup" });
const noDisplayDiagnostic: OverlayDisplayDiagnostic = Object.freeze({
  kind: "none",
});

export class OverlayDisplayWidth {
  private readonly pixels: number;

  private constructor(pixels: number) {
    this.pixels = pixels;
    Object.freeze(this);
  }

  public get value(): number {
    return this.pixels;
  }

  public static fromDisplayQuery(
    display: OverlayDisplayQuery,
  ): OverlayDisplayWidth {
    return new OverlayDisplayWidth(displayWidth(display));
  }
}

export class OverlayDisplayHeight {
  private readonly pixels: number;

  private constructor(pixels: number) {
    this.pixels = pixels;
    Object.freeze(this);
  }

  public get value(): number {
    return this.pixels;
  }

  public static fromWidth(width: OverlayDisplayWidth): OverlayDisplayHeight {
    return new OverlayDisplayHeight(
      (width.value * overlayViewBoxHeight) / overlayViewBoxWidth,
    );
  }
}

export function resolveOverlayGeometry(
  parameters: URLSearchParams,
): OverlayGeometry {
  const display = parseDisplayQuery(parameters);
  const width = OverlayDisplayWidth.fromDisplayQuery(display);
  const geometry: OverlayGeometry = {
    diagnostic: displayDiagnostic(display),
    height: OverlayDisplayHeight.fromWidth(width),
    setupMode: displaySetupMode(display),
    viewBox: overlayViewBox,
    width,
  };

  return Object.freeze(geometry);
}

function parseDisplayQuery(parameters: URLSearchParams): OverlayDisplayQuery {
  for (const name of parameters.keys()) {
    if (name !== "setup" && name !== "width") {
      return frozenInvalidDisplayQuery("unsupported-display-query");
    }
  }

  const widthValues = parameters.getAll("width");
  const setupValues = parameters.getAll("setup");
  if (widthValues.length > 1 || setupValues.length > 1) {
    return frozenInvalidDisplayQuery("repeated-display-query-parameter");
  }

  const hasSetup = setupValues.length === 1;
  if (hasSetup && setupValues[0] !== "1") {
    return frozenInvalidDisplayQuery("unsupported-display-query");
  }

  if (widthValues.length === 0) {
    return hasSetup ? frozenSetupDisplayQuery() : frozenNoDisplayQuery();
  }

  const widthValue = widthValues[0];
  if (widthValue === undefined) {
    return frozenInvalidDisplayQuery("malformed-display-width");
  }

  if (/^\d+\.\d+$/.test(widthValue)) {
    return frozenInvalidDisplayQuery("fractional-display-width");
  }

  if (!/^\d+$/.test(widthValue)) {
    return frozenInvalidDisplayQuery("malformed-display-width");
  }

  const width = Number(widthValue);
  if (!Number.isSafeInteger(width)) {
    return frozenInvalidDisplayQuery("unsafe-display-width");
  }

  if (
    width < minimumOverlayDisplayWidth ||
    width > maximumOverlayDisplayWidth
  ) {
    return frozenInvalidDisplayQuery("out-of-range-display-width");
  }

  return hasSetup
    ? frozenWidthAndSetupDisplayQuery(width)
    : frozenWidthDisplayQuery(width);
}

function displayDiagnostic(
  display: OverlayDisplayQuery,
): OverlayDisplayDiagnostic {
  switch (display.kind) {
    case "invalid":
      return display.diagnostic;
    case "none":
    case "setup":
    case "width":
    case "width-and-setup":
      return noDisplayDiagnostic;
  }

  return unreachable(display);
}

function displayWidth(display: OverlayDisplayQuery): number {
  switch (display.kind) {
    case "invalid":
    case "none":
    case "setup":
      return defaultOverlayDisplayWidth;
    case "width":
    case "width-and-setup":
      return display.width;
  }

  return unreachable(display);
}

function displaySetupMode(display: OverlayDisplayQuery): OverlaySetupMode {
  switch (display.kind) {
    case "invalid":
    case "none":
    case "width":
      return overlayMode;
    case "setup":
    case "width-and-setup":
      return setupMode;
  }

  return unreachable(display);
}

function frozenInvalidDisplayQuery(
  reason: InvalidOverlayDisplayQueryDiagnostic["reason"],
): OverlayDisplayQuery {
  const diagnostic: InvalidOverlayDisplayQueryDiagnostic = Object.freeze({
    kind: "invalid-display-query",
    reason,
  });

  return Object.freeze({ kind: "invalid", diagnostic });
}

function frozenNoDisplayQuery(): OverlayDisplayQuery {
  return Object.freeze({ kind: "none" });
}

function frozenSetupDisplayQuery(): OverlayDisplayQuery {
  return Object.freeze({ kind: "setup" });
}

function frozenWidthDisplayQuery(width: number): OverlayDisplayQuery {
  return Object.freeze({ kind: "width", width });
}

function frozenWidthAndSetupDisplayQuery(width: number): OverlayDisplayQuery {
  return Object.freeze({ kind: "width-and-setup", width });
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay display query: ${String(value)}`);
}
