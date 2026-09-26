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
const readme = `# omne governance CLI

Requires preinstalled Node.js 24.21.0. Tested: macOS arm64, Linux arm64 and amd64. macOS Intel has not been verified.

Obtain this archive AND its SHA256 through a trusted channel. A checksum verifies bytes, not authorship. Compare with shasum -a 256 ARCHIVE (macOS) or sha256sum ARCHIVE (Linux), then extract into a NEW empty directory:

    mkdir chosen-new-directory
    tar -xzf ARCHIVE -C chosen-new-directory
    node chosen-new-directory/app/dist/main.js --version
    node chosen-new-directory/app/dist/main.js --help

Run machine commands for redirected output. Human governance commands require a terminal. Credentials come from protected files; there is no interactive password input. The entire UTF-8 file is used, including a final newline or spaces: nothing is trimmed or normalized. A file made with echo and one made with printf without a newline are different credentials. Preserve the exact contents for later login, and check the export/editor newline setting when creating the file. There is no administrator password reset. The governance TUI is an implementation increment with incomplete terminal acceptance; run tui --help for the precise adopted terminal profile and limitations. Do not infer TUI compatibility from the CLI platform list above. Use an explicit --state-dir absolute directory to preserve the intended local identity across code upgrades. Its parent must already exist; do not copy state into this code directory.

For a code upgrade, unpack into another new directory and retain the old code. Retention does not guarantee older code can read newer state. This tool performs no migration, automatic rollback, global install, download or upload. Do not overwrite an active installation. Center compatibility must be checked before use.

build-info.json lists packaged files and relative symlinks. BUILD_ID identifies that list (excluding itself and build-info.json). This is not a byte-reproducible-build claim. Never store credentials or local client state inside this artifact directory.
`
const definition = {
  member: '@omne-harness-lite/cli',
  stagingPrefix: '.omne-cli-package-',
  format: 'omne-cli-build/1',
  version: '0.0.0',
  readme,
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
