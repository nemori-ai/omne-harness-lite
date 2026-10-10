import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  packageArtifact,
  runPackaging,
  runtime,
  type PackagingRuntime,
} from '@omne-harness-lite/artifact-builder'
export {
  digest,
  inventory,
  runtime,
  type PackagingRuntime,
} from '@omne-harness-lite/artifact-builder'
const readme = `# OMNE CLI

Requires Node.js 24.21.0 on PATH. The archive contains the CLI and its production dependencies. It does not contain Node.js. The current Shell provider requires Linux, a working systemd user manager and scopes, /usr/bin/env, /usr/bin/stty, and /bin/bash. An archive for another platform does not establish Shell support.

Get the archive and its SHA256 digest from a trusted channel. Compare the digest with sha256sum (Linux) or shasum -a 256 (macOS). A matching digest checks the bytes, not the publisher.

Install into a new directory. The recommended code location is ~/.local/share/omne/builds/<BUILD_ID>. The command link is ~/.local/bin/omne. For example, from the directory that contains the verified archive:

    archive="$PWD/omne-cli.tar.gz"
    build_id=$(tar -xOf "$archive" app/BUILD_ID)
    install_dir="$HOME/.local/share/omne/builds/$build_id"
    mkdir -p "$HOME/.local/share/omne/builds" "$HOME/.local/bin"
    mkdir "$install_dir"
    tar -xzf "$archive" -C "$install_dir"
    ln -s "$install_dir/app/bin/omne.js" "$HOME/.local/bin/omne"
    export PATH="$HOME/.local/bin:$PATH"
    omne --version
    omne --help

An existing install directory or command link causes these commands to stop. Do not overwrite an active installation. To change versions, unpack into a new directory and deliberately change the command link. This does not stop an existing Session host or roll back its data format.

Use omne to start a terminal session. The entry prepares a governance center, login, tenant, and model configuration when needed. A configured entry starts or attaches to the tenant's independent Session host. Exiting the terminal detaches the client. It does not stop an executing Run.

Interactive input requires a supported terminal and an explicit OMNE_TERMINAL_PROFILE. Linux uses xterm-379 with allowPasteControls=false. macOS uses iterm-3.7.1beta1 with the documented paste restrictions. The terminal must be a direct, exclusive UTF-8 TTY, at least 60 columns by 16 rows. A platform build does not verify a terminal profile. For iTerm, disable special paste, file URL paste, auto-composer, broadcasting, tmux, key pass-through during paste, and terminal paste cancellation. Finish IME composition before pasting. Do not set NoSyncTurnOffBracketedPasteOnHostChange=true or accept a prompt to disable bracketed paste.

For redirected output, use the documented --json commands. omne --message-file <path> --json [--session <id>] reads a complete JSON UserMessage and uses an already configured, running tenant host. The message file is not a plain-text prompt.

Local data is separate from this code directory. The root is --home <absolute-path>, otherwise OMNE_HOME, otherwise ~/.omne. It holds the root catalog and separate tenant directories for authentication, assets, logs, and sessions. Use the same home when changing the code version. Do not put secrets or local state in the installation.

Credentials come from protected files. The complete UTF-8 text is used, including spaces and final newlines. Nothing is trimmed. Preserve these bytes for later login. There is no administrator password reset in this release.

BUILD_ID identifies the packaged inventory in build-info.json. It is not a reproducible-build or signature claim. The packaging command does not install, upload, or modify account state.
`
const definition = {
  member: '@omne-harness-lite/cli',
  stagingPrefix: '.omne-cli-package-',
  format: 'omne-cli-build/1',
  version: '0.0.0',
  readme,
  verifyScript: `import { createRequire } from 'node:module';
const host = import.meta.resolve('@omne-harness-lite/execution-environments-host');
createRequire(host)('node-pty');`,
}
export function packageCli(root: string, target: string, io: PackagingRuntime = runtime) {
  return packageArtifact(root, target, definition, io)
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.on('error', () => {})
  await runPackaging(
    fileURLToPath(new URL('../../../', import.meta.url)),
    process.argv.slice(2),
    definition,
  ).catch(() => {
    process.stderr.write('omne-package: failed; an already published complete output may remain\n')
    process.exitCode = 1
  })
}
