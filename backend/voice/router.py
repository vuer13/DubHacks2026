"""ElevenLabs text-to-speech proxy for short TrailSense warnings."""

from __future__ import annotations

import hashlib
import logging
import os
from pathlib import Path
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import Field, field_validator

from .. import config as _config
from ..models import TrailSenseModel

router = APIRouter(prefix="/api/voice", tags=["voice"])
LOGGER = logging.getLogger(__name__)
TTS_CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "tts"
ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream"


class TTSRequest(TrailSenseModel):
    text: str = Field(min_length=1, max_length=300)

    @field_validator("text")
    @classmethod
    def text_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("text cannot be blank")
        return value


@router.post("/tts", response_class=Response)
async def text_to_speech(request: TTSRequest) -> Response:
    """Return cached ElevenLabs speech for a short warning.

    Example:
        curl -X POST http://localhost:8000/api/voice/tts \\
          -H 'Content-Type: application/json' \\
          -d '{"text":"Roots ahead, slow down"}' --output warning.mp3
    """
    api_key = os.getenv("ELEVENLABS_API_KEY")
    voice_id = os.getenv("ELEVENLABS_VOICE_ID")
    if not api_key or not voice_id:
        raise HTTPException(status_code=503, detail="ElevenLabs speech is not configured")

    model_id = os.getenv("ELEVENLABS_TTS_MODEL", "eleven_flash_v2_5")
    digest = hashlib.sha256(f"{model_id}:{voice_id}:{request.text}".encode()).hexdigest()
    cached_file = TTS_CACHE_DIR / f"{digest}.mp3"
    if cached_file.is_file():
        return Response(content=cached_file.read_bytes(), media_type="audio/mpeg")

    url = ELEVENLABS_TTS_URL.format(voice_id=quote(voice_id, safe=""))
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            upstream = await client.post(
                url,
                params={"output_format": "mp3_22050_32"},
                headers={"xi-api-key": api_key, "Accept": "audio/mpeg"},
                json={
                    "text": request.text,
                    "model_id": model_id,
                    "voice_settings": {
                        "stability": 0.7,
                        "similarity_boost": 0.75,
                        "speed": 1.1,
                    },
                },
            )
            upstream.raise_for_status()
    except httpx.HTTPStatusError as exc:
        LOGGER.error("ElevenLabs TTS returned HTTP %s", exc.response.status_code)
        raise HTTPException(
            status_code=502,
            detail="ElevenLabs speech is temporarily unavailable",
        ) from exc
    except httpx.HTTPError as exc:
        LOGGER.warning("ElevenLabs TTS request failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=502,
            detail="ElevenLabs speech is temporarily unavailable",
        ) from exc

    audio = upstream.content
    try:
        TTS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cached_file.write_bytes(audio)
    except OSError:
        LOGGER.exception("Could not cache ElevenLabs TTS output")
    return Response(content=audio, media_type="audio/mpeg")
