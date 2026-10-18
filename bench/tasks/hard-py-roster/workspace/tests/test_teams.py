import pytest

from roster.teams import assign_teams, clean_names

SIGNUPS = ["  maya", "Oskar", "lena", "Bea", "Tariq", "maya", "Chloe", "ines", "Dmitri", " ", "Yusuf"]


def test_clean_names_dedupes_case_insensitively():
    cleaned = clean_names(["Ana", "ana ", "ANA", "Bo"])
    assert sorted(cleaned) == ["Ana", "Bo"]


def test_assign_teams_round_robin_alphabetical():
    teams = assign_teams(SIGNUPS, 3)
    assert teams == [
        ["Bea", "ines", "Oskar"],
        ["Chloe", "lena", "Tariq"],
        ["Dmitri", "maya", "Yusuf"],
    ]


def test_every_name_assigned_once():
    teams = assign_teams(SIGNUPS, 4)
    members = [m for t in teams for m in t]
    assert len(members) == len(set(members)) == 9


def test_bad_team_count():
    with pytest.raises(ValueError):
        assign_teams(["a"], 0)
