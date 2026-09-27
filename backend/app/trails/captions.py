"""Lecture text as timestamped lines: '[m:ss] words'. All times are absolute seconds into the video."""

import re
from dataclasses import dataclass

BLOCK = 30
_TS = re.compile(r"^\[(\d+(?::\d{2}){1,2})\]\s?(.*)$")


@dataclass(frozen=True)
class Line:
    start: float
    text: str


def fmt_ts(sec: float) -> str:
    sec = int(sec)
    h, m, s = sec // 3600, sec % 3600 // 60, sec % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def parse_ts(s: str) -> int | None:
    try:
        parts = [int(p) for p in str(s).strip().split(":")]
    except ValueError:
        return None
    if not 2 <= len(parts) <= 3:
        return None
    total = 0
    for p in parts:
        total = total * 60 + p
    return total


def parse_json3(data: dict) -> list[Line]:
    out = []
    for ev in data.get("events") or []:
        text = "".join(s.get("utf8", "") for s in ev.get("segs") or []).replace("\n", " ").strip()
        if text:
            out.append(Line(ev.get("tStartMs", 0) / 1000, text))
    return out


def lines_to_text(lines: list[Line]) -> str:
    blocks: list[tuple[float, list[str]]] = []
    for line in lines:
        if blocks and line.start - blocks[-1][0] < BLOCK:
            blocks[-1][1].append(line.text)
        else:
            blocks.append((line.start, [line.text]))
    return "\n".join(f"[{fmt_ts(start)}] {' '.join(words)}" for start, words in blocks)


def parse_text(text: str) -> list[Line]:
    out = []
    for raw in text.splitlines():
        m = _TS.match(raw.strip())
        if m and (sec := parse_ts(m.group(1))) is not None:
            out.append(Line(sec, m.group(2)))
    return out


def slice_text(text: str, start: int | None, end: int | None) -> str:
    if start is None and end is None:
        return text
    lo, hi = start or 0, end if end is not None else float("inf")
    return "\n".join(f"[{fmt_ts(l.start)}] {l.text}" for l in parse_text(text) if lo <= l.start < hi)


def shift_text(text: str, offset: int) -> str:
    return "\n".join(f"[{fmt_ts(l.start + offset)}] {l.text}" for l in parse_text(text))


def trim(text: str, max_chars: int) -> str:
    """Keep evenly spaced lines so the whole lecture stays represented."""
    if len(text) <= max_chars:
        return text
    lines = text.splitlines()
    step = len(text) / max_chars
    kept, size = [], 0
    for i in range(0, len(lines), max(1, round(step))):
        if size + len(lines[i]) + 1 > max_chars:
            break
        kept.append(lines[i])
        size += len(lines[i]) + 1
    return "\n".join(kept)
