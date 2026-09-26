import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  packageArtifact,
  runPackaging,
  runtime,
  type PackagingRuntime,
} from '@omne-harness-lite/artifact-builder'

const readme = `# omne governance center

Requires preinstalled Node.js 24.21.0. This is a local portable build, not an installed service. Validate the archive on the intended host before deployment. Linux systemd installation templates and maintenance command instructions are included in app/deploy/README.md; install only after validating them on the target machine.

Obtain the archive AND its SHA256 through a trusted channel. A digest verifies bytes, not authorship. Check with sha256sum ARCHIVE (Linux) or shasum -a 256 ARCHIVE (macOS). Extract into a NEW empty directory, never over an active installation:

    mkdir chosen-new-directory
    tar -xzf ARCHIVE -C chosen-new-directory
    node chosen-new-directory/app/dist/cli.js --version

Keep runtime data and all keys OUTSIDE the code directory. Use private directories owned by the service user (0700); keys must be regular owner-readable files with no group/other access. Generate deployment keys once in a NEW directory:

    node chosen-new-directory/app/dist/cli.js keygen /absolute/new/deployment-keys

The JSON output supplies four environment variable names and paths; use those exact _FILE entries in the service environment. Keep these keys with the center data, do not regenerate them on every start. Supply a server certificate chain and private key for the client-visible DNS/IP; clients must trust its CA through a separate trusted channel. This tool does not create or trust a production TLS CA.

Configure environment (paths and listen address below are placeholders to replace):

    OMNE_TENANCY_STORAGE_FILE=/absolute/private/center.sqlite
    OMNE_TENANCY_ENTRY_LISTEN=127.0.0.1:8443
    OMNE_TENANCY_ENTRY_TLS_CERT_CHAIN_PEM_FILE=/absolute/tls/chain.pem
    OMNE_TENANCY_ENTRY_TLS_PRIVATE_KEY_PEM_FILE=/absolute/tls/key.pem
    OMNE_TENANCY_OPS_SOCKET_DIR=/absolute/private/ops
    OMNE_TENANCY_BACKUP_DIR=/absolute/private/backups
    OMNE_TENANCY_UNACTIVATED_RETENTION=P7D
    OMNE_TENANCY_INVITATION_TTL_DEFAULT=P14D
    OMNE_TENANCY_AFFILIATION_REQUEST_TTL_DEFAULT=P14D
    OMNE_TENANCY_COPY_NOTICE_TTL_DEFAULT=P7D
    OMNE_TENANCY_SHARING_INVITATION_TTL_DEFAULT=P7D
    OMNE_TENANCY_TEAM_CREATION_KEY_RETENTION=P1D
    OMNE_TENANCY_CLOCK_READY_TIMEOUT=15000
    OMNE_TENANCY_CREDENTIAL_POLICY={"minLength":12}

The four deployment key _FILE variables from keygen are also required. Export the environment through your process supervisor or shell (quote JSON values when using a shell), then run:

    node chosen-new-directory/app/dist/cli.js serve

For intranet access explicitly set the intended listening address and arrange routing, firewall and matching TLS names. The loopback example does not expose an intranet service. SIGTERM/SIGINT request orderly shutdown. Do not launch another center against the same database. Do not use an unverified old backup as a live database.

For code upgrades retain old code and unpack to another new directory; stop the center before changing its executable. Keeping old code does not guarantee it can read a migrated database. This packager performs no migration, rollback, install, upload or download. Follow the accepted upgrade/recovery procedure separately.

build-info.json lists files and relative internal symlinks. BUILD_ID identifies that list, excluding the manifest and marker. It is not a reproducible-build or protocol-version claim. Never put runtime databases, login records, TLS material or deployment keys inside the artifact.
`
const definition = {
  member: '@omne-harness-lite/tenancy-host',
  stagingPrefix: '.omne-host-package-',
  format: 'omne-tenancy-host-build/1',
  version: '0.0.0',
  readme,
}
export function packageHost(root: string, target: string, io: PackagingRuntime = runtime) {
  return packageArtifact(root, target, definition, io)
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.on('error', () => {})
  await runPackaging(
    fileURLToPath(new URL('../../../', import.meta.url)),
    process.argv.slice(2),
    definition,
  ).catch(() => {
    process.stderr.write(
      'omne-host-package: failed; an already published complete output may remain\n',
    )
    process.exitCode = 1
  })
}
