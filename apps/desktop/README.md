# @omne-harness/desktop

The desktop app. In this run it runs in a browser: a local Node process (the web host) holds the login and serves the page. A later Electron main process will implement the same bridge, and the page will not change. Behavior is in [SPEC.md](SPEC.md).

## Run it

You need a Harness Server whose access entry serves `/api/<protocol>/v<major>/<name>` with `access/v1`, `identity/v1` and `session/v1` mounted. Mount `assets/v1` too to see the settings.

```sh
pnpm --filter @omne-harness/desktop... run build
node apps/desktop/dist/web-host/bin.js --server http://127.0.0.1:8787 --port 8790
```

Then open `http://127.0.0.1:8790/` in a browser. Use `127.0.0.1` or `localhost`; the host answers only requests whose `Host` is a loopback address. The port in `Host` is not checked, so the page also works behind a forwarded port.

| Setting                          | Flag       | Environment variable | Default                 |
| -------------------------------- | ---------- | -------------------- | ----------------------- |
| Server entry origin              | `--server` | `OMNE_SERVER`        | `http://127.0.0.1:8787` |
| Port of this host (on 127.0.0.1) | `--port`   | `OMNE_DESKTOP_PORT`  | `8790`                  |

## Layout

| Directory        | Contents                                                                                      | May import                                                              |
| ---------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/shared/`    | `host-bridge.ts`: the bridge type (seam four). `wire.ts`: the bytes between page and host     | client core types, json-text                                            |
| `src/main-core/` | The login session, the credential store, the HTTP connection to the server entry. No Electron | shared, client core, contracts                                          |
| `src/web-host/`  | The local Node process: `node:http`, the bridge addresses, the static page                    | main-core, shared                                                       |
| `src/page/`      | The bridge over `fetch`, the client tree, the shell, the login screen, `assembly.tsx`         | shared, client core, client assembly; never main-core, web-host or Node |

`src/page/assembly.tsx` is the only page file that names a domain. It gives the signed-in workspace two views, each with the protocol client from the tree and the current tenant: 「对话」 (`SessionWorkspace` of `@omne-harness/session-ui`) and 「设置」 (`SettingsPanel` of `@omne-harness/assets-ui`). The shell shows a tab for each view whose protocol the server has mounted, so without `assets/v1` there is no 「设置」 tab.

## Technology

React 19 and TypeScript; Vite builds the page into `dist/page`; `tsc` builds the host into `dist/`. Styles are plain CSS (`src/page/styles.css`), light and dark from the system setting. This run uses no Tailwind and no Radix, and the shared UI member and the shell contract member are not built yet: both are deviations from RFC-0015 §10 for this run. No file is taken from `pandazki/super-assistant`.

## Known limits

- One host process serves one person: the login session is a singleton in the process.
- The login proof is kept only in the host's memory. Restarting the host signs out. `CredentialStore` is the interface for the OS-encrypted store.
- The host forwards operations of protocols it does not know; it can check `carriesCredential` only for `access/v1`, `identity/v1` and `session/v1`.
- When a request from the page to the host fails, the page cannot prove nothing was sent, so the call answers `uncertain`.

## Tests

`pnpm --filter @omne-harness/desktop run test:fast`. See [SPEC.md](SPEC.md#验证) for what each file covers.
