# OMNE CLI

[简体中文](README_ZH.md)

The CLI opens terminal conversations, resumes existing sessions, and manages access to governance centers and tenants.
The current B01 delivery supports Linux, multi-turn conversations, and real Shell tool calls through OpenRouter models.
It is a pre-release application. macOS support, priority insertion, archiving, and model switching during a running host are outside this delivery.

## Requirements

- Node.js **24.21.0** on `PATH`. The archive does not include Node.js.
- Linux with a working systemd user manager and scopes for Shell execution, plus `/usr/bin/env`, `/usr/bin/stty`, and `/bin/bash`.
- A reachable governance center and its TLS trust configuration. Center deployment is separate from CLI installation. See [tenancy-host](../tenancy-host/README.md).
- An OpenRouter credential for model requests and a model supported by the bundled catalog.
- For interactive commands, an exclusive UTF-8 terminal with at least 60 columns by 16 rows. The terminal must support bracketed paste and alternate-screen mode queries.

Run `omne` in your current terminal, locally or over SSH. No `DISPLAY`, X11 forwarding, or `OMNE_TERMINAL_PROFILE` is required. The CLI checks the terminal capabilities directly. Changing `TERM` does not supply missing capabilities.
The terminal must frame pasted text and prevent pasted content from forging the closing delimiter. JSON commands do not require these terminal capabilities.

## Build and install

From the repository root, create an archive at a new absolute path:

```bash
./scripts/package-cli.sh /absolute/new/omne-cli.tar.gz
```

Create the output parent first. The target file must not exist.
Packaging builds the CLI dependency closure, collects production dependencies offline from the local pnpm store, and checks the deployed `node-pty` native module.
Prepare dependencies using the [development guide](../../docs/development.md). Do not change source, lockfiles, or `dist` during packaging.
The command creates an archive. It does not install the CLI, upload a release, or configure an account.

Obtain the archive and its SHA-256 digest through a trusted channel. Compare the digest before extraction, then install into a new directory:

```bash
set -eu
archive=/absolute/path/omne-cli.tar.gz
sha256sum "$archive"
build_id=$(tar -xOf "$archive" app/BUILD_ID)
install_dir="$HOME/.local/share/omne/builds/$build_id"
mkdir -p "$HOME/.local/share/omne/builds" "$HOME/.local/bin"
mkdir "$install_dir"
tar -xzf "$archive" -C "$install_dir"
ln -s "$install_dir/app/bin/omne.js" "$HOME/.local/bin/omne"
export PATH="$HOME/.local/bin:$PATH"
omne --version
omne --help
```

These commands stop if the install directory or command link already exists. Do not overwrite an active installation.
For an upgrade, extract into another new directory and deliberately change the command link.
Existing hosts keep using their running code. A code change does not stop a host or make older code compatible with newer data.
`BUILD_ID` identifies the packaged inventory. It is not a signature or a reproducible-build claim. Repository builds without it report `development`.

## Start a conversation

In your local terminal or an SSH session, replace the workspace path:

```bash
cd /absolute/path/to/your-workspace
omne
```

The current directory becomes a new session's Shell workspace. Resuming a session preserves its original workspace.
The default entry prepares missing center configuration, login, and model configuration before creating the session.

- Without a center, enter its endpoint, display name, and TLS trust information.
- Without a valid login, choose login or registration. Registration does not log in automatically. Select login after registration completes.
- With a valid login, the entry checks the selected tenant. Login itself does not create a session.
- Without a running tenant host, choose a supported model and supply a protected OpenRouter credential file when requested.
- With a readable existing host, reuse its initial model and saved credentials. The entry does not repeat model setup.

Choices use the displayed number and Enter. Use PageUp/PageDown to read every page before pressing Enter.
Enter a message in the **Conversation** input and press Enter. The reply updates while it runs. When it finishes, the input returns automatically, with user and assistant messages retained in history. Use PageUp/PageDown to read earlier content.
The bundled session definition includes Shell. The terminal shows public tool names, actual arguments, execution state, and results. Shell results include output, exit status, and truncation counts when available. Public reasoning summaries show their text. Private blocks, encrypted reasoning, and raw attachments are excluded. A notice identifies content omitted by display limits.

For a short manual check, ask the model to remember a unique word.
Ask for that word in the next turn. Then ask Shell to create and read a file in the workspace.
Check that file independently in your system terminal. A model's claim alone is not evidence of tool execution.

## Register and log in without interaction

Use the real endpoint and private files in place of the example values:

