#!/usr/bin/env bash
# Manage a throwaway local MySQL instance for development (no sudo/root required).
#
# Usage:
#   ./scripts/mysql-dev.sh init     # initialize data dir (first time)
#   ./scripts/mysql-dev.sh start    # start server + create DB/user
#   ./scripts/mysql-dev.sh stop     # stop server
#
# Then use this in server/.env:
#   DATABASE_URL="mysql://society:society@127.0.0.1:3307/society_maintenance"

set -euo pipefail

BASE="${MYSQL_DEV_DIR:-/tmp/society-mysql}"
DATA="$BASE/data"
SOCK="$BASE/mysql.sock"
PID="$BASE/mysqld.pid"
LOG="$BASE/error.log"
PORT="${MYSQL_DEV_PORT:-3307}"
DB="${MYSQL_DEV_DB:-society_maintenance}"
USER="${MYSQL_DEV_USER:-society}"
PASS="${MYSQL_DEV_PASS:-society}"
BASEDIR="${MYSQL_BASEDIR:-/usr}"

case "${1:-}" in
  init)
    rm -rf "$BASE"
    mkdir -p "$DATA" "$BASE/tmp"
    mysqld --no-defaults --initialize-insecure --datadir="$DATA" --basedir="$BASEDIR" --pid-file="$PID"
    echo "Initialized data directory at $DATA"
    ;;
  start)
    mkdir -p "$BASE/tmp"
    setsid mysqld --no-defaults \
      --datadir="$DATA" --basedir="$BASEDIR" \
      --socket="$SOCK" --pid-file="$PID" \
      --port="$PORT" --bind-address=127.0.0.1 \
      --tmpdir="$BASE/tmp" --log-error="$LOG" \
      >/dev/null 2>&1 < /dev/null &
    sleep 6
    mysqladmin --socket="$SOCK" -uroot ping
    mysql --socket="$SOCK" -uroot <<SQL
CREATE DATABASE IF NOT EXISTS $DB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$USER'@'%' IDENTIFIED WITH mysql_native_password BY '$PASS';
GRANT ALL PRIVILEGES ON $DB.* TO '$USER'@'%';
FLUSH PRIVILEGES;
SQL
    echo "MySQL running on 127.0.0.1:$PORT (socket $SOCK)"
    ;;
  stop)
    mysqladmin --socket="$SOCK" -uroot shutdown || kill "$(cat "$PID")" 2>/dev/null || true
    echo "stopped"
    ;;
  *)
    echo "usage: $0 {init|start|stop}"
    exit 1
    ;;
esac
