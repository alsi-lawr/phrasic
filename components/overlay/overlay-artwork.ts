export type ArtworkCornerRadiusScale = {
  readonly sourceArtworkDimension: number;
  readonly sourceCornerRadius: number;
  readonly targetArtworkDimension: number;
};

export const legacyArtworkDimension = 1_080;
export const legacyArtworkCornerRadius = 200;

const currentArtworkDimension = 824;

export const overlayArtworkCornerRadius = proportionalArtworkCornerRadius({
  sourceArtworkDimension: legacyArtworkDimension,
  sourceCornerRadius: legacyArtworkCornerRadius,
  targetArtworkDimension: currentArtworkDimension,
});

export const overlayArtworkRectangle = Object.freeze({
  cornerRadius: overlayArtworkCornerRadius,
  height: currentArtworkDimension,
  width: currentArtworkDimension,
  x: 128,
  y: 128,
});

export const overlayArtworkClipPathId = "overlay-artwork-clip";

export function proportionalArtworkCornerRadius(
  scale: ArtworkCornerRadiusScale,
): number {
  return (
    (scale.sourceCornerRadius * scale.targetArtworkDimension) /
    scale.sourceArtworkDimension
  );
}
