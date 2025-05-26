import { expect } from 'chai';
import anchor from '@project-serum/anchor';
import fs from 'fs';
import path from 'path';

describe('nexus-erebus-trade-zone', () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load the IDL.
  const idl = JSON.parse(
    fs.readFileSync(path.resolve('./idl/nexus_erebus_trade_zone.json'), 'utf8')
  );
  // Instantiate the program client.
  const program = new anchor.Program(idl, process.env.PROGRAM_ID, provider);

  let marketPda;
  let mintKeypair;
  let tokenAccountPda;

  it('initializes the market', async () => {
    // Derive the market PDA.
    [marketPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('market'), provider.wallet.publicKey.toBuffer()],
      program.programId
    );

    // Call initialize_market.
    await program.rpc.initializeMarket(
      provider.wallet.publicKey,         // fee_account
      new anchor.BN(20),                 // fee_rate (0.2%)
      new anchor.BN(5),                  // max_tokens_per_agent
      {
        accounts: {
          market:        marketPda,
          authority:     provider.wallet.publicKey,
          feeAccount:    provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
      }
    );

    // Fetch and verify.
    const market = await program.account.market.fetch(marketPda);
    expect(market.feeRate.toNumber()).to.equal(20);
    expect(market.maxTokensPerAgent.toNumber()).to.equal(5);
    expect(market.tokenCount.toNumber()).to.equal(0);
    expect(market.orderCount.toNumber()).to.equal(0);
  });

  it('mints a new token', async () => {
    // Prepare mintKeypair and derive tokenData & metadata PDAs.
    mintKeypair = anchor.web3.Keypair.generate();

    // Derive tokenData PDA
    const [tokenDataPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('token_data'), mintKeypair.publicKey.toBuffer()],
      program.programId
    );

    // Derive metadata PDA
    const [metadataPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        anchor.web3.MPL_TOKEN_METADATA_ID.toBuffer(),
        mintKeypair.publicKey.toBuffer()
      ],
      anchor.web3.MPL_TOKEN_METADATA_ID
    );

    // Compute expiry = now + 1 day
    const expiry = Math.floor(Date.now() / 1000) + 24 * 60 * 60;

    // Call mint_token
    const tx = await program.rpc.mintToken(
      "TestToken",                       // name
      "TTK",                             // symbol
      "https://example.com/metadata.json", // uri
      new anchor.BN(100),                // amount
      new anchor.BN(expiry),             // expiry
      {
        accounts: {
          market:               marketPda,
          authority:            provider.wallet.publicKey,
          feeAccount:           provider.wallet.publicKey,
          tokenMint:            mintKeypair.publicKey,
          tokenAccount:         provider.wallet.publicKey,  // use wallet ATA
          tokenData:            tokenDataPda,
          mintReceiver:         provider.wallet.publicKey,
          metadata:             metadataPda,
          tokenProgram:         anchor.web3.TOKEN_PROGRAM_ID,
          tokenMetadataProgram: anchor.web3.MPL_TOKEN_METADATA_ID,
          systemProgram:        anchor.web3.SystemProgram.programId,
          rent:                 anchor.web3.SYSVAR_RENT_PUBKEY,
          clock:                anchor.web3.SYSVAR_CLOCK_PUBKEY,
        },
        signers: [mintKeypair],
      }
    );

    expect(tx).to.be.a('string');

    // Fetch market and verify tokenCount and tokenList entry
    const market = await program.account.market.fetch(marketPda);
    expect(market.tokenCount.toNumber()).to.equal(1);
    const tokenMeta = market.tokenList[0];
    expect(tokenMeta.name).to.equal("TestToken");
    expect(tokenMeta.creator.toBase58()).to.equal(provider.wallet.publicKey.toBase58());
  });

  it('places a sell order', async () => {
    // Place a Sell order for the newly minted token (id 0)
    const side = { buy: false, sell: true }; // or use enum mapping
    const price = 10;
    const amount = 50;

    const tx = await program.rpc.placeOrder(
      side,
      new anchor.BN(price),
      new anchor.BN(amount),
      {
        accounts: {
          market: marketPda,
          user:   provider.wallet.publicKey,
          tokenMint: mintKeypair.publicKey,
        },
      }
    );

    expect(tx).to.be.a('string');

    // Verify orderBook length
    const market = await program.account.market.fetch(marketPda);
    expect(market.orderCount.toNumber()).to.equal(1);
    const order = market.orderBook[0];
    expect(order.owner.toBase58()).to.equal(provider.wallet.publicKey.toBase58());
    expect(order.price.toNumber()).to.equal(price);
  });

  it('buys from a sell order', async () => {
    // Create a second wallet for buyer
    const buyerKeypair = anchor.web3.Keypair.generate();
    // Airdrop lamports
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(buyerKeypair.publicKey, 1e9),
      "confirmed"
    );

    // Derive associated token accounts
    const { getAssociatedTokenAddress } = require('@solana/spl-token');
    const sellerTokenAccount = await getAssociatedTokenAddress(mintKeypair.publicKey, provider.wallet.publicKey);
    const buyerTokenAccount = await getAssociatedTokenAddress(mintKeypair.publicKey, buyerKeypair.publicKey);

    // Execute buyToken (orderId = 0)
    const tx = await program.rpc.buyToken(
      new anchor.BN(0),
      {
        accounts: {
          market:              marketPda,
          buyer:               buyerKeypair.publicKey,
          seller:              provider.wallet.publicKey,
          buyerTokenAccount:   buyerTokenAccount,
          sellerTokenAccount:  sellerTokenAccount,
          feeAccount:          provider.wallet.publicKey,
          tokenMint:           mintKeypair.publicKey,
          tokenProgram:        anchor.web3.TOKEN_PROGRAM_ID,
        },
        signers: [buyerKeypair]
      }
    );
    expect(tx).to.be.a('string');
  });

  it('swaps tokens between two parties', async () => {
    // For brevity, assume two mints exist at indices 0 & 1
    const tokenMintA = mintKeypair.publicKey;
    const tokenMintB = mintKeypair.publicKey; // use second mint if available

    const userA = program.provider.wallet.publicKey;
    const userB = anchor.web3.Keypair.generate().publicKey;

    const { getAssociatedTokenAddress } = require('@solana/spl-token');
    const userATokenA = await getAssociatedTokenAddress(tokenMintA, userA);
    const userBTokenB = await getAssociatedTokenAddress(tokenMintB, userB);
    const userATokenB = await getAssociatedTokenAddress(tokenMintB, userA);
    const userBTokenA = await getAssociatedTokenAddress(tokenMintA, userB);

    const price = 5;
    const amount = 10;

    const tx = await program.rpc.swapTokens(
      new anchor.BN(price),
      new anchor.BN(amount),
      {
        accounts: {
          market:        marketPda,
          user1:         userA,
          user2:         userB,
          user1TokenA:   userATokenA,
          user2TokenA:   userBTokenA,
          user1TokenB:   userATokenB,
          user2TokenB:   userBTokenB,
          feeAccount:    provider.wallet.publicKey,
          tokenProgram:  anchor.web3.TOKEN_PROGRAM_ID,
        },
      }
    );
    expect(tx).to.be.a('string');
  });

  it('unlists expired/inactive tokens', async () => {
    const tx = await program.rpc.unlistExpired({
      accounts: {
        market: marketPda,
        clock:  anchor.web3.SYSVAR_CLOCK_PUBKEY,
      },
    });
    expect(tx).to.be.a('string');
  });
});
