import asyncio
import json

from google import genai
from google.genai import errors

from app.config import settings

PRIMARY = "gemini-3.8-flash"
# Free-tier quotas are per model per day, so falling back across models multiplies the daily budget.
# ponytail: static chain; move to a paid key or a quota-aware router if usage grows
ATTEMPTS = [PRIMARY, PRIMARY, "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"]


# Structured tasks (quiz JSON, transcription) don't need reasoning; thinking made them ~6x slower.
FAST = genai.types.GenerateContentConfig(thinking_config=genai.types.ThinkingConfig(thinking_budget=0))


def config_for(model: str, config):
    """Fallback models reject thinking_budget; drop it and keep the rest."""
    if model == PRIMARY or config is None or config.thinking_config is None:
        return config
    return config.model_copy(update={"thinking_config": None})


async def generate(contents, config=None) -> str:
    client = genai.Client(
        api_key=settings.gemini_api_key,
        http_options=genai.types.HttpOptions(retry_options=genai.types.HttpRetryOptions(attempts=1)),
    )
    last, quota_hit = len(ATTEMPTS) - 1, False
    for i, model in enumerate(ATTEMPTS):
        if i and model == ATTEMPTS[i - 1] and quota_hit:
            continue
        quota_hit = False
        try:
            response = await client.aio.models.generate_content(model=model, contents=contents, config=config_for(model, config))
            return response.text or ""
        except errors.APIError as e:
            quota_hit = e.code == 429
            if e.code not in (400, 404, 429, 500, 503) or i == last or (e.code == 400 and model == PRIMARY):
                raise
            await asyncio.sleep(0 if quota_hit else 1)
    raise RuntimeError("unreachable")


LOW_RES_VIDEO = genai.types.GenerateContentConfig(
    thinking_config=genai.types.ThinkingConfig(thinking_budget=0),
    media_resolution=genai.types.MediaResolution.MEDIA_RESOLUTION_LOW,
)


LOW_RES_VIDEO = genai.types.GenerateContentConfig(
    thinking_config=genai.types.ThinkingConfig(thinking_budget=0),
    media_resolution=genai.types.MediaResolution.MEDIA_RESOLUTION_LOW,
)


def parse_json(text: str):
    """Parse a model reply that should be JSON, tolerating a ``` fence."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return json.loads(text)
