//! Linux MPRIS 2.2 observation on the logged-in user's session bus.
//!
//! This adapter deliberately polls position because normal playback progress
//! has no property signal. Name-owner, property, and seek signals trigger
//! immediate refreshes between polls. It declares no player-control methods.

#[path = "linux_artwork.rs"]
mod artwork;

use std::collections::HashMap;
use std::time::Duration;

use artwork::ArtworkLoader;
use phrasic_core::{
    AmbiguousActivity, AvailableSource, AvailableSources, PlaybackActivity, SelectionReason,
    SourceIdentifier, SourceSelection, UnavailableReason, select_source,
};
use phrasic_rpc::SnapshotState;
use phrasic_rpc::local::get_snapshot_response::Outcome;
use phrasic_rpc::local::{
    AmbiguityReason, AmbiguousSnapshot, Artwork, AvailableSnapshot, CapabilityState,
    CapabilityStatus, GetSnapshotResponse, PlaybackActivity as RpcPlaybackActivity, PlaybackItem,
    SelectionReason as RpcSelectionReason, Timeline, UnavailableReason as RpcUnavailableReason,
    UnavailableSnapshot,
};
use tokio::time::{MissedTickBehavior, interval, sleep, timeout};
use tokio_stream::StreamExt;
use tokio_util::sync::CancellationToken;
use zbus::fdo::DBusProxy;
use zbus::proxy::CacheProperties;
use zbus::zvariant::OwnedValue;
use zbus::{Connection, MatchRule, MessageStream};

const MPRIS_PREFIX: &str = "org.mpris.MediaPlayer2.";
const MPRIS_PATH: &str = "/org/mpris/MediaPlayer2";
const MPRIS_PLAYER_INTERFACE: &str = "org.mpris.MediaPlayer2.Player";
const POLL_INTERVAL: Duration = Duration::from_secs(1);
const RECONNECT_INTERVAL: Duration = Duration::from_millis(250);
const PROPERTY_DEADLINE: Duration = Duration::from_millis(500);
const POLL_HINT_MILLISECONDS: u32 = 1_000;

#[zbus::proxy(
    interface = "org.mpris.MediaPlayer2.Player",
    default_path = "/org/mpris/MediaPlayer2"
)]
trait MprisPlayer {
    #[zbus(property(emits_changed_signal = "false"))]
    fn playback_status(&self) -> zbus::Result<String>;

    #[zbus(property(emits_changed_signal = "false"))]
    fn metadata(&self) -> zbus::Result<HashMap<String, OwnedValue>>;

    #[zbus(property(emits_changed_signal = "false"))]
    fn position(&self) -> zbus::Result<i64>;

    #[zbus(property(emits_changed_signal = "false"))]
    fn rate(&self) -> zbus::Result<f64>;
}

#[zbus::proxy(
    interface = "org.mpris.MediaPlayer2",
    default_path = "/org/mpris/MediaPlayer2"
)]
trait MprisRoot {
    #[zbus(property(emits_changed_signal = "false"))]
    fn identity(&self) -> zbus::Result<String>;
}

pub(super) async fn run(
    state: SnapshotState,
    strict_pin: Option<SourceIdentifier>,
    shutdown: CancellationToken,
) {
    loop {
        if shutdown.is_cancelled() {
            return;
        }

        if let Ok(connection) = Connection::session().await
            && drive_connection(&state, strict_pin.as_ref(), &shutdown, &connection)
                .await
                .is_ok()
        {
            return;
        }

        state.replace(native_session_unavailable()).await;
        tokio::select! {
            () = shutdown.cancelled() => return,
            () = sleep(RECONNECT_INTERVAL) => {}
        }
    }
}

async fn drive_connection(
    state: &SnapshotState,
    strict_pin: Option<&SourceIdentifier>,
    shutdown: &CancellationToken,
    connection: &Connection,
) -> zbus::Result<()> {
    let mut owner_changes = owner_change_stream(connection).await?;
    let mut property_changes = property_change_stream(connection).await?;
    let mut seeks = seek_stream(connection).await?;
    let mut poll = interval(POLL_INTERVAL);
    poll.set_missed_tick_behavior(MissedTickBehavior::Skip);
    poll.tick().await;
    let mut artwork_loader = ArtworkLoader::default();

    refresh(state, strict_pin, connection, &mut artwork_loader).await?;

    loop {
        tokio::select! {
            () = shutdown.cancelled() => return Ok(()),
            event = next_mpris_owner_change(&mut owner_changes) => {
                event?;
            }
            event = property_changes.next() => {
                stream_event(event)?;
            }
            event = seeks.next() => {
                stream_event(event)?;
            }
            _ = poll.tick() => {}
        }
        refresh(state, strict_pin, connection, &mut artwork_loader).await?;
    }
}

async fn refresh(
    state: &SnapshotState,
    strict_pin: Option<&SourceIdentifier>,
    connection: &Connection,
    artwork_loader: &mut ArtworkLoader,
) -> zbus::Result<()> {
    let candidates = read_candidates(connection).await?;
    let selection = candidate_selection(&candidates, strict_pin);
    let artwork = match selection {
        CandidateSelection::Selected { index, .. } => {
            let source = candidates
                .get(index)
                .and_then(|candidate| candidate.art_url.as_deref())
                .map(str::to_owned);
            match source {
                Some(source) => artwork_loader.load(&source).await,
                None => None,
            }
        }
        CandidateSelection::Ambiguous { .. } | CandidateSelection::Unavailable { .. } => None,
    };
    state
        .replace(snapshot_from_selection(&candidates, selection, artwork))
        .await;
    Ok(())
}

