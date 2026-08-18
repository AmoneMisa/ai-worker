FROM python:3.12-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    HF_HOME=/tmp/hf \
    TRANSFORMERS_CACHE=/tmp/hf

RUN pip install --no-cache-dir \
    ctranslate2==4.7.2 \
    "transformers[torch]==4.55.2" \
    sentencepiece==0.2.1

RUN mkdir -p /model/ct2 /model/tokenizer && \
    ct2-transformers-converter \
      --model facebook/m2m100_418M \
      --output_dir /model/ct2 \
      --quantization int8 \
      --force && \
    python - <<'PY'
from transformers import AutoTokenizer
AutoTokenizer.from_pretrained('facebook/m2m100_418M').save_pretrained('/model/tokenizer')
PY

FROM python:3.12-slim

ENV PIP_NO_CACHE_DIR=1 \
    PYTHONUNBUFFERED=1 \
    TRANSLATOR_MODEL_DIR=/model/ct2 \
    TRANSLATOR_TOKENIZER_DIR=/model/tokenizer \
    TRANSLATOR_THREADS=2 \
    OMP_NUM_THREADS=2

RUN pip install --no-cache-dir \
    ctranslate2==4.7.2 \
    transformers==4.55.2 \
    sentencepiece==0.2.1 \
    flask==3.1.1 \
    gunicorn==23.0.0

WORKDIR /app
COPY --from=builder /model /model
COPY app.py /app/app.py

EXPOSE 4040

CMD ["gunicorn", "--workers", "1", "--threads", "1", "--timeout", "60", "--bind", "0.0.0.0:4040", "app:app"]
