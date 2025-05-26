#!/usr/bin/env bash
# setup_redis.sh
# Creates a project-local Redis instance on port 3333, leaving other Redis instances untouched.
# With ANSI colors for visibility.

set -euo pipefail

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

REDIS_PORT=3333
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
CONF="$PROJECT_ROOT/redis-${REDIS_PORT}.conf"
PIDFILE="$PROJECT_ROOT/redis-${REDIS_PORT}.pid"
LOGFILE="$PROJECT_ROOT/redis-${REDIS_PORT}.log"

# 1. Install if needed
if ! command -v redis-server >/dev/null 2>&1; then
  echo -e "${BLUE}💾 Installing redis-server...${NC}"
  sudo apt-get update -y && sudo apt-get install -y redis-server
  echo -e "${GREEN}✅ redis-server installed.${NC}"
fi

# 2. Write project-local config
echo -e "${BLUE}📝 Writing Redis config to ${CONF}${NC}"
cat > "$CONF" <<EOF
bind 127.0.0.1
port $REDIS_PORT
daemonize yes
pidfile $PIDFILE
logfile $LOGFILE
dir $PROJECT_ROOT
timeout 0
tcp-keepalive 300
EOF
echo -e "${GREEN}✅ Config written.${NC}"

# 3. Start instance
echo -e "${BLUE}▶️  Starting Redis on port ${REDIS_PORT} with config ${CONF}${NC}"
redis-server "$CONF"
echo -e "${GREEN}✅ Redis instance launched.${NC}"

# 4. Show details
echo -e "${YELLOW}• PID file: ${NC}${PIDFILE}"
echo -e "${YELLOW}• Log file: ${NC}${LOGFILE}"
echo -e "${YELLOW}• Port:     ${NC}${REDIS_PORT}"
