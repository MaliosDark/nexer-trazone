import fs from 'fs';
import path from 'path';
import anchor from '@project-serum/anchor';
import { getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import { program } from '../conectis.js';

export async function handler(req, res) {
  try {
    // 1. Validate input
    const { name, symbol, uri, amount } = req.body;
    if (!name || !symbol || !uri || !amount) {
      return res.status(400).json({ error: 'Missing required fields: name, symbol, uri, amount' });
    }
    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }
    // enforce symbol length <= 10
    if (symbol.length > 10) {
      return res.status(400).json({ error: 'Symbol must be at most 10 characters' });
    }

    // 2. Compute expiry (1 year from now)
    const expiry = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;

    // 3. Derive PDAs
    const [marketPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('market'), program.provider.wallet.publicKey.toBuffer()],
      program.programId
    );
    const [metadataPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        anchor.web3.MPL_TOKEN_METADATA_ID.toBuffer(),
        /* mintPubkey placeholder below */
      ],
      anchor.web3.MPL_TOKEN_METADATA_ID
    );

    // 4. Generate new mint keypair and its ATA
    const mintKeypair = anchor.web3.Keypair.generate();
    const mintPubkey  = mintKeypair.publicKey;
    const authority   = program.provider.wallet.publicKey;
    const connection  = program.provider.connection;

    // ensure metadata PDA uses actual mint
    const [realMetadataPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        anchor.web3.MPL_TOKEN_METADATA_ID.toBuffer(),
        mintPubkey.toBuffer(),
      ],
      anchor.web3.MPL_TOKEN_METADATA_ID
    );

    // 5. Create associated token account for authority
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,      // fee payer
      mintPubkey,
      authority       // owner
    );

    // 6. Build and send transaction
    const tx = await program.rpc.mintToken(
      name,
      symbol,
      uri,
      new anchor.BN(amount),
      new anchor.BN(expiry),
      {
        accounts: {
          market:               marketPda,
          authority:            authority,
          feeAccount:           authority,
          tokenMint:            mintPubkey,
          tokenAccount:         ata.address,
          tokenData:            anchor.web3.Keypair.generate().publicKey,
          mintReceiver:         authority,
          metadata:             realMetadataPda,
          tokenProgram:         anchor.web3.TOKEN_PROGRAM_ID,
          tokenMetadataProgram: anchor.web3.MPL_TOKEN_METADATA_ID,
          systemProgram:        anchor.web3.SystemProgram.programId,
          rent:                 anchor.web3.SYSVAR_RENT_PUBKEY,
          clock:                anchor.web3.SYSVAR_CLOCK_PUBKEY
        },
        signers: [mintKeypair]
      }
    );

    return res.json({
      success:     true,
      txId:        tx,
      mintAddress: mintPubkey.toBase58(),
      tokenAccount: ata.address.toBase58(),
      metadataPda: realMetadataPda.toBase58(),
      expiry,
    });
  } catch (err) {
    console.error('Mint handler error:', err);
    return res.status(500).json({ error: err.toString() });
  }
}
