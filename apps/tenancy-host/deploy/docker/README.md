# Docker governance center delivery

These files implement the adopted Docker mapping at
`.meta_harness/design/realization/apps/tenancy-host/docker.md` (D-071 stop,
D-072 one-process health, PF017 projection v8).
The supported Linux root operator is `omne-center`; it selects the two fixed Compose
files and checks the actual Docker container before starting it. Direct `compose up`,
`down`, `restart`, or a direct signal to PID 1 bypasses the supported lifecycle.
Nothing here installs itself on a host.

## Build and identify an image

On a development checkout with Node 24.21.0 and pnpm 10.28.1, build the host
production archive, extract it into a new directory, and build each platform
separately:

```sh
scripts/package-tenancy-host.sh /absolute/new/host.tar.gz
mkdir /absolute/new/unpacked
tar -xzf /absolute/new/host.tar.gz -C /absolute/new/unpacked
scripts/build-tenancy-image.sh --app /absolute/new/unpacked/app --platform linux/arm64 --output /absolute/new/center-arm64.tar
scripts/build-tenancy-image.sh --app /absolute/new/unpacked/app --platform linux/amd64 --output /absolute/new/center-amd64.tar
```

The builder validates the manifest, `BUILD_ID`, packaged Dockerfile and health
probe, rejects platform binaries and private runtime files, checks the image labels
against its actual `--version`, and publishes each Docker save archive exclusively.
Keep each one-line JSON result with its source archive and trusted SHA256. On the
destination host, compare `sha256sum /absolute/new/center-arm64.tar` (or the amd64
archive) with the trusted result **before** `docker load --input` and retain the
load output. Resolve the exact reference reported by that load to its **local**
immutable ID with `docker image inspect REFERENCE_FROM_LOAD --format '{{.Id}}'`.
Use that local `sha256:...` ID for subsequent commands. Check
`docker image inspect LOCAL_IMAGE_ID` for the intended `linux/arm64` or
`linux/amd64` platform and the three labels
`org.opencontainers.image.version`, `ai.nemori.omne.host-build-id`, and
`ai.nemori.omne.distribution=tenancy-host-docker/1`; check
`docker run --rm --network none --pull never LOCAL_IMAGE_ID --version` against
the app version in the trusted packaged `app/build-info.json` and the `buildId`
in the trusted image-build result (which must match packaged `app/BUILD_ID`).
The producer's image ID is a source coordinate: containerd and legacy image stores
may assign different local IDs to the same archive. A local image can have no
`RepoDigest`; neither a mutable tag nor ID equality with the producer replaces
archive verification.
The base image index is fixed at Node 24.21.0.

## Prepare private directories and settings

This version supports a Linux local filesystem and rootful Docker Engine 29.1.3,
Compose 2.40.3 (or the checked Desktop `2.40.3-desktop.1` CLI). Pin the supported
Engine and Compose packages, or exclude them from automatic upgrades using the
local distribution's package administration. Plan a version change through the
stop, actual exit, Engine maintenance and compatibility checks below. The helper runs as
host root; the application UID/GID defaults to 10001/10001 and can be an explicit
other positive pair. Before calling the helper,
prepare the whole state root and its `data`, `offline-work`, and `restores` children
as real 0700 directories owned by that pair. `backups` may be absent for the storage
provider to initialize or an existing matching 0700 directory. The whole state root
contains the database, source owner locks, upgrade guard, backup quarantine and
permanent isolation markers. Do not move it, redirect its mount or add a marker to
a host ancestor while automatic recovery may restart the container. Explicit
validation and start refuse symlinks and marker-bearing state ancestors.

Prepare a separate real 0700 secrets directory owned by the application UID/GID.
Use the verified image once to generate the four deployment keys into that empty
directory. For example:

```sh
docker run --rm --network none --user 10001:10001 \
  --mount type=bind,src=/absolute/private/secrets,dst=/secrets \
  sha256:YOUR_VERIFIED_IMAGE_ID keygen /secrets
```

Never regenerate the keys on each start. Supply the TLS chain and private key for
the client-visible private or loopback address as `tls-chain.pem` and
`tls-private.pem` in that directory. The six files must be regular non-symlinks,
0600, owned by the application pair. Clients trust the issuer through a separate
trusted channel; this tool does not create or trust a production CA. Keep secrets
out of the image and state root. Repository TLS fixtures are only for tests.

