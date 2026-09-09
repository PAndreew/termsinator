#!/usr/bin/env python3
import argparse
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from termsinator_processor.discovery import Discoverer


def check(site):
    started = time.monotonic()
    try:
        result = Discoverer().discover(site["url"])
        urls = [document.url for document in result.documents]
        matched = [any(re.search(pattern, url) for url in urls) for pattern in site["required"]]
        return {
            "name": site["name"],
            "required_found": sum(matched),
            "required_total": len(matched),
            "recall": round(sum(matched) / len(matched), 4),
            "documents": len(urls),
            "pages_visited": result.pages_visited,
            "seconds": round(time.monotonic() - started, 2),
            "missing_patterns": [pattern for pattern, found in zip(site["required"], matched) if not found],
            "urls": urls,
        }
    except Exception as error:
        return {"name": site["name"], "error": f"{type(error).__name__}: {error}", "recall": 0}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--gold", default=str(Path(__file__).with_name("discovery-gold-v1.json")))
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    sites = json.loads(Path(args.gold).read_text())["sites"]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(check, site) for site in sites]
        results = [future.result() for future in as_completed(futures)]
    results.sort(key=lambda result: [site["name"] for site in sites].index(result["name"]))
    total_found = sum(result.get("required_found", 0) for result in results)
    total_required = sum(result.get("required_total", len(sites[index]["required"])) for index, result in enumerate(results))
    print(json.dumps({
        "required_recall": round(total_found / total_required, 4),
        "sites_complete": sum(result.get("recall") == 1 for result in results),
        "sites_total": len(results),
        "results": results,
    }, indent=2))


if __name__ == "__main__":
    main()
