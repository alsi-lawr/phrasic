#![forbid(unsafe_code)]

use std::fs;
use std::path::PathBuf;
use std::process::{Command, ExitStatus};

fn fixture_path(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!("phrasic-t005-{name}-{}", std::process::id()))
}

fn run(arguments: &[&str]) -> Result<(ExitStatus, String, String), std::io::Error> {
    let output = Command::new(env!("CARGO_BIN_EXE_phrasic"))
        .args(arguments)
        .output()?;
    Ok((
        output.status,
        String::from_utf8_lossy(&output.stdout).into_owned(),
        String::from_utf8_lossy(&output.stderr).into_owned(),
    ))
}

#[test]
fn valid_serve_configures_the_empty_adapter_without_output()
-> Result<(), Box<dyn std::error::Error>> {
    let path = fixture_path("valid.toml");
    fs::write(&path, "schema_version = 1\nport = 8080\n")?;
    let path_argument = path.to_string_lossy().into_owned();
    let result = run(&["serve", &path_argument]);
    fs::remove_file(&path)?;
    let (status, stdout, stderr) = result?;

    assert!(status.success());
    assert_eq!(stdout, "");
    assert_eq!(stderr, "");
    Ok(())
}

#[test]
fn browser_handoff_configuration_has_no_effect_in_the_foundation()
-> Result<(), Box<dyn std::error::Error>> {
    let path = fixture_path("print-handoff.toml");
    fs::write(
        &path,
        "schema_version = 1\nport = 8080\nbrowser_handoff = 'print'\n",
    )?;
    let path_argument = path.to_string_lossy().into_owned();
    let result = run(&["serve", &path_argument]);
    fs::remove_file(&path)?;
    let (status, stdout, stderr) = result?;

    assert!(status.success());
    assert_eq!(stdout, "");
    assert_eq!(stderr, "");
    Ok(())
}

#[test]
fn invalid_configuration_diagnostic_is_redacted() -> Result<(), Box<dyn std::error::Error>> {
    let path = fixture_path("secret-path-value.toml");
    let secret = "secret-config-value";
    fs::write(
        &path,
        format!("schema_version = 1\nport = 8080\nunknown = '{secret}'\n"),
    )?;
    let path_argument = path.to_string_lossy().into_owned();
    let result = run(&["serve", &path_argument]);
    fs::remove_file(&path)?;
    let (status, stdout, stderr) = result?;

    assert!(!status.success());
    assert_eq!(stdout, "");
    assert_eq!(stderr, "config.unknown_field\n");
    assert!(!stderr.contains(secret));
    assert!(!stderr.contains(&path_argument));
    Ok(())
}

#[test]
fn unsupported_cli_routes_have_one_redacted_failure_shape() -> Result<(), Box<dyn std::error::Error>>
{
    let (status, stdout, stderr) = run(&["status", "config-with-secret.toml"])?;

    assert!(!status.success());
    assert_eq!(stdout, "");
    assert_eq!(stderr, "cli.invalid_arguments\n");
    assert!(!stderr.contains("config-with-secret.toml"));
    Ok(())
}
