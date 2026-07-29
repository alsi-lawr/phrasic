import type { LocalPolicySelection } from "./local-playback.ts";

export type PolicyBScenario =
  | "available-strict-pin"
  | "lost-strict-pin"
  | "multiple-not-playing-sources"
  | "multiple-playing-sources"
  | "no-source"
  | "sole-paused-source"
  | "sole-playing-source"
  | "sole-stopped-source";

export type PolicyBScenarioFixture = {
  readonly outcome: LocalPolicySelection;
  readonly scenario: PolicyBScenario;
};

// T-005 owns selection. These are trusted policy-B outcomes, not a selector.
export const policyBScenarioFixtures: ReadonlyArray<PolicyBScenarioFixture> =
  Object.freeze([
    Object.freeze({
      outcome: Object.freeze({ kind: "selected", reason: "strict-pin" }),
      scenario: "available-strict-pin",
    }),
    Object.freeze({
      outcome: Object.freeze({
        kind: "unavailable",
        reason: "strict-pin-unavailable",
      }),
      scenario: "lost-strict-pin",
    }),
    Object.freeze({
      outcome: Object.freeze({ kind: "selected", reason: "sole-playing" }),
      scenario: "sole-playing-source",
    }),
    Object.freeze({
      outcome: Object.freeze({ kind: "ambiguous", reason: "multiple-playing" }),
      scenario: "multiple-playing-sources",
    }),
    Object.freeze({
      outcome: Object.freeze({ kind: "selected", reason: "sole-not-playing" }),
      scenario: "sole-paused-source",
    }),
    Object.freeze({
      outcome: Object.freeze({ kind: "selected", reason: "sole-not-playing" }),
      scenario: "sole-stopped-source",
    }),
    Object.freeze({
      outcome: Object.freeze({
        kind: "ambiguous",
        reason: "multiple-not-playing",
      }),
      scenario: "multiple-not-playing-sources",
    }),
    Object.freeze({
      outcome: Object.freeze({ kind: "unavailable", reason: "no-source" }),
      scenario: "no-source",
    }),
  ]);
