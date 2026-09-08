#!/usr/bin/env python3
"""Fail fast when the public dashboard contract is inconsistent."""

from __future__ import annotations

import json
from pathlib import Path
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
DATA = SITE / "data"


def read_json(path: Path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def https(value, label: str) -> None:
    assert isinstance(value, str) and value.startswith("https://"), f"{label}: vajadzīga HTTPS saite"


def optional_nonnegative(value, label: str) -> None:
    assert value is None or (
        isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0
    ), f"{label}: vajadzīgs nenegatīvs skaitlis vai null"


def main() -> None:
    reviews = read_json(DATA / "reviews.json")
    decisions = read_json(DATA / "decisions.json")
    summary = read_json(DATA / "summary.json")
    feed = read_json(SITE / "feed.json")
    ElementTree.parse(SITE / "feed.xml")

    posts = reviews.get("posts", [])
    post_ids = {post.get("id") for post in posts}
    items = decisions.get("items", [])
    ids = [item.get("id") for item in items]
    assert len(ids) == len(set(ids)), "decisions.json ir dublēti projektu ID"
    assert set(ids) <= post_ids, "lēmuma metrikai nav atbilstošas pārbaudītas publikācijas"

    population = decisions.get("population", {})
    assert isinstance(population.get("value"), int) and population["value"] > 0
    https(population.get("source"), "iedzīvotāju skaita avots")

    for item in items:
        project_id = item.get("id", "bez ID")
        https(item.get("source"), f"{project_id} avots")
        assert item.get("summary"), f"{project_id}: trūkst kopsavilkuma"
        assert item.get("impacts"), f"{project_id}: trūkst ietekmēto grupu"

        fiscal = item.get("fiscal", {})
        for key in ("oneOff", "annual", "fiveYear", "tenYear"):
            optional_nonnegative(fiscal.get(key), f"{project_id} fiscal.{key}")
        assert isinstance(fiscal.get("counted"), bool), f"{project_id}: trūkst counted pazīmes"
        https(fiscal.get("source"), f"{project_id} fiskālais avots")

        bureaucracy = item.get("bureaucracy", {})
        score = bureaucracy.get("score")
        assert isinstance(score, int) and -5 <= score <= 5, f"{project_id}: indekss nav −5…+5"
        for key in ("requirementsAdded", "requirementsRemoved"):
            optional_nonnegative(bureaucracy.get(key), f"{project_id} bureaucracy.{key}")
        assert bureaucracy.get("explanation"), f"{project_id}: trūkst indeksa pamatojuma"
        https(bureaucracy.get("source"), f"{project_id} birokrātijas avots")

        apparatus = item.get("apparatus", {})
        jobs = apparatus.get("jobsDelta")
        assert jobs is None or (isinstance(jobs, int) and not isinstance(jobs, bool)), (
            f"{project_id}: jobsDelta vajadzīgs vesels skaitlis vai null"
        )

        urgency = item.get("urgency", {})
        assert isinstance(urgency.get("flag"), bool), f"{project_id}: trūkst steidzamības pazīmes"
        assert urgency.get("reason"), f"{project_id}: trūkst steidzamības pamatojuma"
        https(urgency.get("source"), f"{project_id} steidzamības avots")

    assert summary.get("scope", {}).get("reviewedDecisions") == len(posts)
    assert summary.get("scope", {}).get("measuredDecisions") == len(items)
    assert len(feed.get("items", [])) == len(posts)

    html = (SITE / "index.html").read_text(encoding="utf-8")
    for identifier in (
        "overview", "top", "analysis", "costs", "bureaucracy", "ministries",
        "changes", "database", "meetings", "coverage", "method",
    ):
        assert f'id="{identifier}"' in html, f"index.html trūkst #{identifier}"
    for asset in ("style.css", "app.js", "feed.xml", "feed.json"):
        assert (SITE / asset).exists(), f"trūkst site/{asset}"
        assert asset in html, f"index.html nav atsauces uz {asset}"

    print(f"Publiskās vietnes pārbaudes izturētas: {len(items)} lēmumu metrikas, {len(posts)} publikācijas.")


if __name__ == "__main__":
    main()
