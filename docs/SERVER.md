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
