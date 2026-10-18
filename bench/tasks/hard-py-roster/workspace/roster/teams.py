"""Splits sign-ups into teams for the company hackathon."""


def clean_names(names: list[str]) -> list[str]:
    """Trimmed, de-duplicated names (case-insensitive), keeping the first spelling seen."""
    seen: dict[str, str] = {}
    for n in names:
        n = n.strip()
        if n and n.lower() not in seen:
            seen[n.lower()] = n
    return list(set(seen.values()))


def assign_teams(names: list[str], team_count: int) -> list[list[str]]:
    """Deal the cleaned names into `team_count` teams round-robin, in alphabetical
    (case-insensitive) order: the 1st name goes to team 0, the 2nd to team 1, and so on.
    The result is fully deterministic: the same sign-ups always give the same teams.
    """
    if team_count <= 0:
        raise ValueError("team_count must be positive")
    teams: list[list[str]] = [[] for _ in range(team_count)]
    for i, name in enumerate(clean_names(names)):
        teams[i % team_count].append(name)
    return teams
