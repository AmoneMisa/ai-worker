import os
import re
import time
from flask import Flask, jsonify, request
import ctranslate2
from transformers import AutoTokenizer

MODEL_DIR = os.getenv('TRANSLATOR_MODEL_DIR', '/model/ct2')
TOKENIZER_DIR = os.getenv('TRANSLATOR_TOKENIZER_DIR', '/model/tokenizer')
THREADS = max(1, int(os.getenv('TRANSLATOR_THREADS', '2')))
MAX_SOURCE_TOKENS = max(128, int(os.getenv('TRANSLATOR_MAX_SOURCE_TOKENS', '420')))

app = Flask(__name__)
translator = ctranslate2.Translator(
    MODEL_DIR,
    device='cpu',
    compute_type='int8',
    inter_threads=1,
    intra_threads=THREADS,
)
tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_DIR, local_files_only=True)

TARGETS = {
    'Russian': 'ru',
    'ru': 'ru',
    'English': 'en',
    'en': 'en',
}

UZ_LATIN = {
    'xonali', 'xona', 'kvartira', 'ijara', 'arenda', 'beriladi', 'beraman', 'uy',
    'qavat', 'etaj', 'yangi', 'remont', 'bor', 'yoq', "yo'q", 'uchun', 'bilan',
    'mahalla', 'tuman', 'tumani', 'oy', 'oldindan', 'sotiladi', 'sharoit',
    'joylashgan', 'mebel', 'texnika', 'oila', 'oilaga', 'faqat', 'manzil',
    'mojal', 'orientir', 'komissiyasiz', 'depozit', 'predoplata', 'narxi', 'kelishiladi',
}
# Uzbek Cyrillic often appears without the distinctive қ/ғ/ҳ/ў letters, so script
# detection alone misclassifies perfectly normal listings as Russian. Keep this
# vocabulary domain-specific and require multiple signals before overriding ru.
UZ_CYRILLIC = {
    'ижара', 'ижарага', 'берилади', 'бераман', 'сотилади', 'хона', 'хонали', 'уй',
    'квартира', 'кават', 'қават', 'янги', 'таъмир', 'ремонт', 'бор', 'йук', 'йўқ',
    'учун', 'билан', 'махалла', 'маҳалла', 'туман', 'тумани', 'шахар', 'шаҳар',
    'шахрида', 'шаҳрида', 'куча', 'кучаси', 'кучасида', 'кўчаси', 'кўчасида',
    'ой', 'олдиндан', 'шароит', 'жойлашган', 'мебель', 'техника', 'оила', 'оилага',
    'факат', 'фақат', 'манзил', 'мулжал', 'мўлжал', 'нархи', 'келишилади',
    'якин', 'яқин', 'ёнида', 'рупарасида', 'рўпарасида',
}
EN_WORDS = {
    'the', 'and', 'for', 'with', 'apartment', 'rent', 'rental', 'bedroom', 'rooms',
    'floor', 'building', 'new', 'renovated', 'deposit', 'month', 'owner', 'located',
    'near', 'available', 'furnished', 'parking', 'address', 'price', 'city',
}


def detect_language(text: str) -> tuple[str, float]:
    """Small domain detector for the languages this site translates most often."""
    value = text.lower()
    letters = re.findall(r'[a-zа-яёқғҳў]+', value, flags=re.IGNORECASE)
    if not letters:
        return 'uz', 0.55

    words = {w.strip("'’`ʻʼ-") for w in letters}
    cyr = len(re.findall(r'[а-яёқғҳў]', value, flags=re.IGNORECASE))
    lat = len(re.findall(r'[a-z]', value, flags=re.IGNORECASE))
    if cyr > lat:
        distinctive_uz = bool(re.search(r'[қғҳў]', value, flags=re.IGNORECASE))
        uz_cyr_score = len(words & UZ_CYRILLIC)
        if distinctive_uz or uz_cyr_score >= 2:
            return 'uz', min(0.98, 0.82 + uz_cyr_score * 0.03)
        return 'ru', 0.82

    uz_score = len(words & UZ_LATIN)
    en_score = len(words & EN_WORDS)
    if en_score >= 2 and en_score > uz_score * 1.5:
        return 'en', min(0.98, 0.70 + en_score * 0.04)
    if uz_score:
        return 'uz', min(0.98, 0.72 + uz_score * 0.04)
    # Real-estate Latin text in the supported feeds is predominantly Uzbek.
    return 'uz', 0.60


def token_count(text: str) -> int:
    return len(tokenizer.encode(text, add_special_tokens=True))


def chunk_line(line: str) -> list[str]:
    if token_count(line) <= MAX_SOURCE_TOKENS:
        return [line]
    words = line.split()
    chunks, current = [], []
    for word in words:
        candidate = ' '.join([*current, word])
        if current and token_count(candidate) > MAX_SOURCE_TOKENS:
            chunks.append(' '.join(current))
            current = [word]
        else:
            current.append(word)
    if current:
        chunks.append(' '.join(current))
    return chunks or [line]


def translate_text(text: str, source: str, target: str) -> str:
    if source == target:
        return text

    tokenizer.src_lang = source
    original_lines = text.split('\n')
    segments = []
    line_segment_indexes = []

    for line in original_lines:
        if not line.strip():
            line_segment_indexes.append([])
            continue
        indexes = []
        for chunk in chunk_line(line):
            indexes.append(len(segments))
            segments.append(chunk)
        line_segment_indexes.append(indexes)

    if not segments:
        return text

    encoded = [tokenizer.convert_ids_to_tokens(tokenizer.encode(segment)) for segment in segments]
    target_prefix = [[tokenizer.lang_code_to_token[target]] for _ in encoded]
    results = translator.translate_batch(
        encoded,
        target_prefix=target_prefix,
        beam_size=1,
        max_batch_size=16,
        batch_type='examples',
    )

    translated_segments = []
    for result in results:
        # M2M100 returns the forced target-language token as the first hypothesis token.
        target_tokens = result.hypotheses[0][1:]
        ids = tokenizer.convert_tokens_to_ids(target_tokens)
        translated_segments.append(tokenizer.decode(ids, skip_special_tokens=True).strip())

    translated_lines = []
    for indexes in line_segment_indexes:
        if not indexes:
            translated_lines.append('')
        else:
            translated_lines.append(' '.join(translated_segments[i] for i in indexes).strip())
    return '\n'.join(translated_lines)


@app.get('/health')
def health():
    return jsonify({'ok': True, 'model': 'facebook/m2m100_418M', 'engine': 'ctranslate2-int8'})


@app.post('/translate')
def translate_endpoint():
    payload = request.get_json(silent=True) or {}
    text = payload.get('text')
    target = TARGETS.get(str(payload.get('targetLanguage') or ''))
    if not isinstance(text, str) or not text.strip():
        return jsonify({'error': 'missing text'}), 400
    if not target:
        return jsonify({'error': 'unsupported target language'}), 400

    started = time.perf_counter()
    source, detector_confidence = detect_language(text)
    translated = translate_text(text, source, target)
    duration_ms = round((time.perf_counter() - started) * 1000)

    return jsonify({
        'translatedText': translated,
        'sourceLanguage': source,
        'confidence': detector_confidence,
        'engine': 'm2m100-418m-ctranslate2-int8',
        'timings': {'totalMs': duration_ms},
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=4040)
