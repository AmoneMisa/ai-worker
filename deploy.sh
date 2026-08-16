#!/usr/bin/env bash
# Standalone production deploy. GitHub Actions invokes this over SSH; it is also
# safe to run manually from ~/opt/ai-worker.
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f ai-worker.env ]; then
  echo "Missing $(pwd)/ai-worker.env (copy sample.env and fill secrets first)." >&2
  exit 1
fi

if [ -d .git ]; then
  git pull --ff-only
fi

docker network inspect ai-net >/dev/null 2>&1 || docker network create ai-net

compose=(docker compose --env-file ai-worker.env)

"${compose[@]}" pull ollama ai-redis
"${compose[@]}" up -d ollama ai-redis

# Pull before starting the worker so the first production job never triggers a
# multi-gigabyte model download. `ollama pull` is idempotent on later deploys.
"${compose[@]}" --profile setup run --rm ollama-pull

"${compose[@]}" up -d --build ai-worker
"${compose[@]}" ps

curl --fail --silent --show-error --retry 12 --retry-delay 5 \
  http://127.0.0.1:4030/health
echo
