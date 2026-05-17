#!/usr/bin/env bash
set -e

# Install Rust if cargo is not in PATH
if ! command -v cargo &> /dev/null; then
    echo "Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    export PATH="$HOME/.cargo/bin:$PATH"
fi

cd worker-rs

# Install worker-build if not present
if ! command -v worker-build &> /dev/null; then
    echo "Installing worker-build..."
    cargo install -q worker-build
fi

echo "Building Worker..."
worker-build --release
