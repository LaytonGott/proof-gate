from dedupe.normalize import normalize_email, normalize_name


def test_name_normalisation():
    assert normalize_name("Dr. José  García-Lopez Jr.") == "garcia jose lopez"
    assert normalize_name("garcia lopez, jose") == "garcia jose lopez"
    assert normalize_name("MS. ANA SMITH") == "ana smith"


def test_email_normalisation():
    assert normalize_email(" Ana.Smith+news@GMail.com ") == "anasmith@gmail.com"
    assert normalize_email("ana.smith@googlemail.com") == "anasmith@gmail.com"
    assert normalize_email("Ana.Smith+x@example.org") == "ana.smith+x@example.org"
