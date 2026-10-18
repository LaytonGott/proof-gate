import os
import subprocess
import sys

from roster.teams import assign_teams, clean_names

SIGNUPS = ["  maya", "Oskar", "lena", "Bea", "Tariq", "maya", "Chloe", "ines", "Dmitri", " ", "Yusuf"]
EXPECTED = [["Bea", "ines", "Oskar"], ["Chloe", "lena", "Tariq"], ["Dmitri", "maya", "Yusuf"]]


def test_alphabetical_round_robin():
    assert assign_teams(SIGNUPS, 3) == EXPECTED
    assert assign_teams(["b", "A", "c", "D"], 2) == [["A", "c"], ["b", "D"]]


def test_first_spelling_kept():
    assert sorted(clean_names(["ana", "Ana", "ANA"])) == ["ana"]


def test_deterministic_across_hash_seeds():
    code = "from roster.teams import assign_teams; print(assign_teams(%r, 3))" % (SIGNUPS,)
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    outputs = set()
    for seed in ("0", "1", "2", "3", "4", "5", "6", "7"):
        env = {**os.environ, "PYTHONHASHSEED": seed}
        outputs.add(subprocess.run([sys.executable, "-c", code], cwd=root, env=env, capture_output=True, text=True, check=True).stdout)
    assert outputs == {f"{EXPECTED}\n"}
