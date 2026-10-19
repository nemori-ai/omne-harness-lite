// What the two entry points of the facility read the same way: the command line, the workspace
// root and the member with its policy.
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { readPolicy, type Policy } from './closure.ts'

const FLAGS = new Set(['--allow-network'])

/** Reads `--name value` pairs and the bare flags; anything else is a usage error. */
export function parseArguments(argv: readonly string[], usage: string): Map<string, string> {
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (key === undefined || !key.startsWith('--'))
      throw new Error(`cannot read arguments\n${usage}`)
    if (FLAGS.has(key)) {
      values.set(key, 'true')
      continue
    }
    const value = argv[index + 1]
    if (value === undefined) throw new Error(`cannot read arguments\n${usage}`)
    values.set(key, value)
    index += 1
  }
  return values
}

function findWorkspaceRoot(from: string): string {
  for (let directory = from; ; directory = dirname(directory)) {
    if (existsSync(join(directory, 'pnpm-workspace.yaml'))) return directory
    if (dirname(directory) === directory) throw new Error(`no pnpm-workspace.yaml above ${from}`)
  }
}

export type MemberOptions = Readonly<{
  memberDirectory: string
  workspaceRoot: string
  policy: Policy
  allowNetwork: boolean
  storeDirectory?: string
}>

/** The member, workspace, policy, network permission and store that every run needs. */
export function memberOptions(options: ReadonlyMap<string, string>): MemberOptions {
  const memberDirectory = resolve(options.get('--member') ?? process.cwd())
  const storeDirectory = options.get('--store-dir')
  return {
    memberDirectory,
    workspaceRoot: resolve(options.get('--workspace-root') ?? findWorkspaceRoot(memberDirectory)),
    policy: readPolicy(
      resolve(
        options.get('--policy') ?? join(memberDirectory, 'tests/fixtures/install-policy.json'),
      ),
    ),
    allowNetwork:
      options.has('--allow-network') || process.env['OMNE_INSTALL_ALLOW_NETWORK'] === '1',
    ...(storeDirectory === undefined ? {} : { storeDirectory: resolve(storeDirectory) }),
  }
}
