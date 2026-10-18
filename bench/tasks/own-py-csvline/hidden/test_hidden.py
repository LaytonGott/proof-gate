import csv
import io

import pytest

from importer.parse import parse_line

CASES = [
    "a,b,c",
    '1,"Smith, John",42',
    '"say ""hi""",x',
    "a,,c,",
    "",
    '""',
    '"",""',
    '"a,b,c"',
    '""""',
    '"x""y","z"',
    ' a , b ',
    '"comma,at,end,"',
    'id,"multi ""quoted"" words, and commas",last',
    ",,,",
    '"only"',
]


@pytest.mark.parametrize("line", CASES)
def test_matches_stdlib_csv(line):
    want = next(csv.reader(io.StringIO(line)), [""])
    assert parse_line(line) == want
