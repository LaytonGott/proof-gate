from dedupe.matcher import Record, find_duplicate_groups


def R(id, name, email, postcode="1000"):
    return Record(id, name, email, postcode)


def test_email_match():
    rs = [R("a", "Ana Smith", "ana@x.org"), R("b", "A. Smith", "ANA@x.org"), R("c", "Bob", "bob@x.org")]
    assert find_duplicate_groups(rs) == [["a", "b"]]


def test_name_needs_same_postcode():
    rs = [R("a", "Ana Smith", "a1@x.org", "1000"), R("b", "smith, ana", "a2@x.org", "1000"), R("c", "Ana Smith", "a3@x.org", "2000")]
    assert find_duplicate_groups(rs) == [["a", "b"]]


def test_transitive_groups():
    rs = [
        R("c", "Wei Chen", "wei@x.org", "1"),
        R("a", "Wei Chen", "w.chen@gmail.com", "1"),
        R("b", "W Chen", "wchen@gmail.com", "9"),
    ]
    assert find_duplicate_groups(rs) == [["a", "b", "c"]]


def test_group_ordering():
    rs = [R("z", "Q", "q@x"), R("y", "Q2", "Q@X"), R("b", "P", "p@x"), R("a", "P2", "P@x")]
    assert find_duplicate_groups(rs) == [["a", "b"], ["y", "z"]]


def test_no_duplicates():
    assert find_duplicate_groups([R("a", "A", "a@x"), R("b", "B", "b@x")]) == []
