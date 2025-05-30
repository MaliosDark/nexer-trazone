// src/index.js
// Entrypoint: Spawns a project-local Redis instance (port 3333) and starts the Nexus API server.

import fs from 'fs';
import path from 'path';
import express from 'express';
import { spawn } from 'child_process';
import { setupAPI } from './conectis.js';

// ANSI color codes
const RESET   = '\x1b[0m';
const RED     = '\x1b[31m';
const GREEN   = '\x1b[32m';
const YELLOW  = '\x1b[33m';
const BLUE    = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN    = '\x1b[36m';

const app = express();
app.use(express.json());

// ──────────── Launch Redis ────────────
const REDIS_PORT   = 3333;
const PROJECT_ROOT = path.resolve();
const REDIS_CONF   = path.join(PROJECT_ROOT, `redis-${REDIS_PORT}.conf`);
const REDIS_PID    = path.join(PROJECT_ROOT, `redis-${REDIS_PORT}.pid`);
const REDIS_LOG    = path.join(PROJECT_ROOT, `redis-${REDIS_PORT}.log`);

// 1. Create Redis config if missing
if (!fs.existsSync(REDIS_CONF)) {
  console.log(`${CYAN}📝 Redis config not found—creating at ${REDIS_CONF}${RESET}`);
  const conf = `
bind 127.0.0.1
port ${REDIS_PORT}
daemonize no

protected-mode no
logfile ""
dir ${PROJECT_ROOT}
timeout 0
tcp-keepalive 300
`.trim();
  fs.writeFileSync(REDIS_CONF, conf);
  console.log(`${GREEN}✅ Created Redis config.${RESET}`);
}

// 2. Spawn Redis server with CLI flags (foreground)
/*
  - --port:      puerto
  - --bind:      sólo en localhost
  - --protected-mode: off para pruebas locales
  - --dir:       directorio de persistencia (puede ser PROJECT_ROOT)
  - --daemonize: no, para que corra en primer plano
  - --logfile:   "" para volcar logs a stdout
*/
// 2. Spawn Redis server with minimal CLI flags (foreground)
console.log(`${CYAN}🚀 Spawning Redis on port${YELLOW} ${REDIS_PORT}${CYAN}…${RESET}`);
const redisProc = spawn('redis-server', [
  '--port', `${REDIS_PORT}`,
  '--bind', '127.0.0.1',

], {
  stdio: ['ignore', 'inherit', 'inherit'],
});



// 3. If Redis exits because port is in use, just warn and continue;
//    otherwise shut down the API.
redisProc.on('exit', (code, signal) => {
  if (code === 1) {
    console.warn(`⚠️ Redis failed to start on port ${REDIS_PORT} (already in use). Reusing existing instance.`);
    return;
  }
  console.error(`❌ Redis process exited (code=${code}, signal=${signal}), shutting down API.`);
  process.exit(1);
});


// 4. Ensure Redis is killed when Node exits
const shutdown = () => {
  console.log(`${MAGENTA}🛑 Shutting down Redis and API server...${RESET}`);
  if (!redisProc.killed) {
    redisProc.kill('SIGTERM');
  }
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ──────────── Express Setup ────────────
setupAPI(app);

// 5. Start HTTP server
const PORT = process.env.PORT || 3332;
const server = app.listen(PORT, () => {
  console.log(
    `${GREEN}🚀 Nexus API listening on port${YELLOW} ${PORT}${GREEN}.${RESET}`
  );
});

// 6. Handle server errors
server.on('error', (err) => {
  console.error(`${RED}❌ Server error:${RESET}`, err);
  shutdown();
});
