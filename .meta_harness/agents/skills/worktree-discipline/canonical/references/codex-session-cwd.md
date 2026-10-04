# Codex session directory

**Read when:** entering or leaving a worktree in Codex.
**Return when:** the host session directory and the current turn's default directory both match the intended checkout.

## Three directory values

| Value | What it controls | How to check it |
|---|---|---|
| Host session `cwd` | The session's configured working directory, including the directory supplied to hooks | Read the current thread through the host service |
| Current turn's default directory | Commands and context already prepared for this turn | Run `pwd` without an explicit `workdir` or preceding `cd` |
| A command's `workdir` or shell `cd` | That command's execution directory | Run `pwd` inside that command |

Changing the third value does not establish either of the first two.
A host update can change the first value while the active turn retains the second.
Do not use an explicit command directory as proof that the session moved.

Prefer an exposed session-directory tool when one exists.
The user can also use `/cd` when the host offers that command.
An assistant message containing `/cd` does not invoke the host command.
The absence of a dedicated tool does not establish that the host lacks a service interface.

## Use the existing local service

The 2026-10-03 Linux run used Codex CLI and daemon **0.160.0**.
It updates the current thread without starting another session.
Use it only for the directory change required by the authorized task.
Keep model, permissions, approval policy and other thread settings unchanged.

1. Read `CODEX_THREAD_ID` from the current tool process environment.
   Do not select a thread by its title or by which thread was most recently active.
2. Check the installed CLI and the running service:

   ```sh
   codex --version
   codex app-server daemon version
   ```

   The second command returns JSON, including `status`, `socketPath` and version information.
   Use the returned socket path. Do not hard-code a user's home directory.
   A missing local service does not authorize starting or restarting a daemon that owns other sessions.
3. Check the protocol for the running service version when it differs from the observed version.
   The matching CLI can generate its schema:

   ```sh
   codex app-server generate-json-schema --experimental --out /path/to/task-scratch/codex-schema
   ```

   Check `ThreadSettingsUpdateParams.cwd`, `ThreadReadParams` and the `thread/settings/update` method.
   The observed schema defines `cwd` as an override for subsequent turns.
4. Connect to `socketPath` with a WebSocket client that supports Unix sockets.
   The observed client used Python `websockets.asyncio.client.unix_connect` through `uv run --no-project --with websockets`.
   Use an available mature client instead of implementing WebSocket framing.
   The Unix socket requires an HTTP Upgrade handshake and WebSocket frames.
   Sending newline-delimited JSON through `codex app-server proxy` is not this transport.
5. Initialize the connection, then send the initialized notification:

   ```json
   {"id":1,"method":"initialize","params":{"clientInfo":{"name":"worktree-cwd","version":"1.0.0"},"capabilities":{"experimentalApi":true}}}
   {"method":"initialized"}
   ```

   Each object is a separate WebSocket text frame.
   Match responses by request ID, handle RPC errors, and bound connection and response waits.
   Close the client connection when its work ends. Do not stop the shared service.
6. Read the current thread before changing it:

   ```json
   {"id":2,"method":"thread/read","params":{"threadId":"<CODEX_THREAD_ID>","includeTurns":false}}
   ```

   Check the returned identity and directory against this task's known session and checkout.
   Stop dependent work if the thread is unavailable or the directory changed unexpectedly.
7. Check that the target checkout exists. Send only the thread identity and target directory:

   ```json
   {"id":3,"method":"thread/settings/update","params":{"threadId":"<CODEX_THREAD_ID>","cwd":"/absolute/path/to/worktree"}}
   ```

   An empty successful result acknowledges the request. It does not prove that the active turn changed directory.

## Continue after the switch

After the update tool call returns, read the same thread again in a separate call.
In the observed run, an immediate read inside the update call still returned the old directory.
A later call returned the target directory. Do not treat the request acknowledgment as the readback.
If the readback still differs, report the switch as unverified and stop dependent edits or removal.

When the host readback matches, arrange one continuation in the same thread:

```sh
codex queue --thread "$CODEX_THREAD_ID" --message '<continuation of the authorized task>'
```

Identify this message as an assistant-generated continuation, not a new user instruction.
Include the target directory, the next check, remaining work and existing authorization.
Queue only the work already authorized. Do not create another thread or repeatedly enqueue the same continuation.
Check that the command reports a queued message. Then end the current turn.
If queuing is unavailable, report the pending continuation without claiming that it ran.

At the start of the next turn:

1. Check that the host-provided environment names the target directory.
2. Run `pwd` without a `workdir` argument or preceding `cd`.
3. Check the Git root and branch. Continue only when they match the intended checkout.

To retire a worktree, use this same sequence with the main checkout as the target.
Perform the skill's retirement checks and removal after the next turn shows the main checkout as its default directory.
Updating host state during a turn does not release that turn's old checkout.

## Other supported entry points

If the local service route is unavailable, use the host's supported directory control.
The CLI also supports an explicit directory when resuming the same session:

```sh
codex resume <session-id> -C /absolute/path/to/worktree
```

This is an outer host operation. Starting a nested CLI through a command tool does not relocate the caller's session.
Explain the specific missing capability when the user must perform this operation.
Do not infer that `cd`, `workdir`, another thread, or an edited transcript substitutes for it.

## Evidence and limits

The observed sequence changed the same thread's service readback, then changed the next turn's default `pwd` and host-provided context.
Returning to the main checkout and queuing cleanup also succeeded in that session.
These observations establish directory switching for the stated environment.
They do not establish automatic Stop or SubagentStop feedback in every host configuration.
A manually invoked hook with an explicit `cwd` verifies only that invocation.

Upstream references: [App Server protocol and transports](https://developers.openai.com/codex/app-server),
[hook working directory and input fields](https://developers.openai.com/codex/hooks),
and [CLI resume directory selection](https://developers.openai.com/codex/cli/reference).
Use the matching generated schema for fields absent from the published guide.
