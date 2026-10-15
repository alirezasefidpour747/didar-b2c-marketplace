#!/usr/bin/env bash
set -euo pipefail
# Local development only. PostgreSQL is loopback-bound; Docker staging uses passwords.
if docker container inspect didar-postgres >/dev/null 2>&1; then
  docker start didar-postgres >/dev/null
else
  docker run -d --name didar-postgres -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=didar -p 127.0.0.1:5432:5432 postgres:17-alpine >/dev/null
fi
if docker container inspect didar-redis >/dev/null 2>&1; then
  docker start didar-redis >/dev/null
else
  docker run -d --name didar-redis -p 127.0.0.1:6379:6379 redis:7-alpine >/dev/null
fi
for attempt in {1..30}; do
  if docker exec didar-postgres pg_isready -U postgres -d didar >/dev/null && docker exec didar-redis redis-cli ping | rg -q PONG; then exit 0; fi
  sleep 1
done
exit 1
