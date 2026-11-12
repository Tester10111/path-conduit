#!/bin/sh
# Cross-compile a portable Windows x64 exe (no installer) from Linux.
# Needs: rustup target x86_64-pc-windows-msvc, cargo-xwin, clang-cl, lld-link, llvm-ar.
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
export PATH="${LLVM_MINGW_BIN:-$HOME/llvm-mingw/bin}:$HOME/.cargo/bin:$PATH"
export CC_x86_64_pc_windows_msvc="${CC_x86_64_pc_windows_msvc:-clang-cl}"
export AR_x86_64_pc_windows_msvc="${AR_x86_64_pc_windows_msvc:-llvm-ar}"
export CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER="${CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER:-lld-link}"
python3 "$ROOT/scripts/build-html.py"
cargo xwin build --manifest-path "$ROOT/src-tauri/Cargo.toml" --release --target x86_64-pc-windows-msvc
mkdir -p "$ROOT/dist"
cp -f "$ROOT/src-tauri/target/x86_64-pc-windows-msvc/release/path-conduit.exe" "$ROOT/dist/PathConduit.exe"
echo "wrote $ROOT/dist/PathConduit.exe"
