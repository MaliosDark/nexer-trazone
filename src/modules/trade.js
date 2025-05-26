import anchor from '@project-serum/anchor';
import { program } from '../conectis.js';

/**
 * trade.js
 * Handles place, cancel, and list actions on the on-chain orderbook.
 */
export async function handler(req, res) {
  try {
    const { action, params } = req.body;
    if (typeof action !== 'string') {
      return res.status(400).json({ error: 'action must be a string' });
    }

    // Derive market PDA
    const authority = program.provider.wallet.publicKey;
    const [marketPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('market'), authority.toBuffer()],
      program.programId
    );

    let result;

    switch (action) {
      case 'place': {
        // Validate params
        const { side, price, amount } = params || {};
        if (!['Buy', 'Sell'].includes(side) || typeof price !== 'number' || typeof amount !== 'number') {
          return res.status(400).json({ error: 'Invalid params for place: require side (Buy|Sell), price: number, amount: number' });
        }

        // Call on-chain placeOrder
        const tx = await program.rpc.placeOrder(
          side,
          new anchor.BN(price),
          new anchor.BN(amount),
          {
            accounts: {
              market: marketPda,
              user:   authority,
            },
          }
        );
        result = { txId: tx, side, price, amount };
        break;
      }

      case 'cancel': {
        // Validate params
        const { orderId } = params || {};
        if (typeof orderId !== 'number') {
          return res.status(400).json({ error: 'Invalid params for cancel: require orderId: number' });
        }

        // Call on-chain cancelOrder
        const tx = await program.rpc.cancelOrder(
          new anchor.BN(orderId),
          {
            accounts: {
              market: marketPda,
              user:   authority,
            },
          }
        );
        result = { txId: tx, orderId };
        break;
      }

      case 'list': {
        // Fetch the Market account and return its lists
        const marketAccount = await program.account.market.fetch(marketPda);
        // Serialize TokenMeta and Order entries to plain JS
        const tokenList = marketAccount.tokenList.map(t => ({
          mint:      t.mint.toBase58(),
          name:      t.name,
          creator:   t.creator.toBase58(),
          supply:    t.supply.toNumber(),
          timestamp: t.timestamp.toNumber(),
          lastTraded:t.lastTraded.toNumber(),
        }));
        const orderBook = marketAccount.orderBook.map(o => ({
          id:     o.id.toNumber(),
          owner:  o.owner.toBase58(),
          token:  o.token.toBase58(),
          side:   o.side,  // "Buy" or "Sell"
          price:  o.price.toNumber(),
          amount: o.amount.toNumber(),
        }));
        result = { tokenList, orderBook };
        break;
      }

      default:
        return res.status(400).json({ error: 'Unknown action: must be "place", "cancel", or "list"' });
    }

    return res.json({ success: true, action, result });
  } catch (err) {
    console.error('Trade handler error:', err);
    return res.status(500).json({ error: err.toString() });
  }
}