```bash
omne center add https://center.example.org \
  --name personal-center --ca-file /absolute/private/center-ca.pem --json
omne register --center personal-center \
  --login-identifier your-login --credential-file /absolute/private/login-credential --json
omne login --center personal-center \
  --login-identifier your-login --credential-file /absolute/private/login-credential --json
```

Choose exactly one trust option: `--system-ca`, `--ca-file <path>`, or `--spki <sha256>`.
The CLI checks the center's actual identity before saving its connection configuration.
Registration creates the personal organization.
Login prepares and selects the tenant reported by the center. For a new account, this is the personal tenant.
Team creation and invitation acceptance are separate actions and do not switch the current tenant automatically.

Credential files must satisfy the CLI's private-file checks. Keep private directories at `0700` and credential files at `0600`.
The complete UTF-8 content is the credential, including spaces, BOM, and final newlines. The CLI does not trim it.
`echo` normally adds a newline. Preserve the exact original bytes for later login. This release has no administrator password reset.
Never put credential contents in command arguments, source control, or diagnostic reports.

## Live replies and tool status

The conversation shows your messages and the assistant replies. The input field appears below the conversation when a reply finishes. You do not need an extra Enter to open it. Enter sends the next message. PgUp/PgDn scrolls through history. You can send without visiting every page. Reattaching loads the Session's human-visible messages through the host.

While a Run is active, the terminal updates the reply as text arrives. It shows public reasoning text after `Reasoning summary` and omits the heading when no text is available. Tools show their names, actual public arguments, execution states, and public results. Private blocks, descendants of hidden blocks, and opaque data are not displayed. A model may provide no public reasoning summary.

The live view follows the last page. Use PgUp/PgDn to read earlier pages; return to the last page to follow new output. A slow display can skip intermediate frames. The final view comes from saved session messages. If live content exceeds the display limit, the terminal shows an omission notice.

## Resume and detach

Ctrl+G cancels the current input or detaches from the conversation. Ctrl+C exits the client.
A standalone Escape key is not a cancel command. The client rejects multi-line pasted input as one input. It does not submit multiple messages.
The client restores its terminal state after input and output finish. Paste already in progress must finish before terminal release.

Detaching ends the client's wait. It does not stop the tenant host or cancel an admitted Run.
The exit message gives a session ID. Replace `SESSION_ID` below:

```bash
omne --session SESSION_ID
```

Each new Run checks current login validity. Login expiry does not stop an executing Run.
If a queued message needs login, log in again and retain its original receipt. Do not resend an already admitted message.
A running host can observe the new login and recheck pending input.

## Model selection and limits

All model requests use OpenRouter. Supported definitions and input meters come from the [bundled model catalog](../../packages/model/pi-ai-transport/README.md).
The CLI imports the shared `officialCatalog` into the tenant model directory and builds choices from its listed entries.
Model definitions, routes, and input meters belong to the model package. The CLI does not maintain a separate per-model list.
Upstream availability alone does not register a model in this CLI.
The current catalog does not include `openai/gpt-6.1-sol`. Changing a model name or using `openai/gpt-6-sol` is not equivalent support.

Model use requires registration and compatibility with the assembled input modalities. Account credit is not constrained by this delivery.
The current CLI has no model-change command for an existing host. Its displayed initial model is not a report of every session's current runtime state.
Do not edit SQLite records, replace model identifiers, or remove locks to change a model.

## Commands

Use `omne --help` for exact syntax. Add `--home <absolute-path>` to select a separate state root.
For non-TTY governance commands, include `--json` and all required arguments. JSON mode never asks interactive questions, even in a TTY.

| Command | Purpose |
| --- | --- |
| `omne` | Prepare identity and model configuration, then create a session. |
| `omne --session <id>` | Attach to the specified session. |
| `omne --message-file <path> --json [--session <id>]` | Submit a JSON user message and observe its Run. |
| `omne center add <endpoint> --name <name> <trust-option>` | Save a verified governance center. |
| `omne tenant create --name <name>` | Create a named team organization and prepare its tenant. |
| `omne tenant add --invitation <id>` | Accept an invitation and prepare its tenant. |
| `omne tenant switch <tenant-reference>` | Switch to a verified tenant of the current center and account. |
| `omne register --login-identifier <id> --credential-file <path> [--center <name>]` | Register an account. |
| `omne login --login-identifier <id> --credential-file <path> [--center <name>]` | Log in and prepare the selected tenant. |
| `omne logout` | Log out of the current login. |
| `omne logins list` | Read the current account's login states. |
| `omne logins revoke --handle <handle>` | Revoke the specified login state. |
| `omne credential change --current-credential-file <path> --new-credential-file <path>` | Change the account credential. |

