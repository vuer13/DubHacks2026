"""Load backend-only environment values from backend/.env for local runs."""

from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")
