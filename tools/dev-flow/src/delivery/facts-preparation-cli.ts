#!/usr/bin/env node
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseCliOptions } from './cli-options.ts'
import { deployedCollaboration } from './collaboration-bootstrap.ts'
import type { FactsPreparationResult } from '../integration/prepare-delivery-facts.ts'
import { InputError } from './protocol.ts'

export const factsPreparationUsage = `Usage:
  facts-preparation-cli.ts --repo owner/name --dispatch ISSUE_COMMENT_URL [--retry-failed]

Prepare published facts through the adopted installation. Each call observes once and returns.
Repeat the same command to observe the same durable operation. Unknown dispatches are never resent.
--retry-failed permits a new production generation only after an exact failed run and absent facts.
Keep the installation's private Git directory and journal when moving the reduce owner.
Independent journals do not coordinate writers. Ready facts still require release-time authority checks.`

type Bootstrap = (repo: string) => {
  prepareFacts:
    | ((dispatch: string, options: { retryFailed: boolean }) => FactsPreparationResult)
    | undefined
}

export function runFactsPreparationCli(
  args: string[],
  bootstrap: Bootstrap = deployedCollaboration,
) {
  if (args.length === 1 && args[0] === '--help') return { code: 0, output: factsPreparationUsage }
  const values = parseCliOptions(
    args,
    { values: ['--repo', '--dispatch'], flags: ['--retry-failed'] },
    factsPreparationUsage,
  )
  const repo = values.values.get('--repo'),
    dispatch = values.values.get('--dispatch')
  if (repo === undefined || dispatch === undefined)
    throw new InputError('facts-preparation-options')
  const prepare = bootstrap(repo).prepareFacts
  if (prepare === undefined)
    throw new InputError('facts-preparation-producer-installation-required')
  const result = prepare(dispatch, { retryFailed: values.flags.has('--retry-failed') })
  return {
    code: result.status === 'ready' ? 0 : result.status === 'pending' ? 3 : 2,
    output: JSON.stringify({ schemaVersion: 1, operation: 'prepare-facts', ...result }),
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const result = runFactsPreparationCli(process.argv.slice(2))
    process.stdout.write(result.output + '\n')
    process.exitCode = result.code
  } catch (error) {
    process.stderr.write(
      JSON.stringify({
        operation: 'prepare-facts',
        status: 'unknown',
        diagnostic: error instanceof InputError ? error.message : 'facts-preparation-unavailable',
      }) + '\n',
    )
    process.exitCode = 2
  }
}
