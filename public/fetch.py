#!/usr/bin/env python3
"""Fetch Gaokao score segment data from Baidu API (2025, 物理类)."""

import json
import ssl
import urllib.request

PROVINCES = {
    12013: ("河北", 13008),
    12014: ("山西", 13008),
    12015: ("内蒙古", 13008),
    12021: ("辽宁", 13008),
    12022: ("吉林", 13008),
    12023: ("黑龙江", 13008),
    12032: ("江苏", 13008),
    12033: ("浙江", 13007),
    12034: ("安徽", 13008),
    12035: ("福建", 13008),
    12036: ("江西", 13008),
    12037: ("山东", 13007),
    12041: ("河南", 13008),
    12042: ("湖北", 13008),
    12043: ("湖南", 13008),
    12044: ("广东", 13008),
    12045: ("广西", 13008),
    12046: ("海南", 13007),
    12050: ("重庆", 13008),
    12051: ("四川", 13008),
    12052: ("贵州", 13008),
    12053: ("云南", 13008),
    12061: ("陕西", 13008),
    12062: ("甘肃", 13008),
    12063: ("青海", 13008),
    12064: ("宁夏", 13008),
}

API_URL = (
    "https://gaokao.baidu.com/gk/gkscoresegment/info?province={}&year=2025&category={}"
)
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}


def fetch_json(url):
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def process_province(pid, name, cat_id):
    url = API_URL.format(pid, cat_id)
    raw = fetch_json(url)
    data_list = raw.get("data", {}).get("list", [])
    if not data_list:
        raise ValueError(f"{name}: no data")

    seen = set()
    entries = []
    for segment in data_list:
        for item in segment.get("segList", []):
            mo, ms = item.get("maxOrder", "-"), item.get("minScore")
            if mo == "-" or ms is None:
                continue
            if int(item.get("maxScore", 0)) < 200:
                continue
            score, order = int(ms), int(mo)
            if (score, order) not in seen:
                seen.add((score, order))
                entries.append((score, order))

    entries.sort(key=lambda e: -e[0])
    return {name: {str(s): o for s, o in entries}}


def main():
    result = {}
    for pid, (name, cat_id) in PROVINCES.items():
        result.update(process_province(pid, name, cat_id))

    with open("gkdat.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
