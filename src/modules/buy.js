import anchor from '@project-serum/anchor';
import { program } from '../conectis.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';

export async function handler(req, res) {
  try {
    // 1. Validate input
    const { orderId } = req.body;
    if (typeof orderId !== 'number') {
      return res.status(400).json({ error: 'orderId must be a number' });
    }

    const connection = program.provider.connection;
    const authority = program.provider.wallet.publicKey;

    // 2. Derive market PDA and fetch its account
    const [marketPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('market'), authority.toBuffer()],
      program.programId
    );
    const marketAccount = await program.account.market.fetch(marketPda);

    // 3. Locate the specified sell order in the on-chain orderbook
    const order = marketAccount.orderBook.find(o => o.id.toNumber() === orderId && o.side === 'Sell');
    if (!order) {
      return res.status(404).json({ error: 'Sell order not found for given ID' });
    }

    // 4. Derive or create associated token accounts for buyer & seller
    const tokenMint = order.token;
    const seller = order.owner;
    const buyer  = authority;

    const sellerTokenAccount = await getAssociatedTokenAddress(tokenMint, seller);
    const buyerTokenAccount  = await getAssociatedTokenAddress(tokenMint, buyer);

    // 5. Invoke the on-chain buyToken instruction
    const tx = await program.rpc.buyToken(
      new anchor.BN(orderId),
      {
        accounts: {
          market:             marketPda,
          buyer:              buyer,
          seller:             seller,
          buyerTokenAccount:  buyerTokenAccount,
          sellerTokenAccount: sellerTokenAccount,
          feeAccount:         authority,
          tokenMint:          tokenMint,
          tokenProgram:       TOKEN_PROGRAM_ID,
        },
      }
    );

    // 6. Return a detailed response
    return res.json({
      success:             true,
      txId:                tx,
      orderId,
      buyer:               buyer.toBase58(),
      seller:              seller.toBase58(),
      buyerTokenAccount:   buyerTokenAccount.toBase58(),
      sellerTokenAccount:  sellerTokenAccount.toBase58(),
      price:               order.price.toNumber(),
      amount:              order.amount.toNumber(),
    });
  } catch (err) {
    console.error('Buy handler error:', err);
    return res.status(500).json({ error: err.toString() });
  }
}
