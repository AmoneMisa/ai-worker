# AI Worker

Private, shared AI-enrichment service for the WhitesLove vacancy and apartment
aggregators. It runs structured text extraction through Ollama without exposing
Ollama to browsers or the public network.

The LLM is an enrichment layer, not the parser foundation. Personal-Site and
flat-finder keep their deterministic extraction for contacts, prices, currency,
rooms, area, floors, skills and locations. They submit only ambiguous text plus
their trusted `knownFacts` to this service.

## Architecture

```text
Personal-Site (vacancies) ─┐
                           ├── private HTTP ──> ai-worker ──> BullMQ/Redis
flat-finder (apartments) ──┘                         │
                                                    └──> Ollama/Qwen
```

- Ollama and the dedicated queue Redis live only on the compose-internal network.
- `ai-worker` joins the shared external `ai-net` network and publishes port 4030
  only on host loopback for diagnostics.
- All inference passes through one BullMQ worker. Default concurrency is `1`.
- Priority is vacancy text, apartment text, then future photo work.
- Identical inputs reuse a versioned result cache.
- Phone numbers, email addresses, URLs and Telegram usernames are redacted from
  model prompts; callers retain them in deterministic data.
- A missing Ollama instance does not stop the HTTP service from reporting health.

## Current scope

Implemented:

- Ollama structured-output client (`format: JSON Schema`, temperature `0`);
- apartment and vacancy schemas with Zod and business validation;
- BullMQ queue, retries, priorities and a single physical inference worker;
- versioned content-hash result cache;
- optional internal API key;
- metrics, readiness/health endpoints and graceful shutdown;
- Docker Compose stack, persistent model/queue volumes and model preload;
- GitHub Actions SSH autodeploy;
- deterministic unit tests and a live benchmark script.

Not implemented yet:

- vision/photo analysis (the feature flag remains off);
- automatic `needsAI` decisions inside Personal-Site and flat-finder;
- persistence/merge of enrichment results in those two applications;
- a manually verified production golden dataset.

## API

### Health and metrics

```text
GET /health
GET /ready
GET /metrics
```

### Submit extraction

```http
POST /ai/extract
X-AI-Key: <AI_API_KEY>
Content-Type: application/json

{
  "kind": "vacancy",
  "rawText": "...",
  "knownFacts": {
    "salaryMin": 2500,
    "currency": "USD",
    "skills": ["Vue.js", "TypeScript"]
  },
  "meta": {
    "source": "telegram",
    "country": "UZ"
  }
}
```

The first response is normally:

```json
{ "status": "pending", "key": "vacancy-..." }
```

Poll the result asynchronously:

```text
GET /ai/result/vacancy-...
X-AI-Key: <AI_API_KEY>
```

Cached inputs return their completed result directly from `POST /ai/extract`.
Clients must keep and publish their deterministic result while AI is pending or
failed; AI must never block scraping or page delivery.

## Local development

Requires Node.js 20+ (the container uses Node.js 22).

```bash
npm install
npm test
npm run check
cp sample.env ai-worker.env
```

Create the shared network once and start the infrastructure:

```bash
docker network create ai-net 2>/dev/null || true
docker compose --env-file ai-worker.env up -d ollama ai-redis
docker compose --env-file ai-worker.env --profile setup run --rm ollama-pull
docker compose --env-file ai-worker.env up -d --build ai-worker
curl http://127.0.0.1:4030/health
```

Run a real two-fixture benchmark after Ollama is ready:

```bash
set -a
. ./ai-worker.env
set +a
npm run benchmark
```

Set `BENCHMARK_RUNS=10` for repeated cold inferences. The script prints duration,
status/confidence and the service metrics. Do not raise concurrency or finalize
timeouts/context sizes before measuring on the production CPU.

## Production deployment

### First server setup

```bash
cd ~/opt
git clone <repository-url> ai-worker
cd ai-worker
cp sample.env ai-worker.env
chmod 600 ai-worker.env
```

Generate a shared internal key and put the same value in the two caller apps:

```bash
openssl rand -hex 32
```

Edit `ai-worker.env`, then run:

```bash
chmod +x deploy.sh
./deploy.sh
```

`deploy.sh` creates `ai-net` when absent, starts Ollama/Redis, preloads
`AI_MODEL`, rebuilds the worker and verifies `/health`. Model and queue data are
preserved in Docker volumes.

### GitHub Actions

The workflow deploys pushes to `master` by running
`bash ~/opt/ai-worker/deploy.sh` over SSH. Configure the repository's
`Production` environment with:

- variable `SERVER_HOST`;
- variable `SERVER_USER`;
- secret `SERVER_SSH_KEY`.

The server checkout needs read access to the repository because `deploy.sh`
performs `git pull --ff-only`.

## Connecting the applications

Add the worker URL and key to each backend environment:

```env
AI_WORKER_URL=http://ai-worker:4030
AI_WORKER_KEY=<same value as AI_API_KEY>
```

Attach the backend service to the external network:

```yaml
services:
  your-backend:
    networks:
      - default
      - ai-net

networks:
  ai-net:
    external: true
```

Only backend code may call the worker. Never expose arbitrary prompts, model
selection, system prompts, context settings or raw Ollama options to frontend
clients.

## Configuration

See [sample.env](sample.env). Important defaults for the 4-vCPU/16-GB CPU-only
host are:

```env
AI_CONCURRENCY=1
AI_TEXT_CONTEXT=8192
AI_TEXT_TIMEOUT_MS=120000
OLLAMA_CPUS=3.0
OLLAMA_MEMORY_LIMIT=8g
```

`PROMPT_VERSION` and `SCHEMA_VERSION` are part of cache keys and stored result
metadata. Increment the corresponding version whenever prompts or schemas change.

Do not commit `ai-worker.env`; it contains the internal API key.