A tenant reference is the complete `TenantBinding` JSON returned by the CLI: `formatVersion`, `centerId`, and `tenant` with `organization` and `account`.
Pass that JSON as one quoted argument. A directory key, display name, or bare organization ID is not a tenant reference.
The old `machine` prefix, `tui` alias, and previous governance command set are removed.

## Submit JSON messages

This path requires an already configured, running tenant host. The file is a complete `UserMessage`, not a plain-text prompt.
For example:

```json
{
  "id": "manual-message-001",
  "type": "user",
  "createdAt": "2026-10-10T12:00:00Z",
  "blocks": [
    {
      "id": "manual-text-001",
      "kind": "text",
      "text": "Reply with hello.",
      "visibility": { "toHuman": true, "toModel": true }
    }
  ]
}
```

Use fresh message and block IDs, the actual creation time, and a new file for each new message. Replace the sample values before submitting:

```bash
omne --message-file /absolute/path/message.json --json
omne --message-file /absolute/path/next-message.json --json --session SESSION_ID
```

Without `--session`, the CLI creates a session using the host's actual creation preferences before submitting the message.
With `--session`, it submits to that existing session. Responses retain operation identity and receipts.
An unknown result or wait timeout is not proof that the input was rejected. Preserve the result and do not automatically retry with new IDs.

| Exit code | Meaning |
| --- | --- |
| `0` | The action completed. A message command observed its Run complete. |
| `2` | Invalid input, unsupported terminal, or an explicit refusal. |
| `3` | Unavailable or not ready. A message Run failed or was cancelled. |
| `4` | Unconfirmed outcome, or admitted input whose Run has not completed. |
| `70` | Internal defect, output failure, or cleanup failure. |

Read the structured outcome as well as the exit code. Remote success does not hide local preparation or cleanup failure.

## Local files and runtime ownership

State selection uses `--home`, then `OMNE_HOME`, then `~/.omne`. An explicit home must be an absolute path other than the filesystem root.
Invalid state paths fail instead of falling back to the current directory. Help and version queries do not create state.

```text
~/.omne/
├── config.sqlite
├── run/
│   ├── login/                         # Login preparation / 登录准备
│   └── <tenant-digest>.sock
└── tenants/<key>/
    ├── tenant.json
    ├── auth/
    │   ├── client.sqlite
    │   └── credentials/
    ├── data/
    │   └── runtime.sqlite
    ├── sessions/
    ├── assets/
    ├── logs/
    │   └── session-host.log
    ├── cache/
    └── run/
```

The application creates directories as needed. SQLite may also create WAL and shared-memory files.
The tenant key derives from the exact center, organization, and account identities. `tenant.json` stores that binding, not credentials.
Private directories require `0700`. Private files require `0600`. Unsafe ownership, links, or permissions cause refusal, not automatic repair.
These checks do not isolate processes running as the same OS user.

The CLI is a client of a separate tenant host over a local socket. The host owns Session/Agent execution and separate Model and Tool execution pools.
Clock is a borrowed runtime service. A session, Cordis fiber, or asynchronous task does not imply a dedicated OS thread.
The CLI does not run another agent loop. See the [application contract](SPEC.md) for ownership, admission, persistence, and shutdown behavior.

## Troubleshooting and development

- For a terminal refusal, check the window size, exclusive TTY access, bracketed paste, and support for mode queries 2004 and 1049. No X11 display is needed. A terminal without these capabilities remains unsupported. JSON governance commands remain available.
- For login rejection, repeat login with the original credential file. A center connection failure does not prove that the login was revoked.
- For an unreadable existing host, inspect the reported error and `logs/session-host.log`. Do not remove its lock or start a second owner.
- For an accepted but unfinished message, keep the receipt and inspect its status before resubmitting anything.
- For a code upgrade, keep state separate from the new installation and account for hosts still using the old code.

For a repository development build:

```bash
pnpm install --frozen-lockfile
pnpm build
node apps/cli/dist/main.js --help
```

Run the relevant member checks after implementation changes:

```bash
pnpm --filter @omne-harness-lite/cli typecheck
pnpm --filter @omne-harness-lite/cli test
```

Build changed public dependencies before testing consumers. These commands do not replace real terminal or paid-provider acceptance.
See [acceptance scenarios](acceptance/README.md), [verification obligations](verification/README.md), and the [development guide](../../docs/development.md).
Keep local accounts, credentials, temporary plans, and execution logs outside tracked documentation. The application contract remains in [SPEC.md](SPEC.md).
