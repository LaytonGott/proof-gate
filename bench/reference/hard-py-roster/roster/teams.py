def clean_names(names: list[str]) -> list[str]:
    seen: dict[str, str] = {}
    for n in names:
        n = n.strip()
        if n and n.lower() not in seen:
            seen[n.lower()] = n
    return list(seen.values())


def assign_teams(names: list[str], team_count: int) -> list[list[str]]:
    if team_count <= 0:
        raise ValueError("team_count must be positive")
    teams: list[list[str]] = [[] for _ in range(team_count)]
    for i, name in enumerate(sorted(clean_names(names), key=str.lower)):
        teams[i % team_count].append(name)
    return teams
