"""Print the OpenAPI schema of the app, restricted to the typed-contract routes.

Usage: python tools/dump_openapi.py > tests/api_contract.json
"""
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
os.environ.setdefault("DOMESTIQUE_HOME", tempfile.mkdtemp(prefix="domestique-openapi-"))


def contract() -> dict:
    import app as app_module

    full = app_module.app.openapi()
    paths = {}
    for path, ops in full["paths"].items():
        kept = {}
        for method, op in ops.items():
            ok = op.get("responses", {}).get("200", {}).get("content", {}).get(
                "application/json", {}).get("schema", {})
            if "$ref" in ok or "$ref" in ok.get("items", {}):   # only routes with a declared model (or a list of one)
                kept[method] = {
                    "operationId": op.get("operationId"),
                    "responses": {"200": {"description": "OK", "content": {
                        "application/json": {"schema": ok}}}},
                }
        if kept:
            paths[path] = kept
    used = json.dumps(paths)
    schemas = {k: v for k, v in full.get("components", {}).get("schemas", {}).items()
               if f"/{k}\"" in used or k in used}
    # transitive closure of $refs between models
    changed = True
    while changed:
        changed = False
        blob = json.dumps(schemas)
        for k, v in full.get("components", {}).get("schemas", {}).items():
            if k not in schemas and f"/{k}\"" in blob:
                schemas[k] = v
                changed = True
    return {
        "openapi": "3.1.0",
        "info": {"title": "Domestique typed contracts", "version": "1"},
        "paths": dict(sorted(paths.items())),
        "components": {"schemas": dict(sorted(schemas.items()))},
    }


if __name__ == "__main__":
    print(json.dumps(contract(), indent=2, sort_keys=True))
