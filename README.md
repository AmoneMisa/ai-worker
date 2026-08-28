# AI Worker

Private AI-enrichment service shared by WhitesLove vacancy/candidate flows and flat-finder. Deterministic parsing stays in the caller applications; this service handles ambiguous semantic extraction, translation and optional photo analysis.

## Architecture

```text
Personal-Site ───────────────┐
                             ├── private HTTP ──> ai-worker ──> external text providers (extraction + translation)
flat-finder ─────────────────┘                    │
                                                  └──> external vision providers (photo analysis)
```

Both the text (extraction/translation) and vision (photo analysis) pipelines call out to the same family of external LLM providers (Groq, Gemini, NVIDIA, Hugging Face, llm7, OpenRouter, Mistral; Cloudflare is vision-only), each tried in order with a per-provider cooldown after a retryable failure. There is no self-hosted model — if every configured provider is simultaneously rate-limited or down, the request fails rather than falling back to local inference.

`ai-worker` is intentionally stateless apart from a bounded in-process queue and TTL/LRU result cache. It does **not** use Redis.

That is deliberate:

- flat-finder already owns durable crawl/job state in PostgreSQL;
- Personal-Site owns its persistent snapshots/state on its Docker volume and polls `ai-worker` results;
- callers can safely resubmit deterministic fingerprints after an `ai-worker` restart;
- adding Redis here would duplicate durability responsibilities without improving the current delivery contract.

The in-process executor is therefore only a local concurrency/priority boundary around expensive inference. Default concurrency is `1`.

## Current scope

Implemented:

- apartment, vacancy, candidate and translation structured extraction with JSON Schema + Zod validation, all through the same external text-provider chain;
- photo analysis through the configured external vision-provider chain;
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

Translation is a fourth extraction `kind` and runs synchronously (bypassing the queue) through the same external text-provider chain used for apartment/vacancy/candidate extraction, keeping the interactive UI path low-latency.

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

Both text extraction/translation and vision are enabled by default in the provided Compose configuration. The default chains are `TEXT_PROVIDERS=groq,gemini,nvidia,huggingface,llm7,openrouter,mistral` and `VISION_PROVIDERS=groq,gemini,nvidia,huggingface,llm7,openrouter,mistral,cloudflare` - configure at least one provider's key in `.env`; unconfigured providers fail instantly and fall through, so it's fine to leave the full chain even with some keys blank. Provider failures fall through to the next configured provider; transient (rate-limit/5xx) failures enter a short cooldown for that provider. Text and vision draw from the same per-provider free-tier quotas, so watch `/metrics` (`textProviders` vs `visionProviders`) if one pipeline starts starving the other.

| Provider | Env var | Serves | Free tier (approx) | Get a key |
|---|---|---|---|---|
| Groq | `GROQ_API_KEY` | vision + text | model-dependent TPM limit | https://console.groq.com |
| Gemini | `GEMINI_API_KEY` | vision + text | ~15 RPM / 1,500 RPD | https://aistudio.google.com/apikey |
| NVIDIA NIM | `NVIDIA_API_KEY` | vision + text | ~40 RPM | https://build.nvidia.com |
| Hugging Face | `HUGGINGFACE_API_KEY` | vision + text | rate-limited, many models | https://huggingface.co/settings/tokens |
| llm7.io | `LLM7_API_KEY` | vision + text | ~30 RPM (120 with a key) | https://llm7.io - no registration needed for basic access; commercial-use terms undocumented |
| OpenRouter | `OPENROUTER_API_KEY` | vision + text | ~20 RPM / 200 RPD (`:free` models) | https://openrouter.ai/keys - commercial-use terms undocumented for free models |
| Mistral | `MISTRAL_API_KEY` | vision + text | ~1 RPS / 500K TPM (~1B tokens/month) | https://console.mistral.ai |
| Cloudflare Workers AI | `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` | vision only | 10K neurons/day | Cloudflare dashboard; also requires accepting the vision model's community license once per account |

Each provider has an optional `<PROVIDER>_TEXT_MODEL` env var for text/translation calls, separate from `<PROVIDER>_VISION_MODEL`; it defaults to the same model as the vision variant, so no extra configuration is required unless you want a cheaper/faster text-only model.

## Local development

Requires Node.js 24 LTS or newer.

```bash
npm ci
npm test
npm run check
cp sample.env .env
```

Create the shared network once and start the stack:

```bash
docker network create ai-net 2>/dev/null || true
docker compose --env-file .env up -d ai-worker
curl http://127.0.0.1:4030/health
```

Run the benchmark once at least one text/vision provider key is set:

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

## Connecting applications

```env
AI_WORKER_URL=http://ai-worker:4030
AI_WORKER_KEY=<same value as AI_API_KEY>
```

Attach caller backends to `ai-net`. Only backend code should call this service; do not expose model selection or prompts to browsers.

## Configuration

See `sample.env`. Important conservative defaults are:

```env
AI_CONCURRENCY=1
AI_TEXT_TIMEOUT_MS=120000
VISION_CONCURRENCY=1
AI_WORKER_CPUS=0.5
AI_WORKER_MEMORY_LIMIT=1g
```

`PROMPT_VERSION` and `SCHEMA_VERSION` are part of cache keys and result metadata. Increment the corresponding version when prompts or schemas change.

Do not commit `.env`; it contains internal credentials.
