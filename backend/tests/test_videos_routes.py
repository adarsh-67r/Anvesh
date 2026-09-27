from app.main import app


def test_no_unauthenticated_lesson_listing():
    """Lessons are listed via /api/recommend/videos (scoped); the old open route leaked private lessons."""
    assert "get" not in app.openapi()["paths"].get("/api/videos/{skill_id}", {})
