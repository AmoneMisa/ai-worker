#!/usr/bin/env bash
# Production deploy. Images are built in GitHub Actions; the server only pulls
# changed images and reconciles the services affected by the current deploy.
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing $(pwd)/.env (copy sample.env to .env and fill secrets first)." >&2
  exit 1
fi

if [[ "${SKIP_GIT_PULL:-false}" != "true" && -d .git ]]; then
  git pull --ff-only
fi

selective=false
if [[ -n "${AI_WORKER_CHANGED+x}" || -n "${TRANSLATOR_CHANGED+x}" || -n "${DEPLOY_CONFIG_CHANGED+x}" ]]; then
  selective=true
fi

ai_worker_changed="${AI_WORKER_CHANGED:-false}"
translator_changed="${TRANSLATOR_CHANGED:-false}"
deploy_config_changed="${DEPLOY_CONFIG_CHANGED:-false}"

for value in "$ai_worker_changed" "$translator_changed" "$deploy_config_changed"; do
  if [[ "$value" != "true" && "$value" != "false" ]]; then
    echo "Deploy change flags must be true or false." >&2
    exit 1
  fi
done

# A direct/manual invocation keeps the previous full-deploy behaviour.
if [[ "$selective" == "false" ]]; then
  ai_worker_changed=true
  translator_changed=true
  deploy_config_changed=true
fi

ollama_data_path="$(sed -n 's/^OLLAMA_DATA_PATH=//p' .env | tail -n 1)"
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
compose=(docker compose --env-file .env)
"${compose[@]}" config --quiet

pull_services=()
up_services=()

if [[ "$deploy_config_changed" == "true" ]]; then
  # Compose changes can alter image refs, dependencies, limits, or model setup.
  pull_services=(ollama translator ai-worker)
else
  if [[ "$translator_changed" == "true" ]]; then
    pull_services+=(translator)
    up_services+=(translator)
  fi
  if [[ "$ai_worker_changed" == "true" ]]; then
    pull_services+=(ai-worker)
    up_services+=(ai-worker)
  fi
fi

if ((${#pull_services[@]} > 0)); then
  "${compose[@]}" pull "${pull_services[@]}"
fi

if [[ "$deploy_config_changed" == "true" ]]; then
  "${compose[@]}" up -d ollama

  # Model download is runtime data, not an application image build.
  "${compose[@]}" --profile setup run --rm ollama-pull
  "${compose[@]}" up -d --remove-orphans translator ai-worker
elif ((${#up_services[@]} > 0)); then
  # Only recreate services whose image changed; leave unrelated dependencies alone.
  "${compose[@]}" up -d --no-deps --remove-orphans "${up_services[@]}"
else
  echo "No deploy-relevant changes detected; nothing to update."
fi

"${compose[@]}" ps

health_url="http://127.0.0.1:4030/health"
ready_url="http://127.0.0.1:4030/ready"

for attempt in $(seq 1 40); do
  if curl --fail --silent --max-time 5 "$ready_url" >/dev/null 2>&1; then
    health="$(curl --fail --silent --show-error --max-time 10 "$health_url")"
    echo "$health"
    if echo "$health" | grep -q '"ok":true'; then
      exit 0
    fi
    echo "ai-worker is ready but health dependencies are not satisfied yet (${attempt}/40)..."
  else
    echo "Waiting for ai-worker readiness (${attempt}/40)..."
  fi
  sleep 3
done

echo "ai-worker did not become healthy; recent container logs:" >&2
"${compose[@]}" ps >&2
"${compose[@]}" logs --tail 100 ai-worker translator >&2
exit 1
