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
if [[ -n "${AI_WORKER_CHANGED+x}" || -n "${DEPLOY_CONFIG_CHANGED+x}" ]]; then
  selective=true
fi

ai_worker_changed="${AI_WORKER_CHANGED:-false}"
deploy_config_changed="${DEPLOY_CONFIG_CHANGED:-false}"

for value in "$ai_worker_changed" "$deploy_config_changed"; do
  if [[ "$value" != "true" && "$value" != "false" ]]; then
    echo "Deploy change flags must be true or false." >&2
    exit 1
  fi
done

# A direct/manual invocation keeps the previous full-deploy behaviour.
if [[ "$selective" == "false" ]]; then
  ai_worker_changed=true
  deploy_config_changed=true
fi

docker network inspect ai-net >/dev/null 2>&1 || docker network create ai-net
compose=(docker compose --env-file .env)
"${compose[@]}" config --quiet

pull_services=()
up_services=()

if [[ "$deploy_config_changed" == "true" ]]; then
  # Compose changes can alter image refs, dependencies, or limits.
  pull_services=(ai-worker)
elif [[ "$ai_worker_changed" == "true" ]]; then
  pull_services+=(ai-worker)
  up_services+=(ai-worker)
fi

if ((${#pull_services[@]} > 0)); then
  "${compose[@]}" pull "${pull_services[@]}"
fi

if [[ "$deploy_config_changed" == "true" ]]; then
  "${compose[@]}" up -d --remove-orphans ai-worker
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
"${compose[@]}" logs --tail 100 ai-worker >&2
exit 1
