#!/usr/bin/env python3
"""Build deterministic public summaries and feeds from reviewed decisions."""

from __future__ import annotations

import json
from email.utils import format_datetime
from pathlib import Path
from urllib.parse import quote
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom import minidom
from datetime import datetime


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
DATA = SITE / "data"
BASE_URL = "https://blsvcs.github.io/lemumu-radars/"


def read_json(path: Path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, value) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def number(value) -> float:
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else 0


def parsed_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def decision_url(project_id: str) -> str:
    return f"{BASE_URL}#review-{quote(project_id, safe='-')}"


def build_summary(reviews: dict, decisions: dict) -> dict:
    items = decisions.get("items", [])
    counted = [item for item in items if item.get("fiscal", {}).get("counted") is True]
    jobs = [
        item.get("apparatus", {}).get("jobsDelta")
        for item in items
        if isinstance(item.get("apparatus", {}).get("jobsDelta"), (int, float))
        and not isinstance(item.get("apparatus", {}).get("jobsDelta"), bool)
    ]
    bureaucracy = [item.get("bureaucracy", {}) for item in items if item.get("bureaucracy")]
    population = decisions.get("population", {}).get("value")
    one_off = sum(number(item.get("fiscal", {}).get("oneOff")) for item in counted)
    annual = sum(number(item.get("fiscal", {}).get("annual")) for item in counted)

    return {
        "schemaVersion": 1,
        "updatedAt": reviews.get("lastReview") or decisions.get("updatedAt"),
        "scope": {
            "reviewedDecisions": len(reviews.get("posts", [])),
            "measuredDecisions": len(items),
            "countedFiscalDecisions": len(counted),
            "population": decisions.get("population"),
        },
        "totals": {
            "oneOff": one_off,
            "annual": annual,
            "fiveYear": sum(number(item.get("fiscal", {}).get("fiveYear")) for item in counted),
            "tenYear": sum(number(item.get("fiscal", {}).get("tenYear")) for item in counted),
            "oneOffPerResident": one_off / population if population else None,
            "annualPerResident": annual / population if population else None,
            "jobsNet": sum(jobs) if jobs else None,
            "jobsQuantifiedDecisions": len(jobs),
            "bureaucracyIndex": sum(number(item.get("score")) for item in bureaucracy),
            "requirementsAdded": sum(number(item.get("requirementsAdded")) for item in bureaucracy),
            "requirementsRemoved": sum(number(item.get("requirementsRemoved")) for item in bureaucracy),
        },
        "composition": [
            {
                "id": item.get("id"),
                "source": item.get("source"),
                "oneOff": item.get("fiscal", {}).get("oneOff"),
                "annual": item.get("fiscal", {}).get("annual"),
                "fiveYear": item.get("fiscal", {}).get("fiveYear"),
                "jobsDelta": item.get("apparatus", {}).get("jobsDelta"),
                "bureaucracyIndex": item.get("bureaucracy", {}).get("score"),
                "requirementsAdded": item.get("bureaucracy", {}).get("requirementsAdded"),
                "requirementsRemoved": item.get("bureaucracy", {}).get("requirementsRemoved"),
            }
            for item in items
        ],
    }


def build_json_feed(reviews: dict) -> dict:
    posts = sorted(reviews.get("posts", []), key=lambda item: item.get("analyzedAt", ""), reverse=True)
    return {
        "version": "https://jsonfeed.org/version/1.1",
        "title": "Lēmumu radars",
        "home_page_url": BASE_URL,
        "feed_url": f"{BASE_URL}feed.json",
        "description": "Dokumentos balstīta Latvijas Ministru kabineta lēmumu ietekmes analīze.",
        "language": "lv",
        "items": [
            {
                "id": post["id"],
                "url": decision_url(post["id"]),
                "title": post.get("titles", {}).get("neutral", post["id"]),
                "summary": post.get("lead", ""),
                "content_text": post.get("lead", ""),
                "date_published": post.get("analyzedAt"),
                "tags": [post.get("ministry", ""), post.get("kind", "")],
            }
            for post in posts
        ],
    }


def build_rss(reviews: dict) -> str:
    root = Element("rss", {"version": "2.0"})
    channel = SubElement(root, "channel")
    SubElement(channel, "title").text = "Lēmumu radars"
    SubElement(channel, "link").text = BASE_URL
    SubElement(channel, "description").text = (
        "Dokumentos balstīta Latvijas Ministru kabineta lēmumu ietekmes analīze."
    )
    SubElement(channel, "language").text = "lv"
    if reviews.get("lastReview"):
        SubElement(channel, "lastBuildDate").text = format_datetime(parsed_datetime(reviews["lastReview"]))

    posts = sorted(reviews.get("posts", []), key=lambda item: item.get("analyzedAt", ""), reverse=True)
    for post in posts:
        item = SubElement(channel, "item")
        SubElement(item, "title").text = post.get("titles", {}).get("neutral", post["id"])
        url = decision_url(post["id"])
        SubElement(item, "link").text = url
        SubElement(item, "guid", {"isPermaLink": "true"}).text = url
        SubElement(item, "description").text = post.get("lead", "")
        if post.get("analyzedAt"):
            SubElement(item, "pubDate").text = format_datetime(parsed_datetime(post["analyzedAt"]))

    raw = tostring(root, encoding="utf-8")
    return minidom.parseString(raw).toprettyxml(indent="  ", encoding="utf-8").decode("utf-8")


def main() -> None:
    reviews = read_json(DATA / "reviews.json")
    decisions = read_json(DATA / "decisions.json")
    write_json(DATA / "summary.json", build_summary(reviews, decisions))
    write_json(SITE / "feed.json", build_json_feed(reviews))
    (SITE / "feed.xml").write_text(build_rss(reviews), encoding="utf-8")
    print(
        f"Publiskie atvasinājumi izveidoti: {len(reviews.get('posts', []))} publikācijas, "
        f"{len(decisions.get('items', []))} lēmumu metrikas."
    )


if __name__ == "__main__":
    main()
