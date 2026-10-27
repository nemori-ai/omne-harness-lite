#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { collaborationToolRoot } from './collaboration-bootstrap.ts'
import { installCollaboration } from './collaboration-installation.ts'
import { InputError } from './protocol.ts'

export const collaborationInstallUsage = `Usage:
  collaboration-install-cli.ts --descriptor FILE --sha256 DIGEST

Explicitly adopt the reviewed descriptor in this clean, pinned source tool checkout.
This command records the operator's adoption. It does not grant a task or accept a result.
The same descriptor is idempotent. A different adoption requires a new tool checkout.
Ordinary request, line and watch commands cannot select or replace this installation.`

export function installCollaborationCli(args: string[], root: string): string {
  if (args.length === 1 && args[0] === '--help') return collaborationInstallUsage
  const { values, tokens } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    tokens: true,
    options: { descriptor: { type: 'string' }, sha256: { type: 'string' } },
  })
  const names = tokens.filter(token => token.kind === 'option').map(token => token.name)
  if (
    new Set(names).size !== names.length ||
    values.descriptor === undefined ||
    values.sha256 === undefined
  )
    throw new InputError('collaboration-installation-options')
  const installation = installCollaboration(
    root,
    readFileSync(values.descriptor, 'utf8'),
    values.sha256,
  )
  return JSON.stringify({
    schemaVersion: 1,
    operation: 'install-collaboration',
    status: 'adopted',
    repo: installation.repository,
    toolCommit: installation.toolCommit,
    descriptorSha256: values.sha256,
    effects: ['local installation only; no remote writes or acceptance'],
  })
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    process.stdout.write(
      installCollaborationCli(process.argv.slice(2), collaborationToolRoot()) + '\n',
    )
  } catch (error) {
    process.stderr.write(
      JSON.stringify({
        operation: 'install-collaboration',
        status: 'failed',
        errorCode:
          error instanceof InputError ? error.message : 'collaboration-installation-unavailable',
      }) + '\n',
    )
    process.exitCode = 2
  }
}
