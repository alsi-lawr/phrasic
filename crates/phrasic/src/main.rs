#![forbid(unsafe_code)]

#[cfg(not(any(
    all(
        target_arch = "x86_64",
        target_env = "gnu",
        target_os = "linux",
        target_vendor = "unknown"
    ),
    all(
        target_arch = "x86_64",
        target_env = "msvc",
        target_os = "windows",
        target_vendor = "pc"
    ),
)))]
compile_error!(
    "Phrasic Local Media supports x86-64 Linux GNU and Windows MSVC targets only; generic macOS and native ARM64 are unsupported."
);

#[cfg(any(
    all(
        target_arch = "x86_64",
        target_env = "gnu",
        target_os = "linux",
        target_vendor = "unknown"
    ),
    all(
        target_arch = "x86_64",
        target_env = "msvc",
        target_os = "windows",
        target_vendor = "pc"
    ),
))]
mod command;
#[cfg(all(
    target_arch = "x86_64",
    target_env = "gnu",
    target_os = "linux",
    target_vendor = "unknown"
))]
#[path = "platform/linux.rs"]
mod platform;
#[cfg(all(
    target_arch = "x86_64",
    target_env = "msvc",
    target_os = "windows",
    target_vendor = "pc"
))]
#[path = "platform/windows.rs"]
mod platform;

#[cfg(any(
    all(
        target_arch = "x86_64",
        target_env = "gnu",
        target_os = "linux",
        target_vendor = "unknown"
    ),
    all(
        target_arch = "x86_64",
        target_env = "msvc",
        target_os = "windows",
        target_vendor = "pc"
    ),
))]
fn main() -> std::process::ExitCode {
    command::main_entry()
}
