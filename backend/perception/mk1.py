"""Shared Perceptron client factory for perception and fall confirmation."""

from functools import lru_cache
import os

from perceptron import Client


@lru_cache(maxsize=1)
def get_client() -> Client:
    """Create one API client and reuse it across backend modules."""
    api_key = os.getenv("PERCEPTRON_API_KEY")
    if not api_key:
        raise RuntimeError("PERCEPTRON_API_KEY is not configured")
    return Client(api_key=api_key)


def get_model_name() -> str:
    """Return the configured model name, defaulting to the project model."""
    return os.getenv("PERCEPTRON_MODEL", "perceptron-mk1.5")
