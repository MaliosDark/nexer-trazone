import anchor from '@project-serum/anchor';
import { program } from '../conectis.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';

export async function handler(req, res) {
  try {
    // 1. Validate input
    const { price, amount, walletA, walletB } = req.body;
    if (
      typeof price !== 'number' ||
      typeof amount !== 'number' ||
      typeof walletA !== 'string' ||
      typeof walletB !== 'string'
    ) {
      return res.status(400).json({
        error:
          'Invalid parameters: require price:number, amount:number, walletA:string, walletB:string',
      });
    }

    const connection = program.provider.connection;
    const authority  = program.provider.wallet.publicKey;

    // 2. Derive market PDA
    const [marketPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('market'), authority.toBuffer()],
      program.programId
    );

    // 3. Determine token mints for A and B from market state
    const marketAccount = await program.account.market.fetch(marketPda);

    // Here we assume walletA holds tokenA and walletB holds tokenB.
    // You may need to pass tokenA and tokenB mints explicitly if they differ.
    const tokenMintA = marketAccount.tokenList[0].mint; // example: first listed mint
    const tokenMintB = marketAccount.tokenList[1].mint; // example: second listed mint

    // 4. Derive associated token accounts
    const user1 = new anchor.web3.PublicKey(walletA);
    const user2 = new anchor.web3.PublicKey(walletB);

    const user1TokenA = await getAssociatedTokenAddress(tokenMintA, user1);
    const user2TokenA = await getAssociatedTokenAddress(tokenMintA, user2);
    const user1TokenB = await getAssociatedTokenAddress(tokenMintB, user1);
    const user2TokenB = await getAssociatedTokenAddress(tokenMintB, user2);

    // 5. Perform the swapTokens instruction
    const tx = await program.rpc.swapTokens(
      new anchor.BN(price),
      new anchor.BN(amount),
      {
        accounts: {
          market:        marketPda,
          user1:         user1,
          user2:         user2,
          user1TokenA:   user1TokenA,
          user2TokenA:   user2TokenA,
          user1TokenB:   user1TokenB,
          user2TokenB:   user2TokenB,
          feeAccount:    authority,
          tokenProgram:  anchor.web3.TOKEN_PROGRAM_ID,
        },
      }
    );

    // 6. Return result
    return res.json({
      success:      true,
      txId:         tx,
      price,
      amount,
      user1:        user1.toBase58(),
      user2:        user2.toBase58(),
      user1TokenA:  user1TokenA.toBase58(),
      user2TokenA:  user2TokenA.toBase58(),
      user1TokenB:  user1TokenB.toBase58(),
      user2TokenB:  user2TokenB.toBase58(),
    });
  } catch (err) {
    console.error('Swap handler error:', err);
    return res.status(500).json({ error: err.toString() });
  }
}
