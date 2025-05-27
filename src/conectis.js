// By MaliosDark
// A fortress-grade API orchestrator with strict validation, Redis caching, rate-limits, and ominous error messages.

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { Router } from 'express';
import redis from 'redis';
import cors from 'cors';

import { Connection, Keypair, PublicKey, SYSVAR_CLOCK_PUBKEY, SystemProgram } from '@solana/web3.js';
import anchor from '@project-serum/anchor';


import * as buyModule from './modules/buy.js';
import * as sellModule from './modules/sell.js';
import * as mintModule from './modules/mint.js';
import * as tradeModule from './modules/trade.js';
import * as swapModule from './modules/swap.js';
import * as metadataModule from './modules/metadata.js';
import * as aiMetaModule from './modules/aiMetadata.js';

// ANSI colors
const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';

// ──────────── Env & Wallet Setup ────────────
console.log(`${CYAN}🔑 Loading environment variables...${RESET}`);
const { RPC_URL, KEYPAIR_PATH, PROGRAM_ID, REDIS_URL, FEE_ACCOUNT } = process.env;
if (!RPC_URL || !KEYPAIR_PATH || !PROGRAM_ID || !REDIS_URL) {
  console.error(`${RED}[FATAL] Missing one of RPC_URL, KEYPAIR_PATH, PROGRAM_ID or REDIS_URL in .env! Exiting.${RESET}`);
  process.exit(1);
}
if (!FEE_ACCOUNT) {
  console.error(`${RED}[FATAL] Missing FEE_ACCOUNT in .env!${RESET}`);
  process.exit(1);
}

console.log(`${CYAN}🗝️  Loading keypair from ${KEYPAIR_PATH}...${RESET}`);
let keypair;
try {
  const secret = JSON.parse(fs.readFileSync(path.resolve(KEYPAIR_PATH), 'utf8'));
  keypair = Keypair.fromSecretKey(Buffer.from(secret));
  console.log(`${GREEN}✅ Keypair loaded.${RESET}`);
} catch (err) {
  console.error(`${RED}[FATAL] Unable to load keypair: ${err.message}${RESET}`);
  process.exit(1);
}

// ──────────── Anchor Setup ────────────
console.log(`${CYAN}🌐 Connecting to Solana cluster at ${RPC_URL}...${RESET}`);
const connection = new Connection(RPC_URL, 'confirmed');
const wallet = new anchor.Wallet(keypair);
const provider = new anchor.AnchorProvider(connection, wallet, { preflightCommitment: 'confirmed' });
anchor.setProvider(provider);

console.log(`${CYAN}📜 Loading IDL...${RESET}`);
let idl;
try {
  idl = JSON.parse(fs.readFileSync(path.resolve('./target/idl/nexus_erebus_trade_zone.json'), 'utf8'));
  console.log(`${GREEN}✅ IDL loaded.${RESET}`);
} catch (err) {
  console.error(`${RED}[FATAL] Cannot read IDL: ${err.message}${RESET}`);
  process.exit(1);
}

export const program = new anchor.Program(idl, PROGRAM_ID, provider);
export const FEE_COLLECTOR = new PublicKey(FEE_ACCOUNT);
console.log(`${GREEN}🚀 Anchor program initialized (ID: ${PROGRAM_ID}).${RESET}`);

// ──────────── Redis Setup ────────────
console.log(`${CYAN}🛠️  Connecting to Redis at ${REDIS_URL} on port 3333...${RESET}`);
export const redisClient = redis.createClient({ url: REDIS_URL, socket: { port: 3333 } });
redisClient.on('error', err => console.error(`${RED}[Redis] Error: ${err}${RESET}`));
await redisClient.connect();
console.log(`${GREEN}✅ Redis connected on port 3333.${RESET}`);

