use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use phrasic_core::{SourceIdentifier, SourceIdentifierError};

const ALLOWED_CONFIG_FIELDS: [&str; 4] =
    ["schema_version", "port", "source_pin", "browser_handoff"];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DiagnosticCode {
    InvalidArguments,
    ConfigReadFailed,
    ConfigInvalidUtf8,
    ConfigMalformedToml,
    ConfigUnknownField,
    ConfigInvalidSchemaVersion,
    ConfigInvalidPort,
    ConfigInvalidSourcePin,
    ConfigInvalidBrowserHandoff,
}

impl DiagnosticCode {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidArguments => "cli.invalid_arguments",
            Self::ConfigReadFailed => "config.read_failed",
            Self::ConfigInvalidUtf8 => "config.invalid_utf8",
            Self::ConfigMalformedToml => "config.malformed_toml",
            Self::ConfigUnknownField => "config.unknown_field",
            Self::ConfigInvalidSchemaVersion => "config.invalid_schema_version",
            Self::ConfigInvalidPort => "config.invalid_port",
            Self::ConfigInvalidSourcePin => "config.invalid_source_pin",
            Self::ConfigInvalidBrowserHandoff => "config.invalid_browser_handoff",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Diagnostic {
    code: DiagnosticCode,
}

impl Diagnostic {
    #[must_use]
    pub const fn new(code: DiagnosticCode) -> Self {
        Self { code }
    }

