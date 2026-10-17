"""Accept the environment variable names used before the rename.

Shepherd was Domestique: every ``DOMESTIQUE_*`` setting is now ``SHEPHERD_*``.
Importing this module copies each old name that is set to its new name unless
the new name is already set, so existing Docker files, service units and shell
profiles keep working.

Stdlib only, and imported before any module reads its environment.
"""
import os

# ponytail: the old names stay supported indefinitely; drop this once nobody sets them.
for _old, _value in list(os.environ.items()):
    if _old.startswith("DOMESTIQUE_"):
        os.environ.setdefault("SHEPHERD_" + _old[len("DOMESTIQUE_"):], _value)
