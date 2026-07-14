import type { ComponentType } from "react";

export type OverlayAttributionProps = {
  readonly shellWidth: number;
};

export type OverlayPresentation = {
  readonly attribution: ComponentType<OverlayAttributionProps>;
  readonly displayName: string;
  readonly headingId: string;
  readonly providerId: string;
};