    #[must_use]
    pub const fn code(self) -> DiagnosticCode {
        self.code
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BrowserHandoff {
    Open,
    Print,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BrowserPort(u16);

impl BrowserPort {
    fn parse(value: i64) -> Result<Self, Diagnostic> {
        let converted =
            u16::try_from(value).map_err(|_| Diagnostic::new(DiagnosticCode::ConfigInvalidPort))?;

        if !(1024..=65535).contains(&converted) {
            return Err(Diagnostic::new(DiagnosticCode::ConfigInvalidPort));
        }

        Ok(Self(converted))
    }

    #[must_use]
    pub const fn get(self) -> u16 {
        self.0
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ServingConfiguration {
    port: BrowserPort,
    source_pin: Option<SourceIdentifier>,
    browser_handoff: BrowserHandoff,
}

impl ServingConfiguration {
    #[must_use]
    pub const fn port(&self) -> BrowserPort {
        self.port
    }

    #[must_use]
    pub const fn source_pin(&self) -> Option<&SourceIdentifier> {
        self.source_pin.as_ref()
    }

    #[must_use]
    pub const fn browser_handoff(&self) -> BrowserHandoff {
        self.browser_handoff
    }
}

pub fn parse_configuration(input: &[u8]) -> Result<ServingConfiguration, Diagnostic> {
    let utf8 = std::str::from_utf8(input)
        .map_err(|_| Diagnostic::new(DiagnosticCode::ConfigInvalidUtf8))?;
    let document = utf8
        .parse::<toml::Table>()
        .map_err(|_| Diagnostic::new(DiagnosticCode::ConfigMalformedToml))?;

    reject_unknown_fields(&document)?;

    let schema_version = required_integer(
        &document,
        "schema_version",
        DiagnosticCode::ConfigInvalidSchemaVersion,
    )?;
    if schema_version != 1 {
        return Err(Diagnostic::new(DiagnosticCode::ConfigInvalidSchemaVersion));
    }

    let port = required_integer(&document, "port", DiagnosticCode::ConfigInvalidPort)
        .and_then(BrowserPort::parse)?;
    let source_pin = optional_source_pin(&document)?;
    let browser_handoff = optional_browser_handoff(&document)?;

    Ok(ServingConfiguration {
        port,
        source_pin,
        browser_handoff,
    })
}

fn reject_unknown_fields(document: &toml::Table) -> Result<(), Diagnostic> {
    if document
        .keys()
        .any(|field| !ALLOWED_CONFIG_FIELDS.contains(&field.as_str()))
    {
        return Err(Diagnostic::new(DiagnosticCode::ConfigUnknownField));
    }

    Ok(())
}

fn required_integer(
    document: &toml::Table,
    field: &str,
    error_code: DiagnosticCode,
) -> Result<i64, Diagnostic> {
    document
        .get(field)
        .and_then(toml::Value::as_integer)
        .ok_or(Diagnostic::new(error_code))
}

fn optional_source_pin(document: &toml::Table) -> Result<Option<SourceIdentifier>, Diagnostic> {
    match document.get("source_pin") {
        None => Ok(None),
        Some(value) => value
            .as_str()
            .ok_or(Diagnostic::new(DiagnosticCode::ConfigInvalidSourcePin))
            .and_then(parse_source_pin)
            .map(Some),
    }
}

fn parse_source_pin(value: &str) -> Result<SourceIdentifier, Diagnostic> {
    SourceIdentifier::parse(value.to_owned()).map_err(map_source_identifier_error)
}

const fn map_source_identifier_error(error: SourceIdentifierError) -> Diagnostic {
    match error {
        SourceIdentifierError::Empty => Diagnostic::new(DiagnosticCode::ConfigInvalidSourcePin),
    }
}

fn optional_browser_handoff(document: &toml::Table) -> Result<BrowserHandoff, Diagnostic> {
    match document.get("browser_handoff") {
        None => Ok(BrowserHandoff::Open),
        Some(toml::Value::String(value)) if value == "open" => Ok(BrowserHandoff::Open),
        Some(toml::Value::String(value)) if value == "print" => Ok(BrowserHandoff::Print),
        Some(_) => Err(Diagnostic::new(DiagnosticCode::ConfigInvalidBrowserHandoff)),
    }
}

fn parse_arguments(arguments: &[OsString]) -> Result<PathBuf, Diagnostic> {
    match arguments {
        [_, command, configuration] if command == OsStr::new("serve") => {
            Ok(PathBuf::from(configuration))
        }
        _ => Err(Diagnostic::new(DiagnosticCode::InvalidArguments)),
    }
}

fn run_before_effects<ReadConfiguration, RunAdapter>(
    arguments: &[OsString],
    read_configuration: ReadConfiguration,
    run_adapter: RunAdapter,
) -> Result<(), Diagnostic>
where
    ReadConfiguration: FnOnce(&Path) -> Result<Vec<u8>, Diagnostic>,
    RunAdapter: FnOnce(&ServingConfiguration) -> Result<(), Diagnostic>,
{
    let configuration_path = parse_arguments(arguments)?;
    let configuration_bytes = read_configuration(&configuration_path)?;
    let configuration = parse_configuration(&configuration_bytes)?;
    run_adapter(&configuration)
}

pub fn main_entry() -> ExitCode {
    let arguments = std::env::args_os().collect::<Vec<_>>();
    let result = run_before_effects(
        &arguments,
        |configuration_path| {
            std::fs::read(configuration_path)
                .map_err(|_| Diagnostic::new(DiagnosticCode::ConfigReadFailed))
        },
        crate::platform::run_empty_adapter,
    );

    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(diagnostic) => {
            eprintln!("{}", diagnostic.code().as_str());
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;

    use super::*;

    fn args(values: &[&str]) -> Vec<OsString> {
        values.iter().map(OsString::from).collect()
    }

    fn code(
        result: Result<ServingConfiguration, Diagnostic>,
    ) -> Result<ServingConfiguration, DiagnosticCode> {
        result.map_err(Diagnostic::code)
    }

    #[test]
    fn strict_configuration_accepts_only_the_v1_schema() -> Result<(), String> {
        let default_handoff = parse_configuration(b"schema_version = 1\nport = 1024\n")
            .map_err(|diagnostic| diagnostic.code().as_str().to_owned())?;
        let explicit_values = parse_configuration(
            b"schema_version = 1\nport = 65535\nsource_pin = ' exact pin '\nbrowser_handoff = 'print'\n",
        )
        .map_err(|diagnostic| diagnostic.code().as_str().to_owned())?;

        assert_eq!(default_handoff.port().get(), 1024);
        assert_eq!(default_handoff.source_pin(), None);
        assert_eq!(default_handoff.browser_handoff(), BrowserHandoff::Open);
        assert_eq!(explicit_values.port().get(), 65535);
        assert_eq!(
            explicit_values.source_pin().map(SourceIdentifier::as_str),
            Some(" exact pin ")
        );
        assert_eq!(explicit_values.browser_handoff(), BrowserHandoff::Print);
        Ok(())
    }

    #[test]
    fn strict_configuration_rejects_every_invalid_field_class() {
        let cases = [
            (
                b"port = 1024\n".as_slice(),
                DiagnosticCode::ConfigInvalidSchemaVersion,
            ),
            (
                b"schema_version = 1\n".as_slice(),
                DiagnosticCode::ConfigInvalidPort,
            ),
            (
                b"schema_version = 1\nport = 1023\n".as_slice(),
                DiagnosticCode::ConfigInvalidPort,
            ),
            (
                b"schema_version = 1\nport = 65536\n".as_slice(),
                DiagnosticCode::ConfigInvalidPort,
            ),
            (
                b"schema_version = 1\nport = 1.5\n".as_slice(),
                DiagnosticCode::ConfigInvalidPort,
            ),
            (
                b"schema_version = 1\nport = '1024'\n".as_slice(),
                DiagnosticCode::ConfigInvalidPort,
            ),
            (
                b"schema_version = 2\nport = 1024\n".as_slice(),
                DiagnosticCode::ConfigInvalidSchemaVersion,
            ),
            (
                b"schema_version = '1'\nport = 1024\n".as_slice(),
                DiagnosticCode::ConfigInvalidSchemaVersion,
            ),
            (
                b"schema_version = 1\nport = 1024\nsource_pin = ''\n".as_slice(),
                DiagnosticCode::ConfigInvalidSourcePin,
            ),
            (
                b"schema_version = 1\nport = 1024\nsource_pin = 7\n".as_slice(),
                DiagnosticCode::ConfigInvalidSourcePin,
            ),
            (
                b"schema_version = 1\nport = 1024\nbrowser_handoff = 'other'\n".as_slice(),
                DiagnosticCode::ConfigInvalidBrowserHandoff,
            ),
            (
                b"schema_version = 1\nport = 1024\nbrowser_handoff = true\n".as_slice(),
                DiagnosticCode::ConfigInvalidBrowserHandoff,
            ),
            (
                b"schema_version = 1\nport = 1024\nunknown = true\n".as_slice(),
                DiagnosticCode::ConfigUnknownField,
            ),
            (
                b"schema_version = 1\nschema_version = 1\nport = 1024\n".as_slice(),
                DiagnosticCode::ConfigMalformedToml,
            ),
            (
                b"schema_version = 1\nport = 1024\nunknown = 1\nunknown = 2\n".as_slice(),
                DiagnosticCode::ConfigMalformedToml,
            ),
            (
                b"schema_version = 1\nport = \n".as_slice(),
                DiagnosticCode::ConfigMalformedToml,
            ),
            (&[0xff, 0xfe], DiagnosticCode::ConfigInvalidUtf8),
        ];

        for (input, expected) in cases {
            assert_eq!(code(parse_configuration(input)), Err(expected));
        }
    }

    #[test]
    fn strict_configuration_rejects_every_forbidden_concern() {
        let forbidden_fields = [
            "pairing",
            "session",
            "cookie",
            "playback",
            "history",
            "artwork_url",
            "spotify",
            "bind_address",
            "platform",
            "backend",
            "native_endpoint",
        ];

        for field in forbidden_fields {
            let configuration = format!("schema_version = 1\nport = 1024\n{field} = 'forbidden'\n");

            assert_eq!(
                code(parse_configuration(configuration.as_bytes())),
                Err(DiagnosticCode::ConfigUnknownField)
            );
        }
    }

    #[test]
    fn cli_accepts_only_serve_with_one_configuration_argument() {
        let cases = [
            args(&["phrasic"]),
            args(&["phrasic", "serve"]),
            args(&["phrasic", "status", "config.toml"]),
            args(&["phrasic", "serve", "config.toml", "extra"]),
        ];

        for arguments in cases {
            assert_eq!(
                parse_arguments(&arguments).map_err(Diagnostic::code),
                Err(DiagnosticCode::InvalidArguments)
            );
        }

        assert_eq!(
            parse_arguments(&args(&["phrasic", "serve", "config.toml"])),
            Ok(PathBuf::from("config.toml"))
        );
    }

    #[test]
    fn configuration_errors_happen_before_the_empty_adapter_boundary() {
        let effects = Cell::new(0_u8);
        let invalid = run_before_effects(
            &args(&["phrasic", "serve", "config.toml"]),
            |_| Ok(b"schema_version = 1\nport = 1\n".to_vec()),
            |_| {
                effects.set(effects.get() + 1);
                Ok(())
            },
        );

        assert_eq!(
            invalid.map_err(Diagnostic::code),
            Err(DiagnosticCode::ConfigInvalidPort)
        );
        assert_eq!(effects.get(), 0);
    }

    #[test]
    fn valid_configuration_reaches_the_empty_adapter_boundary() {
        let effects = Cell::new(0_u8);
        let result = run_before_effects(
            &args(&["phrasic", "serve", "config.toml"]),
            |_| Ok(b"schema_version = 1\nport = 8080\n".to_vec()),
            |_| {
                effects.set(effects.get() + 1);
                Ok(())
            },
        );

        assert_eq!(result, Ok(()));
        assert_eq!(effects.get(), 1);
    }

    #[test]
    fn diagnostics_are_stable_codes_without_configuration_values() {
        let diagnostics = [
            DiagnosticCode::InvalidArguments,
            DiagnosticCode::ConfigReadFailed,
            DiagnosticCode::ConfigInvalidUtf8,
            DiagnosticCode::ConfigMalformedToml,
            DiagnosticCode::ConfigUnknownField,
            DiagnosticCode::ConfigInvalidSchemaVersion,
            DiagnosticCode::ConfigInvalidPort,
            DiagnosticCode::ConfigInvalidSourcePin,
            DiagnosticCode::ConfigInvalidBrowserHandoff,
        ];

        for diagnostic in diagnostics {
            assert!(diagnostic.as_str().contains('.'));
            assert!(!diagnostic.as_str().contains('\n'));
        }
    }

    #[cfg(all(
        target_arch = "x86_64",
        target_env = "gnu",
        target_os = "linux",
        target_vendor = "unknown"
    ))]
    #[test]
    fn linux_build_compiles_only_the_linux_empty_adapter() {
        assert_eq!(crate::platform::MODULE_MARKER, *b"linux-empty-adapter");
    }

    #[cfg(all(
        target_arch = "x86_64",
        target_env = "msvc",
        target_os = "windows",
        target_vendor = "pc"
    ))]
    #[test]
    fn windows_build_compiles_only_the_windows_empty_adapter() {
        assert_eq!(crate::platform::MODULE_MARKER, *b"windows-empty-adapter");
    }
}
