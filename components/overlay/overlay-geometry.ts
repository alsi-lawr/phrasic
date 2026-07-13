export const overlayViewBox = "0 0 4725 1080";
export const overlayViewBoxWidth = 4_725;
export const overlayViewBoxHeight = 1_080;
export const defaultOverlayDisplayWidth = 1_920;
export const minimumOverlayDisplayWidth = 320;
export const maximumOverlayDisplayWidth = 7_680;

export type OverlayGeometry = {
  readonly height: OverlayDisplayHeight;
  readonly viewBox: typeof overlayViewBox;
  readonly width: OverlayDisplayWidth;
};

export class OverlayDisplayWidth {
  private readonly pixels: number;

  private constructor(pixels: number) {
    this.pixels = pixels;
    Object.freeze(this);
  }

  public get value(): number {
    return this.pixels;
  }

  public static fromSearchParameters(
    parameters: URLSearchParams,
  ): OverlayDisplayWidth {
    const width = validatedDisplayWidth(parameters);
    return new OverlayDisplayWidth(width);
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
  const width = OverlayDisplayWidth.fromSearchParameters(parameters);
  const geometry: OverlayGeometry = {
    height: OverlayDisplayHeight.fromWidth(width),
    viewBox: overlayViewBox,
    width,
  };

  return Object.freeze(geometry);
}

function validatedDisplayWidth(parameters: URLSearchParams): number {
  for (const name of parameters.keys()) {
    if (name !== "setup" && name !== "width") {
      return defaultOverlayDisplayWidth;
    }
  }

  const widthValues = parameters.getAll("width");
  const setupValues = parameters.getAll("setup");
  if (widthValues.length > 1 || setupValues.length > 1) {
    return defaultOverlayDisplayWidth;
  }

  const setup = setupValues[0];
  if (setup !== undefined && setup !== "1") {
    return defaultOverlayDisplayWidth;
  }

  const width = widthValues[0];
  if (width === undefined) {
    return defaultOverlayDisplayWidth;
  }

  if (!/^\d+$/.test(width)) {
    return defaultOverlayDisplayWidth;
  }

  const parsedWidth = Number(width);
  if (
    !Number.isSafeInteger(parsedWidth) ||
    parsedWidth < minimumOverlayDisplayWidth ||
    parsedWidth > maximumOverlayDisplayWidth
  ) {
    return defaultOverlayDisplayWidth;
  }

  return parsedWidth;
}
