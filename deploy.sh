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

# Pull Qwen before starting the worker so parsing never triggers a model download.
"${compose[@]}" --profile setup run --rm ollama-pull

# The first translator build downloads and converts facebook/m2m100_418M to
# CTranslate2 INT8. Docker caches that expensive model layer on subsequent deploys.
"${compose[@]}" build translator ai-worker
"${compose[@]}" up -d translator ai-worker
"${compose[@]}" ps

health_url="http://127.0.0.1:4030/health"
ready_url="http://127.0.0.1:4030/ready"

for attempt in $(seq 1 40); do
  if curl --fail --silent --max-time 5 "$ready_url" >/dev/null 2>&1; then
    health="$(curl --fail --silent --show-error --max-time 10 "$health_url")"
    echo "$health"
    # The worker can technically fall back to Qwen, but a deploy of this feature
    # is not considered healthy until the dedicated translator is reachable.
    if echo "$health" | grep -q '"translator":true'; then
      exit 0
    fi
    echo "ai-worker is ready but translator is not healthy yet (${attempt}/40)..."
  else
    echo "Waiting for ai-worker readiness (${attempt}/40)..."
  fi
  sleep 3
done

echo "ai-worker/translator did not become ready; recent container logs:" >&2
"${compose[@]}" ps >&2
"${compose[@]}" logs --tail 100 ai-worker translator >&2
exit 1
