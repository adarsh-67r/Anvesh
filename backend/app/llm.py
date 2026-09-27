import asyncio
import json

from google import genai
from google.genai import errors

from app.config import settings

# ponytail: primary twice, then a lighter fallback model; revisit when Gemini capacity stabilises
ATTEMPTS = ["gemini-3.8-flash", "gemini-3.8-flash", "gemini-flash-lite-latest"]


# Structured tasks (quiz JSON, transcription) don't need reasoning; thinking made them ~6x slower.
FAST = genai.types.GenerateContentConfig(thinking_config=genai.types.ThinkingConfig(thinking_budget=0))


async def generate(contents, config=None) -> str:
    client = genai.Client(api_key=settings.gemini_api_key)
    for i, model in enumerate(ATTEMPTS):
        try:
            response = await client.aio.models.generate_content(model=model, contents=contents, config=config)
            return response.text or ""
        except errors.APIError as e:
            if e.code not in (429, 500, 503) or i == len(ATTEMPTS) - 1:
                raise
            await asyncio.sleep(1)

LOW_RES_VIDEO = genai.types.GenerateContentConfig(
    thinking_config=genai.types.ThinkingConfig(thinking_budget=0),
    media_resolution=genai.types.MediaResolution.MEDIA_RESOLUTION_LOW,
)


def parse_json(text: str):
    """Parse a model reply that should be JSON, tolerating a
