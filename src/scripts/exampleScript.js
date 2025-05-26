/**
 * exampleScript.js
 *
 * Demonstrates direct usage of your Express-backed Nexus API 
 * by importing the same handlers and invoking them programmatically.
 */

import express from 'express';
import http from 'http';
import { setupAPI } from '../src/conectis.js';

// 1. Boot up the Express app in-memory
const app = express();
app.use(express.json());
setupAPI(app);
const server = http.createServer(app);

// 2. Wrap Express handlers so we can call them without real HTTP
function callEndpoint(method, path, body) {
  return new Promise((resolve, reject) => {
    const req = new http.IncomingMessage();
    req.method = method;
    req.url = path;
    req.headers = { 'content-type': 'application/json' };
    req.body = body;

    const res = new http.ServerResponse(req);
    let data = '';
    res.write = (chunk) => { data += chunk; };
    res.end = () => {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    };

    app.handle(req, res);
  });
}

(async () => {
  try {
    console.log('🔄 exampleScript starting');

    // Mint a token
    console.log('1) Minting token...');
    const mintResult = await callEndpoint('POST', '/api/mint', {
      name: 'ScriptToken',
      symbol: 'SCR',
      uri: 'https://example.com/meta.json',
      amount: 100
    });
    console.log('Mint result:', mintResult);

    // Place a sell order
    console.log('2) Placing sell order...');
    const placeResult = await callEndpoint('POST', '/api/trade', {
      action: 'place',
      params: { side: 'Sell', price: 10, amount: 50 }
    });
    console.log('Place order result:', placeResult);

    // List orders
    console.log('3) Listing orders...');
    const listResult = await callEndpoint('POST', '/api/trade', {
      action: 'list'
    });
    console.log('Market data:', listResult.result);

    const orderId = listResult.result.orderBook[0].id;
    console.log(`Order ID to buy: ${orderId}`);

    // Buy the order
    console.log('4) Buying from order...');
    const buyResult = await callEndpoint('POST', '/api/buy', { orderId });
    console.log('Buy result:', buyResult);

    // Swap tokens (demo addresses must be replaced)
    console.log('5) Swapping tokens...');
    const swapResult = await callEndpoint('POST', '/api/swap', {
      price: 5,
      amount: 10,
      walletA: 'REPLACE_WITH_WALLET_A',
      walletB: 'REPLACE_WITH_WALLET_B'
    });
    console.log('Swap result:', swapResult);

    // Unlist expired/inactive
    console.log('6) Unlisting expired/inactive tokens...');
    const unlistResult = await callEndpoint('POST', '/api/unlist', {});
    console.log('Unlist result:', unlistResult);

    console.log('✅ exampleScript completed');
  } catch (err) {
    console.error('Error in exampleScript:', err);
  } finally {
    server.close();
  }
})();