async fn read_candidates(connection: &Connection) -> zbus::Result<Vec<MprisCandidate>> {
    let names = DBusProxy::new(connection).await?.list_names().await?;
    let mut candidates = Vec::new();

    for name in names
        .iter()
        .map(|name| name.as_str())
        .filter(|name| name.starts_with(MPRIS_PREFIX))
    {
        if let Ok(Ok(Some(candidate))) =
            timeout(PROPERTY_DEADLINE, read_candidate(connection, name)).await
        {
            candidates.push(candidate);
        }
    }

    Ok(candidates)
}

async fn read_candidate(
    connection: &Connection,
    bus_name: &str,
) -> zbus::Result<Option<MprisCandidate>> {
    let player = MprisPlayerProxy::builder(connection)
        .destination(bus_name)?
        .cache_properties(CacheProperties::No)
        .build()
        .await?;
    let activity = match player.playback_status().await?.as_str() {
        "Playing" => PlaybackActivity::Playing,
        "Paused" => PlaybackActivity::Paused,
        "Stopped" => PlaybackActivity::Stopped,
        _ => return Ok(None),
    };
    let identifier = match SourceIdentifier::parse(bus_name.to_owned()) {
        Ok(identifier) => identifier,
        Err(_) => return Ok(None),
    };

    let metadata = player.metadata().await.unwrap_or_default();
    let position_milliseconds = player
        .position()
        .await
        .ok()
        .and_then(microseconds_to_milliseconds);
    // Rate is observed so malformed or changing rate never poisons an otherwise
    // valid candidate. Position is polled directly and needs no extrapolation.
    let _observed_rate = player.rate().await.ok().filter(|rate| rate.is_finite());
    let root = MprisRootProxy::builder(connection)
        .destination(bus_name)?
        .cache_properties(CacheProperties::No)
        .build()
        .await?;
    let native_identity = root.identity().await.ok().and_then(non_empty);

    Ok(Some(MprisCandidate {
        identifier,
        activity,
        item: MprisItem {
            title: metadata_string(&metadata, "xesam:title"),
            creator: metadata_strings(&metadata, "xesam:artist")
                .and_then(|artists| artists.into_iter().find_map(non_empty)),
            collection: metadata_string(&metadata, "xesam:album"),
            destination: metadata_http_url(&metadata, "xesam:url"),
            native_identity,
        },
        art_url: metadata_string(&metadata, "mpris:artUrl"),
        position_milliseconds,
        duration_milliseconds: metadata_i64(&metadata, "mpris:length")
            .and_then(microseconds_to_milliseconds),
    }))
}

