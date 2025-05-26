#!/usr/bin/env bash
set -euo pipefail

##
##  deploy_devnet.sh
##  Usage: ./scripts/deploy_devnet.sh
##

# 1) Ensure we’re in the project root
cd "$(dirname "$0")/.."

# 2) Generate a fresh keypair
mkdir -p target/deploy
KEYPAIR="target/deploy/nexus_erebus_trade_zone-keypair.json"
solana-keygen new \
  --outfile "$KEYPAIR" \
  --no-bip39-passphrase \
  --silent

PROGRAM_ID=$(solana-keygen pubkey "$KEYPAIR")
echo
echo "🔑 Generated program keypair → $KEYPAIR"
echo "🔑 Program ID: $PROGRAM_ID"
echo

# 3) Patch your Rust declare_id!()
#    (assumes your lib is in programs/nexus_erebus_trade_zone/src/lib.rs)
sed -i -E "s|declare_id!\(\"[^\"]+\"\);|declare_id!(\"$PROGRAM_ID\");|" \
  programs/nexus_erebus_trade_zone/src/lib.rs
echo "✏️  Updated declare_id!() in Rust to $PROGRAM_ID"

# 4) Patch Anchor.toml
sed -i -E "s|^NexusErebusTradeZone = \".*\"|NexusErebusTradeZone = \"$PROGRAM_ID\"|" Anchor.toml
echo "✏️  Updated Anchor.toml [programs.devnet] to $PROGRAM_ID"

# 5) Fix Cargo.toml edition to 2021 (Anchor won’t build 2025)
sed -i -E "s|^edition = \".*\"|edition = \"2021\"|" Cargo.toml
echo "✏️  Set Cargo.toml edition to 2021"

# 6) Build
echo
echo "🔨 Building Anchor program…"
anchor build

# 7) Configure Solana CLI
solana config set --url https://api.devnet.solana.com >/dev/null
solana config set --keypair ~/.config/solana/id.json >/dev/null
echo "⚙️  Solana CLI set to Devnet + your default keypair"

# 8) Deploy
echo
echo "📡 Deploying to Devnet…"
anchor deploy --provider.cluster devnet

# 9) Final verify
echo
echo "✅ Deployed! Final program ID is: $PROGRAM_ID"
echo
echo "You can now interact with your program at Devnet address:"
echo "    $PROGRAM_ID"
