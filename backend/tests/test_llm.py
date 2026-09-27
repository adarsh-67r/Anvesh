from google import genai

from app.llm import FAST, LOW_RES_VIDEO, PRIMARY, config_for


def test_primary_keeps_config():
    assert config_for(PRIMARY, FAST) is FAST


def test_fallback_drops_thinking_but_keeps_media_resolution():
    cfg = config_for("gemini-3.1-flash-lite", LOW_RES_VIDEO)
    assert cfg.thinking_config is None
    assert cfg.media_resolution == genai.types.MediaResolution.MEDIA_RESOLUTION_LOW
    assert config_for("gemini-3.1-flash-lite", None) is None
