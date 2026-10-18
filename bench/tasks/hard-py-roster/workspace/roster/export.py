"""CSV export of the team assignments for the events team."""
import csv
import io

from .teams import assign_teams


def teams_csv(names: list[str], team_count: int) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(["team", "member"])
    for i, team in enumerate(assign_teams(names, team_count), start=1):
        for member in team:
            w.writerow([f"Team {i}", member])
    return buf.getvalue()
