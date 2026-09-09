#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


def load_report(path):
    value = json.loads(Path(path).read_text())
    return value.get("report", value)


def scores(report):
    return {item["criterion_id"]: item for item in report["assessments"]}


def compare_reference(site, report, reference):
    actual = scores(report)
    checks = []
    for criterion_id, expected in reference["criteria"].items():
        score = actual.get(criterion_id, {}).get("score")
        checks.append({
            "criterion_id": criterion_id,
            "score": score,
            "min": expected["min"],
            "max": expected["max"],
            "in_range": score is not None and expected["min"] <= score <= expected["max"],
            "citation": bool(actual.get(criterion_id, {}).get("citations")),
        })
    verdict = report["verdict"]["label"]
    return {
        "site": site,
        "anchor_checks": len(checks),
        "anchor_in_range": sum(item["in_range"] for item in checks),
        "anchor_cited": sum(item["citation"] for item in checks),
        "verdict": verdict,
        "verdict_in_range": verdict in reference["expected_verdicts"],
        "failures": [item for item in checks if not item["in_range"]],
    }


def compare_repeat(site, first, second):
    left, right = scores(first), scores(second)
    paired = [(left[key]["score"], right[key]["score"]) for key in left
              if left[key].get("score") is not None and right.get(key, {}).get("score") is not None]
    deltas = [abs(a - b) for a, b in paired]
    status_agreement = sum(left[key].get("evidence_status") == right.get(key, {}).get("evidence_status") for key in left)
    return {
        "site": site,
        "paired_criteria": len(paired),
        "exact_score_agreement": round(sum(delta == 0 for delta in deltas) / len(deltas), 4) if deltas else 0,
        "within_one_agreement": round(sum(delta <= 1 for delta in deltas) / len(deltas), 4) if deltas else 0,
        "mean_absolute_delta": round(sum(deltas) / len(deltas), 4) if deltas else None,
        "evidence_status_agreement": round(status_agreement / len(left), 4),
        "raw_scores": [first["score"]["raw"], second["score"]["raw"]],
        "verdicts": [first["verdict"]["label"], second["verdict"]["label"]],
    }


def assignments(values):
    result = {}
    for value in values:
        name, separator, path = value.partition("=")
        if not separator:
            raise SystemExit(f"Expected SITE=PATH, got {value!r}")
        result[name] = path
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", default=str(Path(__file__).with_name("reviewed-anchor-v1.json")))
    parser.add_argument("--report", action="append", default=[], metavar="SITE=PATH")
    parser.add_argument("--repeat", action="append", default=[], metavar="SITE=PATH")
    args = parser.parse_args()
    reference = json.loads(Path(args.reference).read_text())["sites"]
    reports, repeats = assignments(args.report), assignments(args.repeat)
    output = {"reference": [], "repeatability": []}
    for site, path in reports.items():
        if site not in reference:
            raise SystemExit(f"No reference for {site}")
        report = load_report(path)
        output["reference"].append(compare_reference(site, report, reference[site]))
        if site in repeats:
            output["repeatability"].append(compare_repeat(site, report, load_report(repeats[site])))
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