#[cfg(test)]
fn snapshot_from_candidates(
    candidates: Vec<MprisCandidate>,
    strict_pin: Option<&SourceIdentifier>,
) -> GetSnapshotResponse {
    let selection = candidate_selection(&candidates, strict_pin);
    snapshot_from_selection(&candidates, selection, None)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum CandidateSelection {
    Selected {
        index: usize,
        reason: SelectionReason,
    },
    Ambiguous {
        activity: AmbiguousActivity,
    },
    Unavailable {
        reason: UnavailableReason,
    },
}

fn candidate_selection(
    candidates: &[MprisCandidate],
    strict_pin: Option<&SourceIdentifier>,
) -> CandidateSelection {
    let available = candidates
        .iter()
        .map(|candidate| AvailableSource::new(candidate.identifier.clone(), candidate.activity))
        .collect::<Vec<_>>();
    let selection = match AvailableSources::try_from_sources(available) {
        Ok(available) => select_source(&available, strict_pin),
        Err(_) => SourceSelection::Unavailable {
            reason: UnavailableReason::NoSource,
        },
    };

    match selection {
        SourceSelection::Selected { identifier, reason } => match candidates
            .iter()
            .position(|candidate| candidate.identifier == identifier)
        {
            Some(index) => CandidateSelection::Selected { index, reason },
            None => CandidateSelection::Unavailable {
                reason: UnavailableReason::NoSource,
            },
        },
        SourceSelection::Ambiguous { activity } => CandidateSelection::Ambiguous { activity },
        SourceSelection::Unavailable { reason } => CandidateSelection::Unavailable { reason },
    }
}

fn snapshot_from_selection(
    candidates: &[MprisCandidate],
    selection: CandidateSelection,
    artwork: Option<Artwork>,
) -> GetSnapshotResponse {
    match selection {
        CandidateSelection::Selected { index, reason } => match candidates.get(index) {
            Some(candidate) => available_snapshot(candidate, reason, artwork),
            None => no_source_snapshot(),
        },
        CandidateSelection::Ambiguous { activity } => ambiguous_snapshot(activity),
        CandidateSelection::Unavailable { reason } => unavailable_snapshot(reason),
    }
}

fn available_snapshot(
    candidate: &MprisCandidate,
    reason: SelectionReason,
    artwork: Option<Artwork>,
) -> GetSnapshotResponse {
    let item = candidate.item.to_rpc(artwork);
    let timeline = match (
        candidate.position_milliseconds,
        candidate.duration_milliseconds,
    ) {
        (None, None) => None,
        (position_milliseconds, duration_milliseconds) => Some(Timeline {
            position_milliseconds,
            duration_milliseconds,
        }),
    };
    response(
        CapabilityStatus::Available,
        Outcome::Available(AvailableSnapshot {
            activity: rpc_activity(candidate.activity).into(),
            item,
            timeline,
            selection_reason: rpc_selection_reason(reason).into(),
        }),
    )
}

fn ambiguous_snapshot(activity: AmbiguousActivity) -> GetSnapshotResponse {
    let reason = match activity {
        AmbiguousActivity::MultiplePlaying => AmbiguityReason::MultiplePlaying,
        AmbiguousActivity::MultipleNonPlaying => AmbiguityReason::MultipleNonPlaying,
    };
    response(
        CapabilityStatus::Available,
        Outcome::Ambiguous(AmbiguousSnapshot {
            reason: reason.into(),
        }),
    )
}

fn unavailable_snapshot(reason: UnavailableReason) -> GetSnapshotResponse {
    let reason = match reason {
        UnavailableReason::LostStrictPin => RpcUnavailableReason::StrictPinLost,
        UnavailableReason::NoSource => RpcUnavailableReason::NoSource,
    };
    response(
        CapabilityStatus::Available,
        Outcome::Unavailable(UnavailableSnapshot {
            reason: reason.into(),
        }),
    )
}

fn no_source_snapshot() -> GetSnapshotResponse {
    unavailable_snapshot(UnavailableReason::NoSource)
}

fn native_session_unavailable() -> GetSnapshotResponse {
    response(
        CapabilityStatus::NativeSessionUnavailable,
        Outcome::Unavailable(UnavailableSnapshot {
            reason: RpcUnavailableReason::NativeSessionUnavailable.into(),
        }),
    )
}

fn response(status: CapabilityStatus, outcome: Outcome) -> GetSnapshotResponse {
    GetSnapshotResponse {
        instance_id: Vec::new(),
        revision: 0,
        observed_at_monotonic_milliseconds: 0,
        poll_hint_milliseconds: POLL_HINT_MILLISECONDS,
        capability: Some(CapabilityState {
            status: status.into(),
        }),
        outcome: Some(outcome),
    }
}

const fn rpc_activity(activity: PlaybackActivity) -> RpcPlaybackActivity {
    match activity {
        PlaybackActivity::Playing => RpcPlaybackActivity::Playing,
        PlaybackActivity::Paused => RpcPlaybackActivity::Paused,
        PlaybackActivity::Stopped => RpcPlaybackActivity::Stopped,
    }
}

const fn rpc_selection_reason(reason: SelectionReason) -> RpcSelectionReason {
    match reason {
        SelectionReason::AvailableStrictPin => RpcSelectionReason::StrictPin,
        SelectionReason::SolePlaying => RpcSelectionReason::SolePlaying,
        SelectionReason::SoleNonPlaying => RpcSelectionReason::SoleNonPlaying,
    }
}

fn metadata_string(metadata: &HashMap<String, OwnedValue>, key: &str) -> Option<String> {
    metadata
        .get(key)
        .and_then(|value| <&str>::try_from(value).ok())
        .map(str::to_owned)
        .and_then(non_empty)
}

fn metadata_strings(metadata: &HashMap<String, OwnedValue>, key: &str) -> Option<Vec<String>> {
    metadata
        .get(key)
        .and_then(|value| value.try_clone().ok())
        .and_then(|value| Vec::<String>::try_from(value).ok())
}

fn metadata_i64(metadata: &HashMap<String, OwnedValue>, key: &str) -> Option<i64> {
    metadata
        .get(key)
        .and_then(|value| i64::try_from(value).ok())
}

fn metadata_http_url(metadata: &HashMap<String, OwnedValue>, key: &str) -> Option<String> {
    metadata_string(metadata, key).filter(|value| {
        url::Url::parse(value)
            .ok()
            .is_some_and(|parsed| matches!(parsed.scheme(), "http" | "https"))
    })
}

fn non_empty(value: String) -> Option<String> {
    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

fn microseconds_to_milliseconds(value: i64) -> Option<u64> {
    u64::try_from(value).ok().map(|value| value / 1_000)
}

async fn owner_change_stream(connection: &Connection) -> zbus::Result<MessageStream> {
    let rule = MatchRule::builder()
        .msg_type(zbus::message::Type::Signal)
        .sender("org.freedesktop.DBus")?
        .interface("org.freedesktop.DBus")?
        .member("NameOwnerChanged")?
        .build();
    MessageStream::for_match_rule(rule, connection, Some(32)).await
}

async fn property_change_stream(connection: &Connection) -> zbus::Result<MessageStream> {
    let rule = MatchRule::builder()
        .msg_type(zbus::message::Type::Signal)
        .path(MPRIS_PATH)?
        .interface("org.freedesktop.DBus.Properties")?
        .member("PropertiesChanged")?
        .add_arg(MPRIS_PLAYER_INTERFACE)?
        .build();
    MessageStream::for_match_rule(rule, connection, Some(32)).await
}

async fn seek_stream(connection: &Connection) -> zbus::Result<MessageStream> {
    let rule = MatchRule::builder()
        .msg_type(zbus::message::Type::Signal)
        .path(MPRIS_PATH)?
        .interface(MPRIS_PLAYER_INTERFACE)?
        .member("Seeked")?
        .build();
    MessageStream::for_match_rule(rule, connection, Some(32)).await
}

async fn next_mpris_owner_change(stream: &mut MessageStream) -> zbus::Result<()> {
    loop {
        let message = stream_event(stream.next().await)?;
        let body = message.body().deserialize::<(String, String, String)>();
        if body
            .ok()
            .is_some_and(|(name, _, _)| name.starts_with(MPRIS_PREFIX))
        {
            return Ok(());
        }
    }
}

fn stream_event(
    event: Option<zbus::Result<zbus::message::Message>>,
) -> zbus::Result<zbus::message::Message> {
    match event {
        Some(result) => result,
        None => Err(zbus::Error::Failure(
            "session bus signal stream ended".to_owned(),
        )),
    }
}

#[derive(Clone, Debug, PartialEq)]
struct MprisCandidate {
    identifier: SourceIdentifier,
    activity: PlaybackActivity,
    item: MprisItem,
    art_url: Option<String>,
    position_milliseconds: Option<u64>,
    duration_milliseconds: Option<u64>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
struct MprisItem {
    title: Option<String>,
    creator: Option<String>,
    collection: Option<String>,
    destination: Option<String>,
    native_identity: Option<String>,
}

impl MprisItem {
    fn to_rpc(&self, artwork: Option<Artwork>) -> Option<PlaybackItem> {
        if self == &Self::default() {
            return None;
        }
        Some(PlaybackItem {
            title: self.title.clone(),
            creator: self.creator.clone(),
            collection: self.collection.clone(),
            destination: self.destination.clone(),
            native_identity: self.native_identity.clone(),
            artwork,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::future::Future;

    use phrasic_rpc::local::get_snapshot_response::Outcome;
    use phrasic_rpc::local::local_media_server::LocalMedia;
    use phrasic_rpc::local::{
        GetInstanceInfoRequest, GetSnapshotRequest, PlaybackActivity as RpcPlaybackActivity,
    };
    use phrasic_rpc::{InstanceId, LocalMediaService};
    use tonic::Request;
    use zbus::connection::Builder;
    use zbus::object_server::SignalEmitter;
    use zbus::zvariant::{OwnedValue, Value};

    use super::*;

    const FIRST_NAME: &str = "org.mpris.MediaPlayer2.PhrasicFakeOne";
    const SECOND_NAME: &str = "org.mpris.MediaPlayer2.PhrasicFakeTwo";
    const TEST_PNG: &[u8] = b"\x89PNG\r\n\x1a\ntransport-artwork";

    #[derive(Clone, Debug)]
    struct FakeRoot {
        identity: String,
    }

    #[zbus::interface(name = "org.mpris.MediaPlayer2")]
    impl FakeRoot {
        #[zbus(property)]
        fn identity(&self) -> String {
            self.identity.clone()
        }
    }

    #[derive(Clone, Debug)]
    struct FakePlayer {
        playback_status: String,
        title: Option<String>,
        artists: Option<Vec<String>>,
        album: Option<String>,
        url: Option<String>,
        art_url: Option<String>,
        length: Option<i64>,
        position: i64,
        rate: f64,
        metadata_fails: bool,
    }

    impl FakePlayer {
        fn playing() -> Self {
            Self {
                playback_status: "Playing".to_owned(),
                title: Some("Fake title".to_owned()),
                artists: Some(vec!["Fake creator".to_owned()]),
                album: Some("Fake collection".to_owned()),
                url: Some("https://example.invalid/item".to_owned()),
                art_url: Some("file:///private/fake-cover.png".to_owned()),
                length: Some(180_123_000),
                position: 12_345_000,
                rate: 1.0,
                metadata_fails: false,
            }
        }

        fn stopped() -> Self {
            Self {
                playback_status: "Stopped".to_owned(),
                title: None,
                artists: None,
                album: None,
                url: None,
                art_url: None,
                length: None,
                position: 0,
                rate: 1.0,
                metadata_fails: false,
            }
        }
    }

    #[zbus::interface(name = "org.mpris.MediaPlayer2.Player")]
    impl FakePlayer {
        #[zbus(property)]
        fn playback_status(&self) -> String {
            self.playback_status.clone()
        }

        #[zbus(property)]
        fn metadata(&self) -> zbus::fdo::Result<HashMap<String, OwnedValue>> {
            if self.metadata_fails {
                return Err(zbus::fdo::Error::Failed(
                    "deliberate fake metadata failure".to_owned(),
                ));
            }
            let mut values = HashMap::new();
            insert_optional_value(&mut values, "xesam:title", self.title.as_deref())?;
            insert_optional_strings(&mut values, "xesam:artist", self.artists.as_deref())?;
            insert_optional_value(&mut values, "xesam:album", self.album.as_deref())?;
            insert_optional_value(&mut values, "xesam:url", self.url.as_deref())?;
            insert_optional_value(&mut values, "mpris:artUrl", self.art_url.as_deref())?;
            if let Some(length) = self.length {
                values.insert("mpris:length".to_owned(), length.into());
            }
            Ok(values)
        }

        #[zbus(property)]
        fn position(&self) -> i64 {
            self.position
        }

        #[zbus(property)]
        fn rate(&self) -> f64 {
            self.rate
        }

        #[zbus(signal)]
        async fn seeked(emitter: &SignalEmitter<'_>, position: i64) -> zbus::Result<()>;
    }

    struct MalformedPlayer;

    #[zbus::interface(name = "org.mpris.MediaPlayer2.Player")]
    impl MalformedPlayer {
        #[zbus(property)]
        fn playback_status(&self) -> u32 {
            7
        }

        #[zbus(property)]
        fn metadata(&self) -> String {
            "not a metadata dictionary".to_owned()
        }

        #[zbus(property)]
        fn position(&self) -> String {
            "not a position".to_owned()
        }

        #[zbus(property)]
        fn rate(&self) -> String {
            "not a rate".to_owned()
        }
    }

    fn insert_optional_value(
        values: &mut HashMap<String, OwnedValue>,
        key: &str,
        value: Option<&str>,
    ) -> zbus::fdo::Result<()> {
        if let Some(value) = value {
            values.insert(key.to_owned(), owned(Value::from(value))?);
        }
        Ok(())
    }

    fn insert_optional_strings(
        values: &mut HashMap<String, OwnedValue>,
        key: &str,
        value: Option<&[String]>,
    ) -> zbus::fdo::Result<()> {
        if let Some(value) = value {
            let borrowed = value.iter().map(String::as_str).collect::<Vec<_>>();
            values.insert(key.to_owned(), owned(Value::from(borrowed))?);
        }
        Ok(())
    }

    fn owned(value: Value<'_>) -> zbus::fdo::Result<OwnedValue> {
        OwnedValue::try_from(value)
            .map_err(|_| zbus::fdo::Error::Failed("fake metadata conversion".to_owned()))
    }

    async fn fake_service(
        name: &str,
        player: FakePlayer,
        allow_replacement: bool,
        replace_existing: bool,
    ) -> zbus::Result<Connection> {
        Builder::session()?
            .serve_at(
                MPRIS_PATH,
                FakeRoot {
                    identity: format!("{name}.identity"),
                },
            )?
            .serve_at(MPRIS_PATH, player)?
            .name(name)?
            .allow_name_replacements(allow_replacement)
            .replace_existing_names(replace_existing)
            .build()
            .await
    }

    async fn malformed_service(name: &str) -> zbus::Result<Connection> {
        Builder::session()?
            .serve_at(
                MPRIS_PATH,
                FakeRoot {
                    identity: "Malformed fake".to_owned(),
                },
            )?
            .serve_at(MPRIS_PATH, MalformedPlayer)?
            .name(name)?
            .build()
            .await
    }

    async fn mutate_player<Mutate>(
        connection: &Connection,
        mutate: Mutate,
        changed: ChangedProperty,
    ) -> zbus::Result<()>
    where
        Mutate: FnOnce(&mut FakePlayer),
    {
        let interface = connection
            .object_server()
            .interface::<_, FakePlayer>(MPRIS_PATH)
            .await?;
        {
            let mut player = interface.get_mut().await;
            mutate(&mut player);
        }
        let player = interface.get().await;
        match changed {
            ChangedProperty::PlaybackStatus => {
                player
                    .playback_status_changed(interface.signal_emitter())
                    .await
            }
            ChangedProperty::Metadata => player.metadata_changed(interface.signal_emitter()).await,
            ChangedProperty::Position => {
                FakePlayer::seeked(interface.signal_emitter(), player.position).await
            }
            ChangedProperty::Rate => player.rate_changed(interface.signal_emitter()).await,
        }
    }

    #[derive(Clone, Copy)]
    enum ChangedProperty {
        PlaybackStatus,
        Metadata,
        Position,
        Rate,
    }

    async fn wait_for_snapshot<Predicate>(
        state: &SnapshotState,
        predicate: Predicate,
    ) -> Result<GetSnapshotResponse, String>
    where
        Predicate: Fn(&GetSnapshotResponse) -> bool,
    {
        timeout(Duration::from_secs(3), async {
            loop {
                let snapshot = state.read().await;
                if predicate(&snapshot) {
                    return snapshot;
                }
                sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .map_err(|_| "timed out waiting for collector snapshot".to_owned())
    }

    fn available(snapshot: &GetSnapshotResponse) -> Option<&AvailableSnapshot> {
        match snapshot.outcome.as_ref() {
            Some(Outcome::Available(available)) => Some(available),
            _ => None,
        }
    }

    fn unavailable_reason(snapshot: &GetSnapshotResponse) -> Option<RpcUnavailableReason> {
        match snapshot.outcome.as_ref() {
            Some(Outcome::Unavailable(unavailable)) => {
                RpcUnavailableReason::try_from(unavailable.reason).ok()
            }
            _ => None,
        }
    }

    fn ambiguity_reason(snapshot: &GetSnapshotResponse) -> Option<AmbiguityReason> {
        match snapshot.outcome.as_ref() {
            Some(Outcome::Ambiguous(ambiguous)) => AmbiguityReason::try_from(ambiguous.reason).ok(),
            _ => None,
        }
    }

    fn private_bus() -> Result<(), String> {
        match std::env::var("PHRASIC_PRIVATE_DBUS_TEST") {
            Ok(value) if value == "1" => Ok(()),
            _ => Err("run with PHRASIC_PRIVATE_DBUS_TEST=1 under dbus-run-session".to_owned()),
        }
    }

    fn identifier(value: &str) -> Result<SourceIdentifier, String> {
        SourceIdentifier::parse(value.to_owned()).map_err(|error| error.to_string())
    }

    fn candidate(activity: PlaybackActivity) -> Result<MprisCandidate, String> {
        Ok(MprisCandidate {
            identifier: identifier(FIRST_NAME)?,
            activity,
            item: MprisItem::default(),
            art_url: None,
            position_milliseconds: None,
            duration_milliseconds: None,
        })
    }

    async fn run_and_cancel<F>(
        state: SnapshotState,
        connection: Connection,
        action: F,
    ) -> Result<(), Box<dyn std::error::Error>>
    where
        F: Future<Output = Result<(), Box<dyn std::error::Error>>>,
    {
        let shutdown = CancellationToken::new();
        let task_shutdown = shutdown.clone();
        let task_state = state.clone();
        let task = tokio::spawn(async move {
            drive_connection(&task_state, None, &task_shutdown, &connection).await
        });
        let action_result = action.await;
        shutdown.cancel();
        let task_result = task.await?;
        action_result?;
        match task_result {
            Ok(()) => Ok(()),
            Err(error) => Err(error.into()),
        }
    }

    #[test]
    fn generated_snapshot_mapping_is_total_for_policy_b() -> Result<(), String> {
        let playing = candidate(PlaybackActivity::Playing)?;
        let paused = MprisCandidate {
            identifier: identifier(SECOND_NAME)?,
            activity: PlaybackActivity::Paused,
            ..playing.clone()
        };

        assert_eq!(
            unavailable_reason(&snapshot_from_candidates(Vec::new(), None)),
            Some(RpcUnavailableReason::NoSource)
        );
        assert_eq!(
            available(&snapshot_from_candidates(vec![playing.clone()], None))
                .map(|snapshot| snapshot.selection_reason),
            Some(i32::from(RpcSelectionReason::SolePlaying))
        );
        assert_eq!(
            ambiguity_reason(&snapshot_from_candidates(
                vec![playing.clone(), paused.clone()],
                None
            )),
            None
        );
        assert_eq!(
            ambiguity_reason(&snapshot_from_candidates(
                vec![
                    playing.clone(),
                    MprisCandidate {
                        activity: PlaybackActivity::Playing,
                        ..paused.clone()
                    },
                ],
                None,
            )),
            Some(AmbiguityReason::MultiplePlaying)
        );
        assert_eq!(
            ambiguity_reason(&snapshot_from_candidates(
                vec![
                    MprisCandidate {
                        activity: PlaybackActivity::Stopped,
                        ..playing.clone()
                    },
                    paused,
                ],
                None,
            )),
            Some(AmbiguityReason::MultipleNonPlaying)
        );
        assert_eq!(
            unavailable_reason(&snapshot_from_candidates(
                vec![playing],
                Some(&identifier("org.mpris.MediaPlayer2.Missing")?)
            )),
            Some(RpcUnavailableReason::StrictPinLost)
        );
        Ok(())
    }

    #[test]
    fn metadata_mapping_preserves_only_real_supported_partial_values() -> Result<(), String> {
        let mut metadata = HashMap::new();
        metadata.insert(
            "xesam:title".to_owned(),
            owned(Value::from(" exact title ")).map_err(|error| error.to_string())?,
        );
        metadata.insert(
            "xesam:artist".to_owned(),
            owned(Value::from(vec![
                "",
                "first real creator",
                "ignored second",
            ]))
            .map_err(|error| error.to_string())?,
        );
        metadata.insert(
            "xesam:url".to_owned(),
            owned(Value::from("file:///private/item")).map_err(|error| error.to_string())?,
        );
        metadata.insert(
            "mpris:artUrl".to_owned(),
            owned(Value::from("https://example.invalid/cover.png"))
                .map_err(|error| error.to_string())?,
        );
        metadata.insert("mpris:length".to_owned(), (-1_i64).into());

        assert_eq!(
            metadata_string(&metadata, "xesam:title").as_deref(),
            Some(" exact title ")
        );
        assert_eq!(
            metadata_strings(&metadata, "xesam:artist")
                .and_then(|artists| artists.into_iter().find_map(non_empty))
                .as_deref(),
            Some("first real creator")
        );
        assert_eq!(metadata_http_url(&metadata, "xesam:url"), None);
        assert_eq!(
            metadata_i64(&metadata, "mpris:length").and_then(microseconds_to_milliseconds),
            None
        );
        assert_eq!(
            metadata_string(&metadata, "mpris:artUrl").as_deref(),
            Some("https://example.invalid/cover.png")
        );
        assert_eq!(MprisItem::default().to_rpc(None), None);
        Ok(())
    }

    #[tokio::test]
    #[ignore = "requires an explicit private dbus-run-session"]
    async fn private_bus_policy_covers_appearance_loss_pin_and_all_ambiguity_classes()
    -> Result<(), Box<dyn std::error::Error>> {
        private_bus()?;
        let observer = Connection::session().await?;

        assert_eq!(
            unavailable_reason(&snapshot_from_candidates(
                read_candidates(&observer).await?,
                None
            )),
            Some(RpcUnavailableReason::NoSource)
        );

        let first = fake_service(FIRST_NAME, FakePlayer::playing(), false, false).await?;
        let sole_playing = snapshot_from_candidates(read_candidates(&observer).await?, None);
        assert_eq!(
            available(&sole_playing).map(|snapshot| snapshot.selection_reason),
            Some(i32::from(RpcSelectionReason::SolePlaying))
        );

        let second = fake_service(SECOND_NAME, FakePlayer::playing(), false, false).await?;
        assert_eq!(
            ambiguity_reason(&snapshot_from_candidates(
                read_candidates(&observer).await?,
                None
            )),
            Some(AmbiguityReason::MultiplePlaying)
        );

        mutate_player(
            &second,
            |player| player.playback_status = "Paused".to_owned(),
            ChangedProperty::PlaybackStatus,
        )
        .await?;
        assert_eq!(
            available(&snapshot_from_candidates(
                read_candidates(&observer).await?,
                None
            ))
            .map(|snapshot| snapshot.selection_reason),
            Some(i32::from(RpcSelectionReason::SolePlaying))
        );

        mutate_player(
            &first,
            |player| player.playback_status = "Paused".to_owned(),
            ChangedProperty::PlaybackStatus,
        )
        .await?;
        assert_eq!(
            ambiguity_reason(&snapshot_from_candidates(
                read_candidates(&observer).await?,
                None
            )),
            Some(AmbiguityReason::MultipleNonPlaying)
        );

        drop(second);
        let sole_paused = snapshot_from_candidates(read_candidates(&observer).await?, None);
        assert_eq!(
            available(&sole_paused).map(|snapshot| snapshot.activity),
            Some(i32::from(RpcPlaybackActivity::Paused))
        );

        mutate_player(
            &first,
            |player| player.playback_status = "Stopped".to_owned(),
            ChangedProperty::PlaybackStatus,
        )
        .await?;
        let sole_stopped = snapshot_from_candidates(read_candidates(&observer).await?, None);
        assert_eq!(
            available(&sole_stopped).map(|snapshot| snapshot.activity),
            Some(i32::from(RpcPlaybackActivity::Stopped))
        );
        let second = fake_service(SECOND_NAME, FakePlayer::playing(), false, false).await?;
        assert_eq!(
            available(&snapshot_from_candidates(
                read_candidates(&observer).await?,
                Some(&identifier(FIRST_NAME)?)
            ))
            .map(|snapshot| (snapshot.selection_reason, snapshot.activity)),
            Some((
                i32::from(RpcSelectionReason::StrictPin),
                i32::from(RpcPlaybackActivity::Stopped),
            ))
        );

        drop(first);
        assert_eq!(
            unavailable_reason(&snapshot_from_candidates(
                read_candidates(&observer).await?,
                Some(&identifier(FIRST_NAME)?)
            )),
            Some(RpcUnavailableReason::StrictPinLost)
        );
        assert_eq!(
            available(&snapshot_from_candidates(
                read_candidates(&observer).await?,
                None
            ))
            .map(|snapshot| snapshot.selection_reason),
            Some(i32::from(RpcSelectionReason::SolePlaying))
        );
        drop(second);
        Ok(())
    }

    #[tokio::test]
    #[ignore = "requires an explicit private dbus-run-session"]
    async fn private_bus_signals_cover_play_pause_stop_seek_rate_metadata_and_owner_replacement()
    -> Result<(), Box<dyn std::error::Error>> {
        private_bus()?;
        let state = SnapshotState::with_native_collector(InstanceId::from_bytes([10_u8; 16]));
        let observer = Connection::session().await?;
        let task_state = state.clone();

        run_and_cancel(state.clone(), observer, async {
            let empty = wait_for_snapshot(&state, |snapshot| {
                unavailable_reason(snapshot) == Some(RpcUnavailableReason::NoSource)
            })
            .await?;
            let first = fake_service(FIRST_NAME, FakePlayer::playing(), true, false).await?;
            let initial = wait_for_snapshot(&state, |snapshot| {
                snapshot.revision > empty.revision
                    && available(snapshot).is_some_and(|available| {
                        available.activity == i32::from(RpcPlaybackActivity::Playing)
                            && available
                                .timeline
                                .as_ref()
                                .and_then(|timeline| timeline.position_milliseconds)
                                == Some(12_345)
                    })
            })
            .await?;
            let initial_revision = initial.revision;

            mutate_player(
                &first,
                |player| player.playback_status = "Paused".to_owned(),
                ChangedProperty::PlaybackStatus,
            )
            .await?;
            let paused = wait_for_snapshot(&state, |snapshot| {
                snapshot.revision > initial_revision
                    && available(snapshot).is_some_and(|available| {
                        available.activity == i32::from(RpcPlaybackActivity::Paused)
                    })
            })
            .await?;

            mutate_player(
                &first,
                |player| player.position = 44_000_000,
                ChangedProperty::Position,
            )
            .await?;
            let sought = wait_for_snapshot(&state, |snapshot| {
                snapshot.revision > paused.revision
                    && available(snapshot).is_some_and(|available| {
                        available
                            .timeline
                            .as_ref()
                            .and_then(|timeline| timeline.position_milliseconds)
                            == Some(44_000)
                    })
            })
            .await?;

            mutate_player(&first, |player| player.rate = 1.5, ChangedProperty::Rate).await?;
            let rate_observed =
                wait_for_snapshot(&state, |snapshot| snapshot.revision > sought.revision).await?;

            mutate_player(
                &first,
                |player| {
                    player.playback_status = "Stopped".to_owned();
                    player.title = None;
                    player.artists = None;
                    player.album = None;
                    player.url = Some("not a URL".to_owned());
                    player.art_url = Some("file:///private/not-read.png".to_owned());
                    player.length = Some(-1);
                    player.metadata_fails = false;
                },
                ChangedProperty::Metadata,
            )
            .await?;
            mutate_player(&first, |_| {}, ChangedProperty::PlaybackStatus).await?;
            let stopped = wait_for_snapshot(&state, |snapshot| {
                snapshot.revision > rate_observed.revision
                    && available(snapshot).is_some_and(|available| {
                        available.activity == i32::from(RpcPlaybackActivity::Stopped)
                            && available.item.as_ref().is_some_and(|item| {
                                item.title.is_none()
                                    && item.creator.is_none()
                                    && item.collection.is_none()
                                    && item.destination.is_none()
                                    && item.artwork.is_none()
                            })
                    })
            })
            .await?;

            let replacement = fake_service(
                FIRST_NAME,
                FakePlayer {
                    playback_status: "Paused".to_owned(),
                    title: Some("Replacement fake".to_owned()),
                    ..FakePlayer::stopped()
                },
                false,
                true,
            )
            .await?;
            let replaced = wait_for_snapshot(&state, |snapshot| {
                snapshot.revision > stopped.revision
                    && available(snapshot).is_some_and(|available| {
                        available.activity == i32::from(RpcPlaybackActivity::Paused)
                            && available
                                .item
                                .as_ref()
                                .and_then(|item| item.title.as_deref())
                                == Some("Replacement fake")
                    })
            })
            .await?;
            drop(replacement);
            let lost = wait_for_snapshot(&state, |snapshot| {
                snapshot.revision > replaced.revision
                    && unavailable_reason(snapshot) == Some(RpcUnavailableReason::NoSource)
            })
            .await?;
            assert!(lost.revision > replaced.revision);
            drop(first);
            Ok(())
        })
        .await?;
        assert!(task_state.read().await.revision > 0);
        Ok(())
    }

    #[tokio::test]
    #[ignore = "requires an explicit private dbus-run-session"]
    async fn private_bus_malformed_and_missing_properties_fail_closed_without_fabrication()
    -> Result<(), Box<dyn std::error::Error>> {
        private_bus()?;
        let observer = Connection::session().await?;
        let malformed = malformed_service("org.mpris.MediaPlayer2.PhrasicMalformed").await?;
        assert_eq!(read_candidates(&observer).await?.len(), 0);
        drop(malformed);

        let missing = fake_service(
            FIRST_NAME,
            FakePlayer {
                title: None,
                artists: None,
                album: None,
                url: Some("ftp://example.invalid/item".to_owned()),
                art_url: Some("file:///private/cover.png".to_owned()),
                length: Some(-1),
                position: -1,
                rate: f64::NAN,
                metadata_fails: true,
                ..FakePlayer::playing()
            },
            false,
            false,
        )
        .await?;
        let candidates = read_candidates(&observer).await?;
        let candidate = candidates
            .first()
            .ok_or("missing-property player was not retained")?;
        assert_eq!(candidate.item.title, None);
        assert_eq!(candidate.item.creator, None);
        assert_eq!(candidate.item.collection, None);
        assert_eq!(candidate.item.destination, None);
        assert_eq!(candidate.position_milliseconds, None);
        assert_eq!(candidate.duration_milliseconds, None);
        assert_eq!(
            candidate.item.native_identity.as_deref(),
            Some("org.mpris.MediaPlayer2.PhrasicFakeOne.identity")
        );
        let snapshot = snapshot_from_candidates(candidates, None);
        assert!(
            available(&snapshot)
                .and_then(|available| available.item.as_ref())
                .is_some_and(|item| item.artwork.is_none())
        );
        drop(missing);
        Ok(())
    }

    #[tokio::test]
    #[ignore = "requires an explicit private dbus-run-session"]
    async fn private_bus_full_generated_grpc_snapshot_mapping_is_exact()
    -> Result<(), Box<dyn std::error::Error>> {
        private_bus()?;
        let artwork_directory = tempfile::tempdir()?;
        let artwork_path = artwork_directory.path().join("cover.png");
        fs::write(&artwork_path, TEST_PNG)?;
        let artwork_url = url::Url::from_file_path(&artwork_path)
            .map_err(|()| "temporary artwork path was not representable")?
            .to_string();
        let fake = fake_service(
            FIRST_NAME,
            FakePlayer {
                art_url: Some(artwork_url),
                ..FakePlayer::playing()
            },
            false,
            false,
        )
        .await?;
        let instance_id = InstanceId::from_bytes([11_u8; 16]);
        let state = SnapshotState::with_native_collector(instance_id.clone());
        let observer = Connection::session().await?;
        let mut artwork_loader = ArtworkLoader::default();
        refresh(&state, None, &observer, &mut artwork_loader).await?;

        let service = LocalMediaService::new(state);
        let info = service
            .get_instance_info(Request::new(GetInstanceInfoRequest {}))
            .await?
            .into_inner();
        let snapshot = service
            .get_snapshot(Request::new(GetSnapshotRequest {
                expected_instance_id: info.instance_id.clone(),
            }))
            .await?
            .into_inner();
        let mapped = available(&snapshot).ok_or("missing generated available snapshot")?;
        let item = mapped
            .item
            .as_ref()
            .ok_or("missing generated playback item")?;
        let timeline = mapped
            .timeline
            .as_ref()
            .ok_or("missing generated timeline")?;

        assert_eq!(info.instance_id, instance_id.to_vec());
        assert_eq!(
            info.capability.map(|capability| capability.status),
            Some(i32::from(CapabilityStatus::Available))
        );
        assert_eq!(snapshot.revision, 1);
        assert_eq!(snapshot.poll_hint_milliseconds, POLL_HINT_MILLISECONDS);
        assert_eq!(mapped.activity, i32::from(RpcPlaybackActivity::Playing));
        assert_eq!(
            mapped.selection_reason,
            i32::from(RpcSelectionReason::SolePlaying)
        );
        assert_eq!(item.title.as_deref(), Some("Fake title"));
        assert_eq!(item.creator.as_deref(), Some("Fake creator"));
        assert_eq!(item.collection.as_deref(), Some("Fake collection"));
        assert_eq!(
            item.destination.as_deref(),
            Some("https://example.invalid/item")
        );
        assert_eq!(
            item.native_identity.as_deref(),
            Some("org.mpris.MediaPlayer2.PhrasicFakeOne.identity")
        );
        assert_eq!(
            item.artwork.as_ref().map(|artwork| artwork.format),
            Some(i32::from(phrasic_rpc::local::ArtworkFormat::Png))
        );
        assert_eq!(
            item.artwork.as_ref().map(|artwork| artwork.data.as_slice()),
            Some(TEST_PNG)
        );
        assert_eq!(timeline.position_milliseconds, Some(12_345));
        assert_eq!(timeline.duration_milliseconds, Some(180_123));
        drop(fake);
        Ok(())
    }

    #[tokio::test]
    #[ignore = "requires an explicit private dbus-run-session"]
    async fn private_bus_loss_cancellation_and_shutdown_are_bounded()
    -> Result<(), Box<dyn std::error::Error>> {
        private_bus()?;
        let state = SnapshotState::with_native_collector(InstanceId::from_bytes([12_u8; 16]));
        let connection = Connection::session().await?;
        let closing = connection.clone();
        let shutdown = CancellationToken::new();
        let task_state = state.clone();
        let task_shutdown = shutdown.clone();
        let task = tokio::spawn(async move {
            let result = drive_connection(&task_state, None, &task_shutdown, &connection).await;
            if result.is_err() {
                task_state.replace(native_session_unavailable()).await;
            }
            result
        });

        wait_for_snapshot(&state, |snapshot| {
            unavailable_reason(snapshot) == Some(RpcUnavailableReason::NoSource)
        })
        .await?;
        closing.close().await?;
        let result = timeout(Duration::from_secs(3), task).await??;
        assert!(result.is_err());
        let unavailable = state.read().await;
        assert_eq!(
            unavailable_reason(&unavailable),
            Some(RpcUnavailableReason::NativeSessionUnavailable)
        );

        let collector_state =
            SnapshotState::with_native_collector(InstanceId::from_bytes([13_u8; 16]));
        let collector_shutdown = CancellationToken::new();
        let collector = tokio::spawn(run(
            collector_state.clone(),
            None,
            collector_shutdown.clone(),
        ));
        wait_for_snapshot(&collector_state, |snapshot| snapshot.revision > 0).await?;
        collector_shutdown.cancel();
        timeout(Duration::from_secs(3), collector).await??;
        let stopped_revision = collector_state.read().await.revision;
        sleep(Duration::from_millis(50)).await;
        assert_eq!(collector_state.read().await.revision, stopped_revision);
        Ok(())
    }
}
