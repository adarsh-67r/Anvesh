import json
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class SkillNode:
    id: str
    label: str
    depth: int
    subject: str
    grade: int
    prerequisites: list[str] = field(default_factory=list)
    questions: list[dict] = field(default_factory=list)


class KnowledgeGraph:
    def __init__(self, nodes: list[SkillNode]):
        self._nodes: dict[str, SkillNode] = {n.id: n for n in nodes}
        self._validate_dag()

    def _validate_dag(self):
        visited: set[str] = set()
        stack: set[str] = set()

        def dfs(node_id: str):
            if node_id in stack:
                raise ValueError(f"Cycle detected involving {node_id}")
            if node_id in visited:
                return
            stack.add(node_id)
            for prereq in self._nodes[node_id].prerequisites:
                if prereq not in self._nodes:
                    raise ValueError(f"Unknown prerequisite {prereq} in {node_id}")
                dfs(prereq)
            stack.remove(node_id)
            visited.add(node_id)

        for nid in self._nodes:
            dfs(nid)

    def get_node(self, skill_id: str) -> SkillNode | None:
        return self._nodes.get(skill_id)

    def get_all_nodes(self) -> list[SkillNode]:
        return list(self._nodes.values())

    def get_prerequisites(self, skill_id: str) -> list[str]:
        node = self._nodes.get(skill_id)
        return node.prerequisites if node else []

    def get_unmastered_frontier(self, mastered_ids: set[str]) -> list[SkillNode]:
        """BFS from roots: return unmastered nodes whose prereqs are all mastered, sorted by depth."""
        frontier = []
        for node in self._nodes.values():
            if node.id in mastered_ids:
                continue
            if all(p in mastered_ids for p in node.prerequisites):
                frontier.append(node)
        frontier.sort(key=lambda n: n.depth)
        return frontier


_graph: KnowledgeGraph | None = None


def load_graph(path: str | Path) -> KnowledgeGraph:
    global _graph
    if _graph is not None:
        return _graph
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    nodes = [SkillNode(**n) for n in data["nodes"]]
    _graph = KnowledgeGraph(nodes)
    return _graph


def get_graph() -> KnowledgeGraph:
    if _graph is None:
        raise RuntimeError("Knowledge graph not loaded. Call load_graph() first.")
    return _graph
