"""Public signatures of Python modules, for API-break detection.

stdin: {"files": {path: source}}. stdout: {path: [{"name", "kind", "params": [...]}]} where
each param is {"name", "kind": "pos"|"kwonly"|"var"|"varkw", "default": bool}. Methods are
named "Class.method". Files that do not parse are left out.
"""
import ast
import json
import sys


def params(fn):
    a = fn.args
    out = []
    positional = a.posonlyargs + a.args
    first_default = len(positional) - len(a.defaults)
    for i, p in enumerate(positional):
        out.append({"name": p.arg, "kind": "pos", "default": i >= first_default})
    if a.vararg:
        out.append({"name": a.vararg.arg, "kind": "var", "default": True})
    for p, d in zip(a.kwonlyargs, a.kw_defaults):
        out.append({"name": p.arg, "kind": "kwonly", "default": d is not None})
    if a.kwarg:
        out.append({"name": a.kwarg.arg, "kind": "varkw", "default": True})
    return out


def symbols(tree):
    out = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and not node.name.startswith("_"):
            out.append({"name": node.name, "kind": "function", "params": params(node)})
        elif isinstance(node, ast.ClassDef) and not node.name.startswith("_"):
            out.append({"name": node.name, "kind": "class", "params": []})
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)) and (not item.name.startswith("_") or item.name == "__init__"):
                    ps = params(item)
                    if ps and ps[0]["name"] in ("self", "cls"):
                        ps = ps[1:]
                    out.append({"name": f"{node.name}.{item.name}", "kind": "method", "params": ps})
    return out


def main():
    files = json.load(sys.stdin)["files"]
    result = {}
    for path, source in files.items():
        try:
            result[path] = symbols(ast.parse(source))
        except SyntaxError:
            pass
    json.dump(result, sys.stdout)


main()
