# Linux service templates

These files are installation templates, not an installer. Replace the Node and artifact paths, service user/group, data directory, environment-file path and socket directory together before installing. The packaged Node requirement is 24.21.0. macOS can run the same host commands directly; these units require Linux systemd.

Create the dedicated non-root service account and its private data directory (`0700`). Keep code releases outside the data directory. Generate deployment keys once as that account, supply the TLS certificate/key and configure the variables listed in the artifact README. The environment file must be `0600`; all secret files must be readable by the service account and inaccessible to other users. For these templates set `OMNE_TENANCY_OPS_SOCKET_DIR=/run/omne-tenancy`. systemd creates this private runtime directory. `OMNE_TENANCY_BACKUP_DIR` is optional; its default is the canonical database filename plus `.backups`. An explicitly selected backup directory needs an existing parent.

Before installation, validate the edited files on the target machine:

```sh
systemd-analyze verify omne-tenancy.service omne-tenancy-backup.service omne-tenancy-backup.timer
```

Install the three edited units in `/etc/systemd/system`, then run these administrative commands:

```sh
systemctl daemon-reload
systemctl enable --now omne-tenancy.service
systemctl enable --now omne-tenancy-backup.timer
systemctl status omne-tenancy.service
journalctl -u omne-tenancy.service -u omne-tenancy-backup.service
```

Run the following commands as the service account, replacing executable paths consistently:

```sh
/opt/node-v24.21.0/bin/node /opt/omne-tenancy/current/app/dist/cli.js ops --socket-dir /run/omne-tenancy full-health
/opt/node-v24.21.0/bin/node /opt/omne-tenancy/current/app/dist/cli.js ops --socket-dir /run/omne-tenancy backup --only-if-due
/opt/node-v24.21.0/bin/node /opt/omne-tenancy/current/app/dist/cli.js ops --socket-dir /run/omne-tenancy backup-status
```

Inspect `backup-status` and the backup unit's journal daily. A timer firing is not a successful backup. The backup unit does not start a stopped center. An unsuccessful or unconfirmed invocation is recorded as a service failure; it has no automatic request retry. Keep enough free space and move completed backups to an independent protected location when available. Backups are not automatically deleted. Both status and the hourly due check fully copy and validate every matching candidate (including SQLite integrity checks); they are not cheap file-list checks. The whole run requests cancellation after five minutes and still waits for actual resource cleanup. There can be at most 256 matching backup names, including invalid entries; going above that returns capacity. A current status with exit 0 can still have a nonzero invalidCount: inspect that field as well as health. Choose a retention window and periodically move old completed envelopes to a separate private archive directory, keeping the scanned directory small. Do not wait until the candidate or time limit has stopped daily backups; moving files on the same machine is not independent disaster protection.

For local file checking and isolated restoration, select a separate private work directory whose parent already exists, is owned by the same user and has mode `0700`. Choose a work-directory path that does not yet exist and let the tool create and mark it. A previously used, intact marked work directory can be reused; a manually created empty directory is refused. Place the restore work directory on the target filesystem. The target must be a new directory, even an existing empty directory is refused:

```sh
node app/dist/cli.js verify --source /absolute/backup.omne-backup --work-dir /absolute/private/verify-work
node app/dist/cli.js restore-isolated --source /absolute/backup.omne-backup --target /absolute/private/new-restored --work-dir /absolute/private/restore-work
```

Restoration produces `data.omne-backup` and reports `businessOpen:false`; it is not a database to pass to `serve`. Keep the isolated work roots and their `.omne-isolated` markers intact. Same-machine backups do not cover destruction of that machine or disk.

Initialize each new work directory with one command at a time. Two commands racing to create the same new directory can leave an unmarked root after both refuse; a crash during initialization can do the same. After confirming both processes have exited, preserve that root and select a fresh path. Do not add a marker yourself or infer from an empty directory that it is safe to reuse. Once marked initialization succeeds, concurrent commands using that same root are refused as busy while another command owns it.

After a crash or forced kill, a marked work root may retain task-* directories containing plaintext snapshot.sqlite copies. Status does not list these, and the program only removes its own current task. To inspect or remove old task directories, first stop the center and all offline maintenance commands and confirm they have actually exited. Review exact task paths under the known marked work root; remove only confirmed old task children as the owning user. Keep the work root, its .omne-isolated marker and lock file intact. Never move leftover plaintext outside the protected root or try to serve it. Do not delete markers to fix a startup refusal. If a root or marker is damaged, preserve it and choose a fresh private backup/work location after confirming the old process has exited.

For an upgrade, verify and extract the new artifact into a new release directory. Stop the service and wait until it is inactive before switching the `current` link. Start the service and check both public connectivity and full health. A `still-stopping` record means shutdown is still waiting; the service has no normal forced-kill deadline. Retaining old code does not authorize opening a migrated database with it. If startup fails, inspect the named failure and upgrade-snapshot location before another attempt. The maintenance root is backup-directory/.quarantine; a busy root requires the other maintenance process to finish, while an unavailable root requires checking ownership, permissions, the existing marker and free space. Preserve these directories while diagnosing the failure.

Backup readers accept only this build's current complete migration sequence and structure. After an upgrade that changes that format, older envelopes may be invalid-backup to the new reader and status may become missing. Retain the matching old code to verify old envelopes offline, keep old and new backup catalogs separate, and make and verify a new-format backup after the upgraded center is healthy. Keeping old code never authorizes starting old business data.

Command exit codes: `0` for a successful operation or current backup status; `2` for missing/overdue status or a declared refusal; `1` for unavailable dependencies, uncertain results, internal/cleanup or output failure; `64` for syntax. A successful full-health command means the reply was received; inspect its individual health fields.

An optional operator JSON file stays outside the code directory. With the same service environment and user, inspect it before starting:

```sh
node /opt/omne-tenancy/current/app/dist/cli.js serve --plugins /absolute/private/plugins.json --print-plugins
```

This prints redacted rows and sources without creating the data, backup or socket directories. To use the file in systemd, add `--plugins /absolute/private/plugins.json` to the edited `ExecStart`; the default template uses an empty operator layer. Keep the file with the service configuration and readable by the service user. Invalid edits or missing required roles fail before resources open.
