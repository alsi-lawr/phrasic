# Overlay Build Measurements

The overlay keeps one authored Tailwind stylesheet, the bundled Geist font, the
approved Spotify artwork, and the same accessible Spotify and Fake entry
graphs. Run the Bun browser-build measurement commands in
[`browser-platform-measurements.md`](browser-platform-measurements.md) to
regenerate the current production inventory.

The build emits independent hashed module workers for Spotify and Fake. Their
URLs are generated from the build output rather than injected from the build
environment, preserving the worker lifecycle without exposing configuration or
credentials to browser artifacts.
