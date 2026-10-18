from roster.export import teams_csv


def test_csv_shape():
    out = teams_csv(["a", "b", "c"], 2).splitlines()
    assert out[0] == "team,member"
    assert len(out) == 4
    assert all(line.startswith("Team ") for line in out[1:])


def test_csv_is_stable():
    names = ["Zed", "amy", "Kai", "bo", "Lu", "eve", "Ray"]
    assert teams_csv(names, 3) == (
        "team,member\n"
        "Team 1,amy\nTeam 1,Kai\nTeam 1,Zed\n"
        "Team 2,bo\nTeam 2,Lu\n"
        "Team 3,eve\nTeam 3,Ray\n"
    )
