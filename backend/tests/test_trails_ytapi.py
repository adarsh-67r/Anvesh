from app.trails.youtube import chapters_from_description, iso_seconds


def test_iso_duration():
    assert iso_seconds("PT1H2M3S") == 3723
    assert iso_seconds("PT45S") == 45
    assert iso_seconds("P1DT1S") == 86401
    assert iso_seconds("") is None


def test_chapters_from_description():
    desc = "Intro text\n0:00 Intro\n1:30 Arrays\n1:02:05 - Graphs\nthanks"
    assert chapters_from_description(desc, 4000) == [
        {"start_time": 0, "end_time": 90, "title": "Intro"},
        {"start_time": 90, "end_time": 3725, "title": "Arrays"},
        {"start_time": 3725, "end_time": 4000, "title": "Graphs"},
    ]


def test_no_chapters_unless_they_start_at_zero_and_count_three():
    assert chapters_from_description("1:00 a\n2:00 b\n3:00 c", 400) == []
    assert chapters_from_description("0:00 a\n2:00 b", 400) == []
