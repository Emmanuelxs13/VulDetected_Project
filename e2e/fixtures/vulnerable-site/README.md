# Vulnerable fixture site (Sprint 1 demo)

A deliberately insecure app used as the scan target for the Sprint 1 demo. It
exists so the demo proves a **real** scan with **real** findings without
depending on the internet or on a third party being vulnerable that day.

## Run it

```bash
node e2e/fixtures/vulnerable-site/server.mjs
# -> http://miapp.localtest.me:8099/  (localtest.me resolves to 127.0.0.1)
```

`PORT` (default `8099`) and `HOST` (default `127.0.0.1`) can be overridden.

## Publish the ownership token

The app verifies domain ownership through `/.well-known/vuldetected.txt`. The
fixture serves whatever is in `token.txt`, read on every request:

```bash
node scripts/demo/write-token.mjs <the-token-shown-in-the-app>
```

## What it triggers

| Built-in check      | Fixture behaviour                                            |
| ------------------- | ----------------------------------------------------------- |
| `security_headers`  | sends none of the six required headers                      |
| `tls`               | plain HTTP, no HTTPS                                        |
| `cookies`           | sets a session cookie with no Secure/HttpOnly/SameSite      |
| `xss`               | reflects `q`/`s`/`search` into HTML unencoded               |
| `sqli`              | a single quote in any value returns a DB error page         |
| `open_redirect`     | `redirect`/`next`/… return a 302 to any external URL        |
| `cors`              | reflects any `Origin` with credentials enabled              |
| `directory_listing` | `/uploads/` serves an automatic index                       |
| `sensitive_files`   | `/.env`, `/.git/config`, `/backup.sql`, … are readable      |

> This is a target, not product code. It binds to loopback only and must never
> be deployed. Do not copy any pattern from it into the application.
