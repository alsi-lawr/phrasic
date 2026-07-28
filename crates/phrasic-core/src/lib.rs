#![forbid(unsafe_code)]

//! Target-neutral Local playback policy.
//!
//! Platform adapters supply already-available sources. This crate neither
//! enumerates native sessions nor retains source history.

use std::fmt;

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct SourceIdentifier(String);

impl SourceIdentifier {
    pub fn parse(value: String) -> Result<Self, SourceIdentifierError> {
        if value.is_empty() {
            return Err(SourceIdentifierError::Empty);
        }

        Ok(Self(value))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SourceIdentifierError {
    Empty,
}

impl fmt::Display for SourceIdentifierError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Empty => formatter.write_str("source identifier is empty"),
        }
    }
}

impl std::error::Error for SourceIdentifierError {}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PlaybackActivity {
    Playing,
    Paused,
    Stopped,
}

impl PlaybackActivity {
    #[must_use]
    pub const fn is_playing(self) -> bool {
        matches!(self, Self::Playing)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AvailableSource {
    identifier: SourceIdentifier,
    activity: PlaybackActivity,
}

impl AvailableSource {
    #[must_use]
    pub const fn new(identifier: SourceIdentifier, activity: PlaybackActivity) -> Self {
        Self {
            identifier,
            activity,
        }
    }

    #[must_use]
    pub const fn identifier(&self) -> &SourceIdentifier {
        &self.identifier
    }

    #[must_use]
    pub const fn activity(&self) -> PlaybackActivity {
        self.activity
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AvailableSources(Vec<AvailableSource>);

impl AvailableSources {
    pub fn try_from_sources(sources: Vec<AvailableSource>) -> Result<Self, AvailableSourcesError> {
        if has_duplicate_identifier(&sources) {
            return Err(AvailableSourcesError::DuplicateIdentifier);
        }

        Ok(Self(sources))
    }

    #[must_use]
    pub fn as_slice(&self) -> &[AvailableSource] {
        &self.0
    }
}

fn has_duplicate_identifier(sources: &[AvailableSource]) -> bool {
    match sources.split_first() {
        None => false,
        Some((first, remaining)) => {
            remaining
                .iter()
                .any(|candidate| candidate.identifier == first.identifier)
                || has_duplicate_identifier(remaining)
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AvailableSourcesError {
    DuplicateIdentifier,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SourceSelection {
    Selected {
        identifier: SourceIdentifier,
        reason: SelectionReason,
    },
    Ambiguous {
        activity: AmbiguousActivity,
    },
    Unavailable {
        reason: UnavailableReason,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SelectionReason {
    AvailableStrictPin,
    SolePlaying,
    SoleNonPlaying,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AmbiguousActivity {
    MultiplePlaying,
    MultipleNonPlaying,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum UnavailableReason {
    LostStrictPin,
    NoSource,
}

#[must_use]
pub fn select_source(
    available_sources: &AvailableSources,
    strict_pin: Option<&SourceIdentifier>,
) -> SourceSelection {
    match strict_pin {
        Some(pin) => select_strict_pin(available_sources.as_slice(), pin),
        None => select_unpinned_source(available_sources.as_slice()),
    }
}

fn select_strict_pin(
    available_sources: &[AvailableSource],
    strict_pin: &SourceIdentifier,
) -> SourceSelection {
    match available_sources
        .iter()
        .find(|candidate| candidate.identifier == *strict_pin)
    {
        Some(candidate) => SourceSelection::Selected {
            identifier: candidate.identifier.clone(),
            reason: SelectionReason::AvailableStrictPin,
        },
        None => SourceSelection::Unavailable {
            reason: UnavailableReason::LostStrictPin,
        },
    }
}

fn select_unpinned_source(available_sources: &[AvailableSource]) -> SourceSelection {
    let playing = available_sources
        .iter()
        .filter(|candidate| candidate.activity.is_playing())
        .collect::<Vec<_>>();

    match playing.as_slice() {
        [candidate] => SourceSelection::Selected {
            identifier: candidate.identifier.clone(),
            reason: SelectionReason::SolePlaying,
        },
        [_, _, ..] => SourceSelection::Ambiguous {
            activity: AmbiguousActivity::MultiplePlaying,
        },
        [] => select_non_playing_source(available_sources),
    }
}

fn select_non_playing_source(available_sources: &[AvailableSource]) -> SourceSelection {
    match available_sources {
        [] => SourceSelection::Unavailable {
            reason: UnavailableReason::NoSource,
        },
        [candidate] => SourceSelection::Selected {
            identifier: candidate.identifier.clone(),
            reason: SelectionReason::SoleNonPlaying,
        },
        [_, _, ..] => SourceSelection::Ambiguous {
            activity: AmbiguousActivity::MultipleNonPlaying,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn identifier(value: &str) -> Result<SourceIdentifier, SourceIdentifierError> {
        SourceIdentifier::parse(value.to_owned())
    }

    fn source(
        value: &str,
        activity: PlaybackActivity,
    ) -> Result<AvailableSource, SourceIdentifierError> {
        identifier(value).map(|identifier| AvailableSource::new(identifier, activity))
    }

    fn sources(values: Vec<AvailableSource>) -> Result<AvailableSources, AvailableSourcesError> {
        AvailableSources::try_from_sources(values)
    }

    #[test]
    fn source_identifiers_are_non_empty_and_preserve_their_exact_value() -> Result<(), String> {
        let exact = identifier(" Player A ").map_err(|error| error.to_string())?;
        let empty = identifier("");

        assert_eq!(exact.as_str(), " Player A ");
        assert_eq!(empty, Err(SourceIdentifierError::Empty));
        Ok(())
    }

    #[test]
    fn available_sources_reject_duplicate_identifiers() -> Result<(), String> {
        let values = vec![
            source("same", PlaybackActivity::Paused).map_err(|error| error.to_string())?,
            source("same", PlaybackActivity::Playing).map_err(|error| error.to_string())?,
        ];

        assert_eq!(
            sources(values),
            Err(AvailableSourcesError::DuplicateIdentifier)
        );
        Ok(())
    }

    #[test]
    fn strict_available_pin_wins_even_when_another_source_is_playing() -> Result<(), String> {
        let pin = identifier("pinned").map_err(|error| error.to_string())?;
        let available = sources(vec![
            source("pinned", PlaybackActivity::Paused).map_err(|error| error.to_string())?,
            source("playing", PlaybackActivity::Playing).map_err(|error| error.to_string())?,
        ])
        .map_err(|error| format!("{error:?}"))?;

        assert_eq!(
            select_source(&available, Some(&pin)),
            SourceSelection::Selected {
                identifier: pin,
                reason: SelectionReason::AvailableStrictPin,
            }
        );
        Ok(())
    }

    #[test]
    fn lost_strict_pin_never_falls_back() -> Result<(), String> {
        let pin = identifier("missing").map_err(|error| error.to_string())?;
        let available = sources(vec![
            source("first", PlaybackActivity::Playing).map_err(|error| error.to_string())?,
            source("second", PlaybackActivity::Playing).map_err(|error| error.to_string())?,
        ])
        .map_err(|error| format!("{error:?}"))?;

        assert_eq!(
            select_source(&available, Some(&pin)),
            SourceSelection::Unavailable {
                reason: UnavailableReason::LostStrictPin,
            }
        );
        Ok(())
    }

    #[test]
    fn unpinned_policy_table_is_exhaustive() -> Result<(), String> {
        struct Case {
            name: &'static str,
            candidates: Vec<(&'static str, PlaybackActivity)>,
            expected: SourceSelection,
        }

        let cases = vec![
            Case {
                name: "no source",
                candidates: vec![],
                expected: SourceSelection::Unavailable {
                    reason: UnavailableReason::NoSource,
                },
            },
            Case {
                name: "sole playing",
                candidates: vec![("playing", PlaybackActivity::Playing)],
                expected: SourceSelection::Selected {
                    identifier: identifier("playing").map_err(|error| error.to_string())?,
                    reason: SelectionReason::SolePlaying,
                },
            },
            Case {
                name: "multiple playing",
                candidates: vec![
                    ("first", PlaybackActivity::Playing),
                    ("second", PlaybackActivity::Playing),
                ],
                expected: SourceSelection::Ambiguous {
                    activity: AmbiguousActivity::MultiplePlaying,
                },
            },
            Case {
                name: "sole paused",
                candidates: vec![("paused", PlaybackActivity::Paused)],
                expected: SourceSelection::Selected {
                    identifier: identifier("paused").map_err(|error| error.to_string())?,
                    reason: SelectionReason::SoleNonPlaying,
                },
            },
            Case {
                name: "sole stopped",
                candidates: vec![("stopped", PlaybackActivity::Stopped)],
                expected: SourceSelection::Selected {
                    identifier: identifier("stopped").map_err(|error| error.to_string())?,
                    reason: SelectionReason::SoleNonPlaying,
                },
            },
            Case {
                name: "multiple non-playing",
                candidates: vec![
                    ("paused", PlaybackActivity::Paused),
                    ("stopped", PlaybackActivity::Stopped),
                ],
                expected: SourceSelection::Ambiguous {
                    activity: AmbiguousActivity::MultipleNonPlaying,
                },
            },
        ];

        for case in cases {
            let candidates = case
                .candidates
                .into_iter()
                .map(|(value, activity)| source(value, activity).map_err(|error| error.to_string()))
                .collect::<Result<Vec<_>, _>>()?;
            let available = sources(candidates).map_err(|error| format!("{error:?}"))?;

            assert_eq!(
                select_source(&available, None),
                case.expected,
                "{}",
                case.name
            );
        }
        Ok(())
    }

    #[test]
    fn ambiguity_never_uses_enumeration_order() -> Result<(), String> {
        let first_order = sources(vec![
            source("one", PlaybackActivity::Playing).map_err(|error| error.to_string())?,
            source("two", PlaybackActivity::Playing).map_err(|error| error.to_string())?,
        ])
        .map_err(|error| format!("{error:?}"))?;
        let second_order = sources(vec![
            source("two", PlaybackActivity::Playing).map_err(|error| error.to_string())?,
            source("one", PlaybackActivity::Playing).map_err(|error| error.to_string())?,
        ])
        .map_err(|error| format!("{error:?}"))?;

        assert_eq!(
            select_source(&first_order, None),
            select_source(&second_order, None)
        );
        Ok(())
    }
}
