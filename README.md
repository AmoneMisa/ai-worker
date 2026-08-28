# AI Worker

Private AI-enrichment service shared by WhitesLove vacancy/candidate flows and flat-finder. Deterministic parsing stays in the caller applications; this service handles ambiguous semantic extraction, translation and optional photo analysis.

## Architecture

```text
Personal-Site ───────────────┐
                             ├── private HTTP ──> ai-worker ──> Ollama/Qwen
flat-finder ─────────────────┘                    │
                                                  ├──> M2M100 translator
                                                  └──> vision providers
```

`ai-worker` is intentionally stateless apart from a bounded in-process queue and TTL/LRU result cache. It does **not** use Redis.

That is deliberate:

- flat-finder already owns durable crawl/job state in PostgreSQL;
- Personal-Site owns its persistent snapshots/state on its Docker volume and polls `ai-worker` results;
- callers can safely resubmit deterministic fingerprints after an `ai-worker` restart;
- adding Redis here would duplicate durability responsibilities without improving the current delivery contract.

The in-process executor is therefore only a local concurrency/priority boundary around expensive inference. Default concurrency is `1`.

## Current scope

Implemented:

- apartment, vacancy and candidate structured extraction with JSON Schema + Zod validation;
- dedicated M2M100 translation with Qwen fallback;
- photo analysis through the configured Groq/Cloudflare provider chain;
- provider fallback/cooldown and bounded photo concurrency;
- versioned process-local result cache;
- API-key protection, metrics, readiness/health and graceful shutdown;
- fail-fast environment validation;
- Docker Compose deployment and model preload;
- deterministic tests and benchmark script.

The LLM remains an enrichment layer. Phone numbers, emails, URLs and Telegram usernames are redacted from text-extraction prompts; caller applications retain trusted deterministic facts.

## API

### Health and metrics

```text
GET /health
GET /ready
GET /metrics
```

### Structured extraction

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

Supported kinds: `apartment`, `vacancy`, `candidate`, `translation`.

Non-cached semantic extraction normally returns:

```json
{ "status": "pending", "key": "vacancy-..." }
```

Poll with:

```text
GET /ai/result/vacancy-...
X-AI-Key: <AI_API_KEY>
```

Interactive translation first uses the dedicated translator synchronously. If that service is unavailable and fallback is enabled, only the Qwen fallback is queued; the dedicated translator is not called twice.

### Photo analysis

```http
POST /ai/vision
X-AI-Key: <AI_API_KEY>
Content-Type: application/json

{
  "images": [
    "https://example.com/photo.jpg",
    { "id": "kitchen", "url": "https://example.com/kitchen.jpg" }
  ]
}
```

Vision is enabled by default in the provided Compose configuration. The default chain is `groq,gemini,nvidia,huggingface,llm7,openrouter,cloudflare` - configure at least one provider's key in `.env`; unconfigured providers fail instantly and fall through, so it's fine to leave the full chain even with some keys blank. Provider failures fall through to the next configured provider; transient (rate-limit/5xx) failures enter a short cooldown for that provider.

| Provider | Env var | Free tier (approx) | Get a key |
|---|---|---|---|
| Groq | `GROQ_API_KEY` | model-dependent TPM limit | https://console.groq.com |
| Gemini | `GEMINI_API_KEY` | ~15 RPM / 1,500 RPD | https://aistudio.google.com/apikey |
| NVIDIA NIM | `NVIDIA_API_KEY` | ~40 RPM | https://build.nvidia.com |
| Hugging Face | `HUGGINGFACE_API_KEY` | rate-limited, many models | https://huggingface.co/settings/tokens |
| llm7.io | `LLM7_API_KEY` | ~30 RPM (120 with a key) | https://llm7.io - no registration needed for basic access; commercial-use terms undocumented |
| OpenRouter | `OPENROUTER_API_KEY` | ~20 RPM / 200 RPD (`:free` models) | https://openrouter.ai/keys - commercial-use terms undocumented for free models |
| Cloudflare Workers AI | `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` | 10K neurons/day | Cloudflare dashboard; also requires accepting the vision model's community license once per account |

A third `ollama` provider is available (reuses `AI_MODEL`/`OLLAMA_VISION_MODEL`, requires a multimodal model such as `qwen3.5`) but is **not** in the default `VISION_PROVIDERS` chain: on a CPU-only host, multimodal inference can take minutes per photo even with the smallest model (measured: 0.8b/2b/4b all failed to complete within 2.5-5 minutes for a single small photo on an 8-core VPS with no GPU). Only add `ollama` to `VISION_PROVIDERS` if you have GPU-accelerated Ollama, or explicitly accept very slow background vision jobs.

## Local development

Requires Node.js 24 LTS or newer. The translator image uses the current stable Python 3.14 line.

```bash
npm ci
npm test
npm run check
cp sample.env .env
```

Create the shared network once and start the stack:

```bash
docker network create ai-net 2>/dev/null || true
docker compose --env-file .env up -d ollama translator
docker compose --env-file .env --profile setup run --rm ollama-pull
docker compose --env-file .env up -d ai-worker
curl http://127.0.0.1:4030/health
```

Run the benchmark after Ollama is ready:

```bash
set -a
. ./.env
set +a
npm run benchmark
```

## Production deployment

```bash
cd ~/opt
git clone <repository-url> ai-worker
cd ai-worker
cp sample.env .env
chmod 600 .env
chmod +x deploy.sh
./deploy.sh
```

Generate a shared internal key and put the same value in caller backends:

```bash
openssl rand -hex 32
```

For a separate production data disk:

```env
OLLAMA_DATA_PATH=/mnt/docker-data/ollama
```

`deploy.sh` refuses to use a configured `/mnt/docker-data/...` path unless that mount is actually present.

## Connecting applications

```env
AI_WORKER_URL=http://ai-worker:4030
AI_WORKER_KEY=<same value as AI_API_KEY>
```

Attach caller backends to `ai-net`. Only backend code should call this service; do not expose model selection, prompts or raw Ollama options to browsers.

## Configuration

See `sample.env`. Important conservative defaults for the current CPU-only host are:

```env
AI_CONCURRENCY=1
AI_TEXT_CONTEXT=8192
AI_TEXT_TIMEOUT_MS=120000
VISION_CONCURRENCY=1
OLLAMA_CPUS=4.0
OLLAMA_MEMORY_LIMIT=8g
```

`PROMPT_VERSION` and `SCHEMA_VERSION` are part of cache keys and result metadata. Increment the corresponding version when prompts or schemas change.

Do not commit `.env`; it contains internal credentials.
