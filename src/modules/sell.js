import anchor from '@project-serum/anchor';
import { program, FEE_COLLECTOR  } from '../conectis.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';

export async function handler(req, res) {
  try {
    // 1. Validate input
    const { orderId } = req.body;
    if (typeof orderId !== 'number') {
      return res.status(400).json({ error: 'orderId must be a number' });
    }

    const connection = program.provider.connection;
    const authority  = program.provider.wallet.publicKey;

    // 2. Derive market PDA and fetch its state
    const [marketPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('market'), authority.toBuffer()],
      program.programId
    );
    const marketAccount = await program.account.market.fetch(marketPda);

    // 3. Find the matching buy order
    const order = marketAccount.orderBook.find(o => o.id.toNumber() === orderId && o.side === 'Buy');
    if (!order) {
      return res.status(404).json({ error: 'Buy order not found for given ID' });
    }

    // 4. Determine buyer and seller roles
    const buyer = order.owner;       // the original order placer
    const seller = authority;        // current wallet
    const tokenMint = order.token;

    // 5. Derive associated token accounts for both parties
    const buyerTokenAccount  = await getAssociatedTokenAddress(tokenMint, buyer);
    const sellerTokenAccount = await getAssociatedTokenAddress(tokenMint, seller);

    // 6. Execute the buyToken RPC (roles flipped: seller is signer)
    const tx = await program.rpc.buyToken(
      new anchor.BN(orderId),
      {
        accounts: {
          market:             marketPda,
          buyer:              buyer,
          seller:             seller,
          buyerTokenAccount:  buyerTokenAccount,
          sellerTokenAccount: sellerTokenAccount,
          feeAccount: FEE_COLLECTOR,
          tokenMint:          tokenMint,
          tokenProgram:       TOKEN_PROGRAM_ID,
        },
        signers: [] // seller (authority) already loaded in provider
      }
    );

    // 7. Return full details
    return res.json({
      success:            true,
      txId:               tx,
      orderId,
      buyer:              buyer.toBase58(),
      seller:             seller.toBase58(),
      buyerTokenAccount:  buyerTokenAccount.toBase58(),
      sellerTokenAccount: sellerTokenAccount.toBase58(),
      price:              order.price.toNumber(),
      amount:             order.amount.toNumber()
    });
  } catch (err) {
    console.error('Sell handler error:', err);
    return res.status(500).json({ error: err.toString() });
  }
}
