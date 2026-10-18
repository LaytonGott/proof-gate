"""Normalisation used to decide whether two customer records are the same person."""
import re
import unicodedata

_TITLES = {"mr", "mrs", "ms", "dr", "prof", "sir"}
_SUFFIXES = {"jr", "sr", "ii", "iii", "phd", "md"}
_NON_ALNUM = re.compile(r"[^a-z0-9 ]+")
_SPACES = re.compile(r"\s+")


def normalize_name(name: str) -> str:
    """Lowercase, strip accents and punctuation, drop titles and suffixes, sort the words.

    "Dr. José  García-Lopez Jr." and "garcia lopez, jose" both become "garcia jose lopez".
    """
    text = unicodedata.normalize("NFKD", name)
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).lower()
    text = _NON_ALNUM.sub(" ", text.replace("-", " "))
    words = [w for w in _SPACES.split(text.strip()) if w and w not in _TITLES and w not in _SUFFIXES]
    return " ".join(sorted(words))


def normalize_email(email: str) -> str:
    """Lowercase; for gmail.com, drop dots and anything after '+' in the local part."""
    local, _, domain = email.strip().lower().partition("@")
    if domain in ("gmail.com", "googlemail.com"):
        local = local.split("+", 1)[0].replace(".", "")
        domain = "gmail.com"
    return f"{local}@{domain}"
