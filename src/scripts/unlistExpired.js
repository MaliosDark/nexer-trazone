/**
 * unlistExpired.js
 * 
 * Script to prune inactive listings from the Nexus Erebus Trade Zone.
 * Usage: `node src/scripts/unlistExpired.js`
 */

import fs from 'fs';
import path from 'path';
import { Connection, Keypair, PublicKey, SYSVAR_CLOCK_PUBKEY, SystemProgram } from '@solana/web3.js';
import anchor from '@project-serum/anchor';
import dotenv from 'dotenv';
import chalk from 'chalk';

// Load environment
dotenv.config();
const { RPC_URL, KEYPAIR_PATH, PROGRAM_ID } = process.env;

// Validate env variables
if (!RPC_URL || !KEYPAIR_PATH || !PROGRAM_ID) {
  console.error(chalk.red('Error: RPC_URL, KEYPAIR_PATH, and PROGRAM_ID must be set in .env'));
  process.exit(1);
}

// Load keypair
let keypair;
try {
  const secret = JSON.parse(fs.readFileSync(path.resolve(KEYPAIR_PATH), 'utf8'));
  keypair = Keypair.fromSecretKey(Buffer.from(secret));
} catch (err) {
  console.error(chalk.red(`Failed to load keypair from ${KEYPAIR_PATH}: ${err.message}`));
  process.exit(1);
}

// Setup connection & provider
const connection = new Connection(RPC_URL, 'confirmed');
const wallet     = new anchor.Wallet(keypair);
const provider   = new anchor.AnchorProvider(connection, wallet, {
  preflightCommitment: 'confirmed',
  commitment: 'confirmed',
});
anchor.setProvider(provider);

// Load IDL
let idl;
try {
  idl = JSON.parse(fs.readFileSync(path.resolve('./idl/nexus_erebus_trade_zone.json'), 'utf8'));
} catch (err) {
  console.error(chalk.red('Failed to load IDL at ./idl/nexus_erebus_trade_zone.json'), err.message);
  process.exit(1);
}

// Instantiate program client
const program = new anchor.Program(idl, PROGRAM_ID, provider);

// Helper to derive PDA
function deriveMarketPDA(authorityPubkey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('market'), authorityPubkey.toBuffer()],
    program.programId
  )[0];
}

(async () => {
  console.log(chalk.blue('Starting unlistExpired script...'));

  try {
    // Derive market PDA
    const authority = provider.wallet.publicKey;
    const marketPda = deriveMarketPDA(authority);

    console.log(`Derived market PDA: ${marketPda.toBase58()}`);

    // Optionally fetch market account to check state
    const marketAcc = await program.account.market.fetch(marketPda);
    console.log(chalk.green(`Market loaded: tokenCount=${marketAcc.tokenCount.toString()}, orderCount=${marketAcc.orderCount.toString()}`));

    // Call unlist_expired instruction
    const tx = await program.rpc.unlistExpired({
      accounts: {
        market: marketPda,
        clock:  SYSVAR_CLOCK_PUBKEY,
        systemProgram: SystemProgram.programId,
      },
      options: {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      }
    });

    console.log(chalk.green('unlistExpired tx signature:'), chalk.yellow(tx));
  } catch (err) {
    console.error(chalk.red('Error running unlistExpired:'), err);
    process.exit(1);
  }
})();
