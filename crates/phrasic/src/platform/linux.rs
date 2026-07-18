use crate::command::{Diagnostic, ServingConfiguration};

#[used]
pub(super) static MODULE_MARKER: [u8; 19] = *b"linux-empty-adapter";

pub(super) fn run_empty_adapter(configuration: &ServingConfiguration) -> Result<(), Diagnostic> {
    let _ = (
        configuration.port().get(),
        configuration.source_pin(),
        configuration.browser_handoff(),
    );
    // Keeps the matching adapter marker inspectable in a release binary.
    let _ = std::hint::black_box(MODULE_MARKER);
    let _ = phrasic_rpc::boundary();
    Ok(())
}
