"""Overlap groups: topics from different playlists that teach the same thing, within one trail."""


def groups_of(links: dict[str, list[str]]) -> dict[str, frozenset[str]]:
    parent = {k: k for k in links}
    for vs in links.values():
        for v in vs:
            parent.setdefault(v, v)

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for k, vs in links.items():
        for v in vs:
            parent[find(k)] = find(v)
    members: dict[str, set[str]] = {}
    for x in parent:
        members.setdefault(find(x), set()).add(x)
    return {x: frozenset(members[find(x)]) for x in parent}


def expand_mastered(mastered: set[str], groups: dict[str, frozenset[str]]) -> set[str]:
    out = set(mastered)
    for m in mastered:
        out |= groups.get(m, frozenset())
    return out


def pick_per_group(ids_in_order: list[str], groups: dict[str, frozenset[str]]) -> list[str]:
    """Keep the first id of each group, preserving order."""
    seen: set[frozenset[str]] = set()
    out = []
    for i in ids_in_order:
        g = groups.get(i, frozenset({i}))
        if g in seen:
            continue
        seen.add(g)
        out.append(i)
    return out
