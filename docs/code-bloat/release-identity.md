# Release identity audit (roadmap #16)

Audited at the fork's `clean-main` after the UI migration merges. "Retained" means
checked and left unchanged on purpose, not overlooked.

| Item | Where | Decision | Reason |
|---|---|---|---|
| Update check channel | `src/app.py` `_RELEASE_REPO` | **Changed** | Defaults to `PACE-1/shepherd`; `SHEPHERD_RELEASE_REPO=<owner>/<repo>` overrides it. Upstream binaries are no longer offered as upgrades. |
| Fallback release page | `src/app.py` | **Changed** | Built from `_RELEASE_REPO`. |
| Update-check tests | `tests/test_update_check.py` | Added | Pin the default channel and the requested URL. |
| intervals.icu `User-Agent` | `src/training.py` `ICU_USER_AGENT` | Retained | Still names the upstream project. It cannot be checked against the live service (Cloudflare fronts it; see `tests/test_creds_profile_alignment.py`), so it is not changed blind. |
| intervals.icu OAuth app | `src/config.py` | Retained | Client id and redirect URI come from configuration; a fork build that ships its own OAuth app sets them there. |
| macOS bundle id `com.platypus45.shepherd` | `packaging/shepherd.spec`, `src/launcher.py` | Retained | Changing it breaks macOS permission and data continuity, and macOS support has no recorded decision (#26). |
| Homebrew cask | `Casks/` | **Removed** | It described the upstream v3.13.1 DMG; Shepherd publishes no macOS build. |
| Data directory `~/.shepherd`, `SHEPHERD_HOME` | `src/user_home.py` | Retained | Renaming would orphan every rider's data. |
| AppImage name `Shepherd-v<VERSION>-x86_64.AppImage` | `packaging/build_linux.sh` | Retained | The update asset selector matches the `.AppImage` suffix. |
| `APP_VERSION` alias | `src/app.py` | Already removed | Dead-code batch 1 (#28); `VERSION` is the source of truth. |
| GitHub release workflow | `.github/workflows/release.yml` | Retained, unverified | Targets GitHub Actions. This fork's canonical host is GitHub, so it is the right shape; no runner has executed it here. |
| Forgejo test workflow | `.forgejo/workflows/tests.yml` | Retained, unverified | No Forgejo runner was visible to the repository account (#2). |
