
# Nexus Erebus Trade Zone

## Table of Contents

1. [Prerequisites](#prerequisites)  
2. [Installation & Build](#installation--build)  
3. [Configuration (`Anchor.toml`)](#configuration-anchortoml)  
4. [Deployment](#deployment)  
5. [Client Usage & Instructions](#client-usage--instructions)  
   1. [Initialize Market](#1-initialize-market)  
   2. [Mint Token](#2-mint-token)  
   3. [Place Order](#3-place-order)  
   4. [Cancel Order](#4-cancel-order)  
   5. [Buy Token](#5-buy-token)  
   6. [Swap Tokens](#6-swap-tokens)  
   7. [Get Market Data](#7-get-market-data)  
   8. [Unlist Expired Tokens](#8-unlist-expired-tokens)  
6. [Example Scripts](#example-scripts)  
7. [Testing](#testing)  
8. [License](#license)

---

## Prerequisites

- [Rust & `cargo`](https://www.rust-lang.org/tools/install)  
- [Solana Tool Suite](https://docs.solana.com/cli/install-solana-cli-tools) (`solana`, `anchor`)  
- Node.js ≥14 (if you build a JS client)  
- Anchor CLI (`cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked`)

---

## Installation & Build

1. Clone the repo:  
   ```bash
   git clone this repo
   cd nexus-erebus-trade-zone
```

2. Install Anchor dependencies & build:

   ```bash
   anchor build
   ````

---

## Configuration (`Anchor.toml`)

Edit `Anchor.toml` at project root:

```toml
[provider]
cluster = "devnet"
wallet = "~/.config/solana/id.json"

[programs.devnet]
nexus_erebus_trade_zone = "<your-deployed-program-ID>"

[registry]
url = "https://anchor.projectserum.com"

[scripts]
test = "mocha --config ./tests/mocha-config.json"
````

* **cluster**: `devnet` / `testnet` / `mainnet-beta`
* **wallet**: your local keypair
* **programs**: program ID for each cluster
* **upgrade authority**: ensure your deploy keypair is set as authority

---

## Deployment

1. Build & deploy to Devnet:

   ```bash
   anchor deploy --provider.cluster devnet
   ```

2. Verify on-chain:

   ```bash
   solana program show <your-program-ID> --cluster devnet
   ```

---

## Client Usage & Instructions

Once deployed, you can invoke each instruction via your client (JS/TS, Python, etc.) using Anchor-generated IDL.

### 1. Initialize Market

* **Instruction**: `initialize_market(feeAccount: Pubkey, feeRate: u64, maxPerAgent: u64)`
* **Creates**: A new `Market` account
* **Params**:

  * `feeAccount`: where you collect all fees
  * `feeRate`: basis points (e.g. `20` = 0.2%)
  * `maxPerAgent`: max distinct tokens each agent can mint

### 2. Mint Token

* **Instruction**: `mint_token(name: String, symbol: String, uri: String, amount: u64, expiry: i64)`
* **Creates**: New token mint & metadata
* **Per-agent limit** enforced
* **Fees**: charged on lamports collected
* **Expiry**: Unix timestamp to unlist automatically

### 3. Place Order

* **Instruction**: `place_order(side: Side, price: u64, amount: u64)`
* **Side**: `Buy` or `Sell`
* **Adds**: Order to the on-chain orderbook

### 4. Cancel Order

* **Instruction**: `cancel_order(orderId: u64)`
* **Removes**: Your own open order by ID

### 5. Buy Token

* **Instruction**: `buy_token(orderId: u64)`
* **Executes**: P2P purchase against a sell order
* **Charges**: Sale price + fee

### 6. Swap Tokens

* **Instruction**: `swap_tokens(price: u64, amount: u64)`
* **Performs**: Bi-directional swap (A⇄B) between two token accounts
* **Charges**: fee on trade value

### 7. Get Market Data

* **Instruction**: `get_market_data()`
* **Logs**: Current `token_list` & `order_book` to program log

### 8. Unlist Expired Tokens

* **Instruction**: `unlist_expired()`
* **Removes**: All tokens whose `expiry ≤ Clock::unix_timestamp`

---

## Example Scripts

You can use the Anchor CLI `anchor shell` or generate a TS client via:

```bash
anchor idl parse target/idl/nexus_erebus_trade_zone.json --out idl.ts
```

Then, in your JS/TS code:

```ts
import { Program, AnchorProvider, web3 } from "@project-serum/anchor";
import idl from "./idl.json";

const provider = AnchorProvider.env();
const program  = new Program(idl, "<PROGRAM_ID>", provider);

// Initialize
await program.rpc.initializeMarket(
  feeAccountPubkey,
  new BN(20),          // 0.2%
  new BN(5),           // 5 tokens per agent
  { accounts: { market, authority, feeAccount, systemProgram } }
);

// Mint
await program.rpc.mintToken(
  "MyToken", "MTK", "https://...", new BN(1000), new BN(1700000000),
  { accounts: { /* ... */ } }
);

// etc.
````

---

## Testing

* Write unit tests under `tests/` using Mocha + `@project-serum/anchor`
* Example:

  ```bash
  anchor test --skip-deploy
  ```
