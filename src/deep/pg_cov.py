"""pytest plugin: which lines of the files named in PG_COV_FILES ran during the session.

Loaded with `-p pg_cov` (its folder on PYTHONPATH). Writes JSON to PG_COV_OUT:
  {"executed": {path: [lines]}, "executable": {path: [lines]}}
with paths relative to PG_COV_ROOT. Uses sys.monitoring (Python 3.12+), falling back to
sys.settrace, so nothing needs to be installed.
"""
import json
import os
import sys
import threading

_ROOT = os.path.normcase(os.path.abspath(os.environ.get("PG_COV_ROOT", ".")))
_FILES = {os.path.normcase(os.path.abspath(os.path.join(_ROOT, f))): f for f in os.environ.get("PG_COV_FILES", "").split(os.pathsep) if f}
_executed: dict[str, set[int]] = {}


def _record(filename: str, line: int) -> bool:
    rel = _FILES.get(os.path.normcase(os.path.abspath(filename)))
    if rel is None:
        return False
    _executed.setdefault(rel, set()).add(line)
    return True


if hasattr(sys, "monitoring"):
    _mon = sys.monitoring
    _TOOL = _mon.COVERAGE_ID

    def _on_line(code, line):
        _record(code.co_filename, line)
        return _mon.DISABLE  # one hit per location is enough

    _mon.use_tool_id(_TOOL, "proof-gate")
    _mon.register_callback(_TOOL, _mon.events.LINE, _on_line)
    _mon.set_events(_TOOL, _mon.events.LINE)
else:  # pragma: no cover - Python < 3.12

    def _trace(frame, event, arg):
        if event == "line":
            _record(frame.f_code.co_filename, frame.f_lineno)
        return _trace

    sys.settrace(_trace)
    threading.settrace(_trace)


def _executable(path: str) -> list[int]:
    """Lines that hold code, from the compiled code objects."""
    try:
        with open(path, encoding="utf-8") as f:
            code = compile(f.read(), path, "exec")
    except Exception:
        return []
    lines: set[int] = set()
    stack = [code]
    while stack:
        co = stack.pop()
        for _, _, line in co.co_lines():
            if line is not None:
                lines.add(line)
        stack.extend(c for c in co.co_consts if hasattr(c, "co_lines"))
    return sorted(lines)


def pytest_sessionfinish(session, exitstatus):
    out = os.environ.get("PG_COV_OUT")
    if not out:
        return
    data = {
        "executed": {f: sorted(lines) for f, lines in _executed.items()},
        "executable": {rel: _executable(abs_) for abs_, rel in _FILES.items()},
    }
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f)
