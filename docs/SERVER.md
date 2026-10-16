# Running Domestique as a server

Domestique is a single-rider application. A server deployment exposes that one
rider's data to the network, so it needs an access boundary. This page is the
policy; `src/access.py` is the enforcement.

## Access policy

- **Desktop / loopback use:** no token, no gate. Behaviour is unchanged.
- **Server use:** set `DOMESTIQUE_SERVER_MODE=1`. The app then refuses to start
  unless `DOMESTIQUE_ACCESS_TOKEN` is set (fail closed). The Docker image sets
  server mode already.
- **With a token:** every route except `/login`, `/logout` and `/healthz` needs
  `Authorization: Bearer <token>` or the session cookie from `POST /login`.
  The check does not look at the peer address or at `X-Forwarded-*` headers, so
  a reverse proxy or an apparent loopback peer cannot bypass it.
- **Cookie:** `HttpOnly`, `SameSite=Strict`, `Secure` over HTTPS (including
  `X-Forwarded-Proto: https`). Its value is derived from the token, never the
  token itself. Rotate the token to invalidate every session.
- **Scope:** one shared secret for a personal server. There is no registration,
  no per-user accounts and no multi-tenant isolation.

## Trusted origins (CSRF)

Mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) that carry an `Origin`
header must come from loopback or from an exact origin you list:

```sh
DOMESTIQUE_TRUSTED_ORIGINS=https://train.example.com
```

A prefix or a look-alike host (`https://train.example.com.evil.io`) is rejected.

## TLS and proxies

Terminate TLS in a reverse proxy and publish the container on loopback or a
private network only. The app serves plain HTTP. Uvicorn trusts forwarding
headers only from `127.0.0.1` unless `FORWARDED_ALLOW_IPS` is set; keep it that
way unless the proxy is on another host. Run exactly one worker.

## intervals.icu sign-in from a remote browser

The OAuth callback is a loopback URL (`ICU_OAUTH_REDIRECT_URI`). A browser on
another machine would be redirected to its own loopback and the sign-in would
fail. This has **not** been verified against intervals.icu with any other
redirect address, so no remote callback is claimed. Supported options:

1. Forward the port (`ssh -L 22400:127.0.0.1:22400 server`) and open
   `http://127.0.0.1:22400` on the machine you sign in from.
2. Sign in once from the desktop app and copy the profile folder to the server
   volume (credentials stay server-side in the profile's `.env`).

## Credentials

Tokens live in each profile's `.env` under the data volume. Keep the volume
readable only by the service user. Logs redact tokens; do not publish a
data volume.

## Verified

`tests/test_access_control.py` covers: no token means no gate; API 401 and
browser redirect; bearer and cookie sign-in; forwarding headers do not bypass;
exact trusted origins; server mode without a token refuses to start.
## Immutable bundled assets (#15)

The built-in workout and route libraries, static files and the prebuilt library
caches ship inside the image or AppImage and are read-only at run time.

- **Generated workouts** (the planner's own synthesised sessions, when enabled)
  are written to `<profile>/generated_workouts/`, never into the bundle. They
  resolve for download and for the workout-facts gate by file name, but are not
  part of the browsable library.
- **If writing fails** the planner uses the library's own pick and logs
  `E_GENERATED_WORKOUT_UNWRITABLE` with the file and folder. It never writes into
  the bundle as a fallback.
- **Library caches** (`.library_index.json`, the workout-facts cache) are built
  at packaging time by `tools/build-library-caches.py`. A read-only bundle with a
  stale cache re-parses in memory for that run; it does not try to write.
- **Rider folders** added in Settings are read, never written.

Verified by `tests/test_generated_workouts_dir.py`.

## Background work and shutdown (#17, #18)

The app runs as one worker process. Everything below runs inside it.

| Work | Started by | Limit | Stops on shutdown |
|---|---|---|---|
| Intervals.icu sync loop | `db.start_background_sync` | one thread, guarded by `_sync_lock` | `db.stop_sync` sets the stop event |
| Lazy sync after boot, `domestique.icu_sync` | `jobs.start_thread` | one at a time | `jobs.shutdown` |
| History backfill, `pc-backfill`, `backfill-history` | `jobs.start_thread` | single flight (`acquire_backfill_lock`, `already_running`) | `stopping()` checked in the loop |
| DFA backfill, `dfa-backfill` | `jobs.start_thread` | single flight (`_dfa_backfill_lock`) | cancel hook plus `stopping()` |
| DFA computation | `jobs.Slot` | one at a time; a timed-out run keeps the slot until it ends | bounded, not interrupted |
| Calendar push debounce | one shared `threading.Timer` (30 s) | one pending timer | cancelled in lifespan shutdown |
| Plan generation | worker thread under the plan lock | one at a time | finishes or the process exits |
| Ride and HRV import | request handler | at most 2 at once; later requests wait before their body is read | the request ends with the process |

Every thread here is a daemon, so a stuck one cannot hold up exit. Shutdown
asks registered jobs to stop and waits up to `DOMESTIQUE_SHUTDOWN_BUDGET_S`
(default 8 s, inside Docker's 10 s stop timeout), then logs what is still
running.

**After a restart.** Nothing is queued on disk. A job that was interrupted
does not resume; it runs again on its next trigger (the daily sync, a page
load that starts a backfill, or the rider pressing the button). Those jobs are
safe to repeat: a DFA record is recomputed, a ride envelope is fetched again,
and a calendar event is matched by its own id. There is no exactly-once
guarantee for a call to intervals.icu that was cut off mid-request; the next
run reconciles against what intervals.icu now holds.

**Upload limits.** A FIT upload is capped at 50 MB (decompressed too) and an
HRV CSV at 5 MB. A request must declare its `Content-Length` (411 otherwise)
and is refused before it is read when the declared size is over the limit. A
reverse proxy should still set its own body limit.

## Linux AppImage (#12)

The AppImage bundles the same Python core and the Qt/PySide6 webview launcher
(`packaging/build_linux.sh`, `packaging/domestique.spec`). It is built inside
`ubuntu:22.04`, so the supported baseline is glibc 2.35 (Ubuntu 22.04 and
newer); the build fails if any bundled binary needs newer symbols.

Verified on 2026-10-16 for version 3.13.1:

- Local build in `ubuntu:22.04`: 264 MB artifact, native window mapped under
  Xvfb, `/api/version` correct, bundled library of 4,308 workouts intact,
  screenshot rendered.
- GitHub Actions, `release.yml` run with `linux_only=true`: build and the
  smoke test passed, and the AppImage then ran on a stock `debian:12-slim` with
  only the derived host packages installed (`verify-linux-clean-container`).

A run without a tag uses a placeholder OAuth secret, so intervals.icu sign-in
does not work in that artifact and it must not be released. A tag push or a run
with a tag still fails when `ICU_OAUTH_CLIENT_SECRET` is unset.

Not verified: a real desktop session (Wayland, GPU), distributions other than
Ubuntu 22.04 and Debian 12, and the new `/v2` interface inside the AppImage.
The AppImage runs as one user; it does not use the server access token.
