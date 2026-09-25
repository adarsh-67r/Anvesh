from typing import Protocol


class SkillStateProvider(Protocol):
    """Stable contract across all recommendation phases (0 through 4).

    Every phase implements this. Callers never know which phase is active.
    When migrating to Arithi, this interface is the integration contract.
    """

    async def get_skill_mastery(self, user_id: str, skill_id: str) -> float:
        """Return mastery score 0.0-1.0 for a single skill."""
        ...

    async def get_next_recommended_skills(self, user_id: str, limit: int = 3) -> list[dict]:
        """Return top-K recommended skills with metadata."""
        ...

    async def get_dropout_risk(self, user_id: str) -> float:
        """Return dropout risk 0.0-1.0. Higher = more likely to drop out."""
        ...