Copy `settings.env.example` to a separate root-owned 0600 file and fill its seven
required entries with the deployment's values. The optional credential policy may
also be present. This is Compose raw `env_file` syntax: single-line `KEY=value`,
comments and empty lines. Do not `source` it. Unknown, missing or duplicate keys
fail validation without printing values. `validate` checks structure and deployment
boundaries; the application's parser checks duration and cross-field semantics on
`start`. State, socket, TLS and key paths are fixed by Compose.

## Validate, start, observe, stop

Install `omne-center` executable at `/usr/local/libexec/omne-center` with both
fixed Compose files beside it. It needs Docker CLI/Compose, Bash 4 or newer, GNU coreutils,
jq and util-linux `flock`; it needs no host Node. The only Docker daemon override
is a local Unix `DOCKER_HOST` socket. Use a lowercase project token such as
`office1`:

```sh
omne-center validate --project office1 --image sha256:YOUR_VERIFIED_IMAGE_ID \
  --state-dir /absolute/private/state --secrets-dir /absolute/private/secrets \
  --settings-file /absolute/private/settings.env \
  --publish-address 10.0.0.10 --publish-port 8443
omne-center start --project office1 --image sha256:YOUR_VERIFIED_IMAGE_ID \
  --state-dir /absolute/private/state --secrets-dir /absolute/private/secrets \
  --settings-file /absolute/private/settings.env \
  --publish-address 10.0.0.10 --publish-port 8443
omne-center status --project office1
omne-center full-health --project office1
omne-center stop --project office1
```

Use `--uid` and `--gid` on `validate`/`start` for a different prepared pair.
`--startup-wait` defaults to 120 seconds and bounds the operator's health
observation, not the application's normal shutdown. `--observation-interval` and
Docker health/log policy flags are configurable positive values. Observation expiry
sends one explicit `docker kill --signal=SIGTERM` to the exact container, waits
without a kill deadline, and checks the complete `docker wait` code against that
same container's actual `exited`/`ExitCode`; it does not roll back a confirmed
migration. A clean result means only that the application was observed exiting
with code 0. Nonzero exit is `stopped-with-error`; request failure, lost or invalid
wait output, or contradictory inspection is unknown. Start still fails even after
a clean shutdown. CLI exit 0 or Docker `running` alone is not health.

If the exact center is already exited at the initial stop check, the helper reports
`stop-intent-unconfirmed` with its ID and exit code and returns nonzero. Docker
Engine 29.1.3 can skip recording a manual stop for an already exited container;
do not infer that `unless-stopped` will keep it down after an Engine restart.

`status` reads the actual container and immutable image identity without creating
or starting anything. It distinguishes absent, stopped, restarting, healthy and
identity-unavailable states. The Engine may not expose the previous exit of a
currently running container; that field remains unknown. `start` and `stop` take
a nonblocking project lock in `/run/omne-center`; a concurrent supported lifecycle
request fails busy. If the helper is killed or loses the Engine during a request,
the result remains unknown. Its Docker CLI/Compose child processes can retain the
project `flock` file descriptor after the helper exits. Inspect the exact lock
holders, process ancestry and file descriptors (for example, `lslocks`,
`fuser -v /run/omne-center/office1.lock`, `ps -o pid,ppid,stat,cmd -p PID` and
`/proc/PID/fd` on Linux). Lock release or a single stopped sample does not prove
a late Engine request is finished. Establish the old request's termination and
recheck its exact container before another lifecycle mutation; never remove the
lock file or kill a guessed PID to bypass an unknown request. The helper does not
automatically replay it.

Docker alone owns `unless-stopped` automatic restart after an unplanned process
exit, including exit 0. A completed supported stop keeps its Engine stop intent
across a planned restart only when Engine metadata storage is healthy and no daemon
shutdown or external manager races this operation. The helper cannot verify every
part of that condition. For planned Engine or host maintenance stop the timer,
stop the center and verify actual exit before maintenance; then explicitly start,
check health, and resume the timer. Unplanned daemon/host loss is crash recovery,
not normal cleanup.
The Engine may retry indefinitely. Inspect `status` and logs instead of assuming
health. `omne-center status --project office1` gives the exact `containerId`;
`docker logs --timestamps EXACT_CONTAINER_ID` reads that container's retained
logs without adding another application or helper logs API. The configured log
rotation limits how much remains available.

## Backup and isolated maintenance

Running-center operations only exec the original host CLI as the container user:

```sh
omne-center backup --project office1 --only-if-due
omne-center backup-status --project office1
omne-center full-health --project office1
```

