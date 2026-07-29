export type BrowserConfigurationResponse = {
  readonly ok: boolean;
  readonly readJson: () => Promise<unknown>;
};
