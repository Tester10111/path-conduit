# Path Conduit

A small offline tool that reads a Fluke / LinkWare XML export and groups results by Path-Conduit and A0X. It is a sticky-note sized desktop app for Windows, and a single HTML file you can open in Edge.

Nothing is saved. Closing clears everything. Files, checkmarks, and the seen-record list live in memory only for the current session. There is no localStorage, no IndexedDB, and no app data left behind. A CSV or print happens only when you ask for it.

## Download and run (Windows)

1. Get `PathConduit.exe` from [Releases](../../releases). It is a portable program. No installer and no admin rights.
2. Double-click it. Windows may show a SmartScreen prompt because the build is unsigned. Choose **More info**, then **Run anyway**.
3. The app uses the WebView2 runtime that ships with Windows 10/11. If an older PC is missing it, install the [Evergreen WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).

Or skip the exe and open `PathConduit.html` in Microsoft Edge. It works offline. Nothing is written to the browser profile either; close the tab and the session is gone.

### Daily use

Drop a Fluke XML, or use **Open**. Path-Conduit and A0X are parsed from each `CableID`. Check off A0X items as you go.

Records often arrive in batches (for example 300 in the morning, the rest later). Keep the app open and drop the full file when it is ready. New rows get a **New** badge, a summary chip such as **New since 6:02 AM: 200**, and a **Show new only** filter. Checkmarks you already made stay. **Mark all as seen** clears the new state. **Clear** forgets the file, the checks, and the seen list for this session.

Record identity is `CableID` plus `DateTime`. `CableID` alone is not unique when a cable is retested. Path, conduit, and A0X are not separate XML fields; they come from the `CableID` pattern `-P{path}-{conduit}.{A0X}_`.

## Privacy

- Fully offline. The app does not make network requests.
- No accounts, telemetry, or analytics.
- No persistence. Closing the window or the browser tab clears the file, checkmarks, and seen-record history.
- The Windows app uses an ephemeral WebView2 data directory and deletes it on exit.
- User-started CSV download or print is the only way anything is written.

## Build from source

You need Rust (stable), [Tauri CLI v2](https://v2.tauri.app/), and, to cross-compile a Windows exe from Linux, [`cargo-xwin`](https://github.com/rust-cross/cargo-xwin).

```bash
# frontend (also used by the exe)
python3 scripts/build-html.py

# tests (synthetic fixtures only)
npm install linkedom
node tests/run.mjs
node tests/no-storage.mjs

# Windows x64 portable exe from Linux
rustup target add x86_64-pc-windows-msvc
cargo xwin build --manifest-path src-tauri/Cargo.toml --release --target x86_64-pc-windows-msvc
# the portable exe is
#   src-tauri/target/x86_64-pc-windows-msvc/release/path-conduit.exe
```

On a Windows machine you can instead run `cargo tauri build --no-bundle` and take the exe from `src-tauri/target/release/`.

Fonts are [Figtree](https://github.com/erikdkennedy/figtree) and [Geist](https://github.com/vercel/geist-font), both SIL Open Font License 1.1. License texts are in `src/fonts/`. This project is MIT, copyright Bao Do 2026.

## Tests

`tests/fixtures/` holds a synthetic 300-record morning file and a 500-record full file with fake `DEMO-` CableIDs. The suite checks that loading 300 and then 500 reports exactly 200 new records, with those identities, and that no storage APIs appear in source or at runtime.
