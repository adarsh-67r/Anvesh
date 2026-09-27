from app.trails.captions import fmt_ts, parse_json3, parse_text, parse_ts, shift_text, slice_text, lines_to_text, trim
from app.trails.youtube import parse_ref, pick_caption_url


def test_parse_json3_joins_segments():
    data = {"events": [
        {"tStartMs": 0, "segs": [{"utf8": "hello "}, {"utf8": "world"}]},
        {"tStartMs": 1500},
        {"tStartMs": 31000, "segs": [{"utf8": "\n"}]},
        {"tStartMs": 62000, "segs": [{"utf8": "binary search"}]},
    ]}
    lines = parse_json3(data)
    assert [(l.start, l.text) for l in lines] == [(0.0, "hello world"), (62.0, "binary search")]


def test_text_roundtrip_and_blocks():
    lines = parse_json3({"events": [{"tStartMs": s * 1000, "segs": [{"utf8": f"w{s}"}]} for s in (0, 10, 20, 40, 3700)]})
    text = lines_to_text(lines)
    assert text.splitlines() == ["[0:00] w0 w10 w20", "[0:40] w40", "[1:01:40] w3700"]
    assert [l.start for l in parse_text(text)] == [0, 40, 3700]


def test_slice_uses_absolute_time():
    text = "[0:00] intro\n[10:00] arrays\n[42:10] bfs\n[1:05:00] dfs"
    assert slice_text(text, 2530, 3900) == "[42:10] bfs"
    assert slice_text(text, None, None) == text


def test_shift_clip_relative_to_absolute():
    assert shift_text("[0:30] queue\n[2:00] visited", 2530) == "[42:40] queue\n[44:10] visited"


def test_ts_helpers():
    assert fmt_ts(750) == "12:30" and fmt_ts(3725) == "1:02:05"
    assert parse_ts("12:30") == 750 and parse_ts("1:02:05") == 3725 and parse_ts("x") is None


def test_trim_keeps_evenly_spaced_lines():
    text = "\n".join(f"[{i}:00] line{i}" for i in range(100))
    out = trim(text, 200)
    assert len(out) <= 200 and out.startswith("[0:00] line0")


def test_parse_ref():
    assert parse_ref("https://youtube.com/playlist?list=PLauivoElc3ggagradg8MfOZreCMmXMmJ-&si=x") == ("playlist", "PLauivoElc3ggagradg8MfOZreCMmXMmJ-")
    assert parse_ref("https://youtu.be/OMcxQ3IY-qc?t=4") == ("video", "OMcxQ3IY-qc")
    assert parse_ref("https://www.youtube.com/watch?v=OMcxQ3IY-qc&list=PLx") == ("playlist", "PLx")
    assert parse_ref("https://example.com") is None


def test_pick_caption_prefers_manual_then_original_auto():
    info = {
        "subtitles": {},
        "automatic_captions": {
            "fr": [{"ext": "json3", "url": "fr"}],
            "hi-orig": [{"ext": "vtt", "url": "v"}, {"ext": "json3", "url": "hi-orig"}],
            "en": [{"ext": "json3", "url": "en-auto"}],
        },
    }
    assert pick_caption_url(info) == "hi-orig"
    info["subtitles"] = {"en": [{"ext": "json3", "url": "en-manual"}]}
    assert pick_caption_url(info) == "en-manual"
    assert pick_caption_url({"subtitles": {}, "automatic_captions": {}}) is None
