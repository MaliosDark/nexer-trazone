import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { setupAPI } from './conectis.js';

// ANSI color codes
const RESET  = '\x1b[0m';
const RED    = '\x1b[31m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE   = '\x1b[34m';
const MAGENTA= '\x1b[35m';
const CYAN   = '\x1b[36m';

const app = express();
app.use(express.json());

// ──────────── Launch Redis ────────────
const REDIS_PORT   = 3333;
const PROJECT_ROOT = path.resolve();
const REDIS_CONF   = path.join(PROJECT_ROOT, `redis-${REDIS_PORT}.conf`);

console.log(`${CYAN}🚀 Spawning Redis on port${YELLOW} ${REDIS_PORT}${CYAN}…${RESET}`);
const redisProc = spawn('redis-server', [REDIS_CONF], {
  stdio: ['ignore', 'inherit', 'inherit'],
});

redisProc.on('exit', (code, signal) => {
  console.error(`${RED}❌ Redis process exited (code=${code}, signal=${signal}), shutting down API.${RESET}`);
  process.exit(1);
});

// Ensure Redis is killed when Node exits
const shutdown = () => {
  console.log(`${MAGENTA}🛑 Shutting down Redis and API server...${RESET}`);
  if (!redisProc.killed) redisProc.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);

// ──────────── Express Setup ────────────
setupAPI(app);

const PORT = process.env.PORT || 3332;
const server = app.listen(PORT, () => {
  console.log(`${GREEN}🚀 Nexus API listening on port${YELLOW} ${PORT}${GREEN}.${RESET}`);
});

server.on('error', err => {
  console.error(`${RED}❌ Server error:${RESET}`, err);
  shutdown();
});
