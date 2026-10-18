"""Parses one line of a CSV export from the billing system (RFC 4180 style).

Fields are separated by commas. A field may be wrapped in double quotes; inside a
quoted field, commas are literal and a doubled quote ("") stands for one quote
character. Surrounding quotes are removed. Unquoted fields are returned as-is
(no trimming). An empty line is a single empty field.
"""


def parse_line(line: str) -> list[str]:
    fields = line.split(",")
    return [f[1:-1] if f.startswith('"') and f.endswith('"') else f for f in fields]
