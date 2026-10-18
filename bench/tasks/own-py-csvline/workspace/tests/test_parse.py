from importer.parse import parse_line


def test_plain_fields():
    assert parse_line("a,b,c") == ["a", "b", "c"]


def test_quoted_field_with_comma():
    assert parse_line('1,"Smith, John",42') == ["1", "Smith, John", "42"]


def test_escaped_quote():
    assert parse_line('"say ""hi""",x') == ['say "hi"', "x"]


def test_empty_fields():
    assert parse_line("a,,c,") == ["a", "", "c", ""]
