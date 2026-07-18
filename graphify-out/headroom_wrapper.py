"""Headroom compression wrapper for graphify extraction pipeline.
Compresses prompt chunks before LLM submission to reduce token usage.
"""
import json, os, sys
from pathlib import Path
from headroom import SmartCrusher, CacheAligner, TransformPipeline, CompressConfig

def compress_prompt(text: str, context: str = "json") -> str:
    """Compress prompt text using headroom's smart compression."""
    pipeline = TransformPipeline([
        CacheAligner(),
        SmartCrusher(CompressConfig(max_array_length=200))
    ])
    result = pipeline.transform({"role": "user", "content": text})
    return result.get("content", text)

def compress_chunk_file(chunk_path: str) -> dict:
    """Read a chunk file, compress it, return compression stats."""
    data = json.loads(Path(chunk_path).read_text(encoding="utf-8"))
    raw = json.dumps(data)
    compressed = compress_prompt(raw)
    savings = (1 - len(compressed) / len(raw)) * 100 if len(raw) > 0 else 0
    return {
        "path": chunk_path,
        "original_chars": len(raw),
        "compressed_chars": len(compressed),
        "savings_pct": round(savings, 1)
    }

def compress_directory(dir_path: str) -> list:
    """Compress all chunk files in a directory."""
    results = []
    for f in sorted(Path(dir_path).glob(".graphify_chunk_*.json")):
        results.append(compress_chunk_file(str(f)))
    return results

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "stats"
    target = sys.argv[2] if len(sys.argv) > 2 else "."

    if mode == "compress":
        results = compress_directory(target)
        total_orig = sum(r["original_chars"] for r in results)
        total_comp = sum(r["compressed_chars"] for r in results)
        avg = (1 - total_comp/total_orig)*100 if total_orig else 0
        print(f"Headroom: compressed {len(results)} chunks, {total_orig} -> {total_comp} chars ({avg:.1f}% savings)")
        summary = {"results": results, "total_original_chars": total_orig, "total_compressed_chars": total_comp}
        Path(Path(target) / ".headroom_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    elif mode == "stats":
        stats_path = Path(target) / ".headroom_summary.json"
        if stats_path.exists():
            s = json.loads(stats_path.read_text(encoding="utf-8"))
            print(f"Headroom: {len(s['results'])} chunks, "
                  f"{s['total_original_chars']} -> {s['total_compressed_chars']} chars "
                  f"({(1-s['total_compressed_chars']/s['total_original_chars'])*100:.1f}% savings)")
        else:
            print("Headroom: no compression stats found (run 'compress' mode first)")