These calls never start a stopped center. A disconnected or killed client has an
unconfirmed result; do not automatically replay a write. Read the next
`backup-status` for the server's confirmed fact. Inspect its health and invalid
count daily. Monitor failed `omne-center-backup@office1.service` runs and the
daily freshness of a confirmed backup; the timer does not retry an unknown write.
Move completed envelopes to an independent protected location under
the original maintenance procedure. A copy on the same machine is not independent
disaster recovery.

For offline work, keep the source envelope under the same whole state root,
choose a work directory under `offline-work`, and a _nonexistent_ restore target
under `restores`. Existing parents must be private 0700 and owned by the application
pair. The original provider decides whether an existing marked work root is usable.
The maintenance Compose has no serve settings, secrets, port or socket:

```sh
omne-center verify --project office1 --image sha256:YOUR_VERIFIED_IMAGE_ID \
  --state-dir /absolute/private/state \
  --source /absolute/private/state/backups/backup.omne-backup \
  --work-dir /absolute/private/state/offline-work/check-001
omne-center restore-isolated --project office1 --image sha256:YOUR_VERIFIED_IMAGE_ID \
  --state-dir /absolute/private/state \
  --source /absolute/private/state/backups/backup.omne-backup \
  --work-dir /absolute/private/state/offline-work/restore-001 \
  --target /absolute/private/state/restores/restore-001
```

The helper reports the unique task name, exact container ID and host↔`/state`
mapping on stderr. Its stdout carries only the original maintenance JSON and LF.
One-off containers remain for diagnosis. `omne-center maintenance-status --project
office1 --container-id EXACT_ID` reads the task's actual state, image identity,
exit and produced output without starting it. Handled SIGTERM/Ctrl-C sends one
explicit TERM to an already verified exact task ID and waits for its actual exit;
if the task completed first, its original output and exit code still decide the
result. Before the ID is verified, or after SIGKILL/client loss, the result is
unknown; do not remove its container, work root, lock or marker while work may
continue. After checking the exact project/action labels, an operator may use
`docker kill --signal=SIGTERM EXACT_ID`, then `docker wait EXACT_ID` and inspect
the same ID's actual `exited`/`ExitCode`. If it was already exited, inspect its
retained output without sending another signal. Do not resend an uncertain request.
Remove only a confirmed stopped task after preserving output and diagnostics.
An isolated restore reports `businessOpen:false`; never hand it directly to
`serve` or treat it as a safely reopened center.

## Timer, upgrades and retained records

The optional `omne-center-backup@` unit templates must be checked with
`systemd-analyze verify` and explicitly installed under `/etc/systemd/system`.
The service calls the helper as root and has no `Wants`, `Requires` or `BindsTo`
relation with Docker or center. The timer is hourly and `Persistent=true`;
the application's `only-if-due` decides whether a backup is needed. Explicitly
enable a project instance, for example
`systemctl enable --now omne-center-backup@office1.timer`. An unavailable Engine
or stopped center fails the service without starting either. It does not retry
an unknown write.

For an upgrade, verify the new image source, archive digest, labels and offline
`--version`/`BUILD_ID`. Stop the timer, stop the existing center and check its
actual exit before maintaining or upgrading Docker Engine/Compose; verify the
new versions against this deployment's supported behavior. Then start with the
new image and the same state root. Before Compose
may replace a stopped container, the helper exports currently retrievable
stdout/stderr and non-secret identity/terminal metadata to root-owned 0700
`state/operations`. Failed export refuses replacement and preserves the old
container. The local log driver rotates at the configured size/count; export
cannot recover already rotated records. Keep the old image to check old backup
envelopes, but never start old code on a migrated database merely because it is
present. An unhealthy new start preserves guard and diagnostics; no automatic
schema rollback or old-image restart occurs. Resume the timer only after healthy
start. Do not delete permanent markers or unconfirmed plaintext work roots to
make a deployment pass.

No dedicated TUI-to-Docker interaction was tested here; prior terminal and profile
evidence retains its recorded scope.

The image also accepts `serve --plugins <container-path> --print-plugins` with the same deployment environment. Use a path in an existing bind mount, such as `/state/plugins.json`; the file remains outside the image. Omit `--print-plugins` to start that operator layer. The shipped Compose command uses the empty layer; a locally maintained command override must pass the same arguments. Printing redacts all configuration and creates no data or listener resources. Host role and dependency checks still apply.