// ──────────── Express Setup ────────────
export function setupAPI(app) {
  console.log(`${CYAN}🔧 Applying middlewares...${RESET}`);

  // Add CORS middleware
  // Trust first proxy for rate limiting behind reverse proxy
  app.set('trust proxy', 1);

  const corsOptions = {
    origin: '*', // Allow all origins (INSECURE FOR PRODUCTION!)
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // Allow cookies and authorization headers
    allowedHeaders: ['Content-Type', 'Authorization'], // Specify allowed headers
    optionsSuccessStatus: 200
  };
  app.use(cors(corsOptions));
  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));
  app.use(morgan('combined'));

  console.log(`${CYAN}⏱️  Setting up rate limiter...${RESET}`);
  app.use('/api/',
    rateLimit({
      windowMs: 60 * 60 * 1000,
      max: 100,
      message: {
        error: '🛡️ Too many requests, intruder detected. Try again later—or face the consequences.'
      },
      statusCode: 429,
    })
  );

  console.log(`${CYAN}💾 Configuring cache middleware for /trade...${RESET}`);
  const tradeCache = async (req, res, next) => {
    if (req.method === 'POST' && req.body.action === 'list') {
      const key = 'market:state';
      const cached = await redisClient.get(key);
      if (cached) {
        console.log(`${YELLOW}[Cache] Hit for key '${key}'.${RESET}`);
        return res.json(JSON.parse(cached));
      }
      const _json = res.json.bind(res);
      res.json = async data => {
        console.log(`${YELLOW}[Cache] Storing key '${key}' for 10s.${RESET}`);
        await redisClient.setEx(key, 10, JSON.stringify(data));
        _json(data);
      };
    }
    next();
  };

  const router = Router();
  router.use('/trade', tradeCache);

  console.log(`${CYAN}🔗 Binding routes...${RESET}`);
  router.post('/mint', wrapHandler(mintModule.handler));
  router.post('/buy', wrapHandler(buyModule.handler));
  router.post('/sell', wrapHandler(sellModule.handler));
  router.post('/trade', wrapHandler(tradeModule.handler));
  router.get('/metadata/:mint', wrapHandler(metadataModule.handler));
  router.post('/ai/metadata', wrapHandler(aiMetaModule.handler));   // AI-powered metadata generation
  router.post('/swap', wrapHandler(swapModule.handler));
  router.post('/unlist', wrapHandler(async (req, res) => {
    console.log(`${MAGENTA}[Action] unlistExpired triggered.${RESET}`);
    const authority = provider.wallet.publicKey;
    const marketPda = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), authority.toBuffer()],
      program.programId
    )[0];
    const tx = await program.rpc.unlistExpired({
      accounts: { market: marketPda, clock: SYSVAR_CLOCK_PUBKEY, systemProgram: SystemProgram.programId }
    });
    console.log(`${GREEN}[On-chain] unlistExpired tx: ${tx}${RESET}`);
    res.json({ success: true, tx });
  }));

  router.get('/health', (_req, res) => {
    console.log(`${CYAN}[Health] Ping received.${RESET}`);
    res.json({ ok: true, timestamp: Date.now(), message: '🛡️ All systems nominal.' });
  });

  router.post('/initialize', wrapHandler(async (_req, res) => {
    console.log('[Action] initializeMarket…');
    const authority = provider.wallet.publicKey;
    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), authority.toBuffer()],
      program.programId
    );

    const tx = await program.rpc.initializeMarket(
      FEE_COLLECTOR,             // fee collector desde .env
      new anchor.BN(20),         // fee_rate
      new anchor.BN(100),        // max_tokens_per_agent
      {
        accounts: {
          market: marketPda,
          authority: authority,
          feeAccount: FEE_COLLECTOR,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          clock: SYSVAR_CLOCK_PUBKEY,
        },
      }
    );

    console.log('[On-chain] initializeMarket tx:', tx);
    res.json({ success: true, tx });
  }));


  app.use('/api', router);

  console.log(`${CYAN}🚧 Setting up 404 & error handlers...${RESET}`);
  app.use((_req, res) => {
    console.warn(`${YELLOW}[404] Intrusion detected: ${_req.method} ${_req.originalUrl}${RESET}`);
    res.status(404).json({ error: `🚫 Intrusion detected—${_req.method} ${_req.originalUrl} not found.` });
  });

  app.use((err, req, res, _next) => {
    console.error(`${RED}[ERROR]`, err);
    const ua = req.headers['user-agent'] || '';
    const isBot = /bot|crawler|spider/i.test(ua);
    res.status(err.status || 500).json({
      error: isBot
        ? '🤖 Bots are not welcome here.'
        : '⚠️ An unexpected error occurred. The shadows are watching.'
    });
  });
}

// Captures sync/async exceptions
function wrapHandler(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      next(err);
    }
  };
}


console.log(`${GREEN}✨ Conectis.js initialization complete.${RESET}`);
