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

# A bind-mounted model directory keeps multi-gigabyte Ollama models off the
# small system disk. Refuse to silently create the production path on `/` when
# the expected data volume was not mounted after a reboot.
ollama_data_path="$(sed -n 's/^OLLAMA_DATA_PATH=//p' ai-worker.env | tail -n 1)"
if [ -n "$ollama_data_path" ]; then
  if [[ "$ollama_data_path" != /* ]]; then
    echo "OLLAMA_DATA_PATH must be an absolute host path." >&2
    exit 1
  fi
  if [[ "$ollama_data_path" == /mnt/docker-data/* ]] && ! mountpoint -q /mnt/docker-data; then
    echo "/mnt/docker-data is not mounted; refusing to store Ollama models on the root disk." >&2
    exit 1
  fi
  mkdir -p "$ollama_data_path"
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

# `docker compose up -d` returns as soon as the container starts, before Node
# necessarily binds the port. A curl in that small window can fail with
# connection reset even though the service becomes healthy a moment later.
health_url="http://127.0.0.1:4030/health"
ready_url="http://127.0.0.1:4030/ready"

for attempt in $(seq 1 30); do
  if curl --fail --silent --max-time 5 "$ready_url" >/dev/null 2>&1; then
    curl --fail --silent --show-error --max-time 10 "$health_url"
    echo
    exit 0
  fi

  echo "Waiting for ai-worker readiness (${attempt}/30)..."
  sleep 3
done

echo "ai-worker did not become ready; recent container logs:" >&2
"${compose[@]}" ps >&2
"${compose[@]}" logs --tail 100 ai-worker >&2
exit 1
