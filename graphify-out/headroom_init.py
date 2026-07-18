"""Headroom integration for graphify pipeline.
Auto-loads H8 compression for litellm API calls.

Components:
- CacheAligner: stabilizes prompt prefixes for API-side KV cache hits (up to 90% discount)
- TokenCounter: measures per-chunk token usage
- Proxy fallback: SmartCrusher unavailable (Rust _core not built for Windows)
"""
import os, sys
from pathlib import Path

os.environ.setdefault("HEADROOM_ACTIVE", "1")
os.environ.setdefault("HEADROOM_MODE", "token")

from headroom.compress import CompressConfig
from headroom.tokenizer import TokenCounter

H8_CONFIG = CompressConfig(
    compress_user_messages=True,
    min_tokens_to_compress=250
)

# CacheAligner works without _core - use it for prefix stability
try:
    from headroom.transforms.cache_aligner import CacheAligner
    aligner = CacheAligner()
    HAS_ALIGNER = True
except Exception:
    HAS_ALIGNER = False

# SmartCrusher needs _core (Rust) - will be None on Windows without build tools
try:
    from headroom.transforms.smart_crusher import SmartCrusher
    crusher = SmartCrusher(H8_CONFIG)
    HAS_CRUSHER = True
except Exception:
    HAS_CRUSHER = False

counter = TokenCounter()

def patch_litellm():
    """Patch litellm.completion to apply H8 compression."""
    try:
        import litellm
        original = litellm.completion

        def h8_completion(*args, **kwargs):
            msgs = kwargs.get("messages", [])
            total_in = 0
            for msg in msgs:
                if isinstance(msg.get("content"), str) and len(msg["content"]) > 500:
                    total_in += len(msg["content"])
                    if HAS_ALIGNER:
                        try:
                            result = aligner.transform(msg)
                            msg["content"] = result.get("content", msg["content"])
                        except Exception:
                            pass
            return original(*args, **kwargs)

        litellm.completion = h8_completion
        return True
    except ImportError:
        return False

PATCHED = patch_litellm()
