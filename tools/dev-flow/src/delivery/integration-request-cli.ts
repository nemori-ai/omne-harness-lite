#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { IntegrationError } from '../integration/parse.ts'
import { deployedCollaboration } from './collaboration-bootstrap.ts'
import { strictJson } from './strict-json.ts'
import { parseRequestInput } from './collaboration-parse.ts'
import { runGhCommand, type GhCommand } from './github-read.ts'
import { submitIntegrationRequest, type RequestBootstrap } from './integration-request.ts'
import { InputError } from './protocol.ts'

export const integrationRequestUsage = `Usage:
  integration-request-cli.ts submit|recover --repo owner/name --input request.json --operation-id UUID --journal directory

Input is canonical RequestInput v1. Prepare and freeze the report, verification and complete
writer/process stop declaration before submit. registered confirms the receipt, not integration.
unknown keeps the candidate frozen; recover reads the same request without another dispatch.
Evidence accepts same-repository Issue comments and immutable GitHub blob URLs.
The installed descriptor supplies authority; request JSON cannot override it.`

export type IntegrationRequestDriver = {
  call: GhCommand
  bootstrap: (repo: string) => RequestBootstrap
  stdout: (text: string) => void
  stderr: (text: string) => void
}

export function deployedRequestBootstrap(repo: string): RequestBootstrap {
  return deployedCollaboration(repo).request
}

export function runIntegrationRequestCli(
  args: readonly string[],
  driver: IntegrationRequestDriver,
): number {
  let repo: string | null = null,
    operationId: string | null = null
  try {
    if (args.length === 1 && args[0] === '--help') {
      driver.stdout(integrationRequestUsage + '\n')
      return 0
    }
    const [mode, ...rest] = args
    if (mode !== 'submit' && mode !== 'recover')
      throw new InputError('integration-request-command-invalid')
    const values = new Map<string, string>()
    const allowed = ['--repo', '--input', '--operation-id', '--journal']
    for (let i = 0; i < rest.length; i += 2) {
      const option = rest[i],
        value = rest[i + 1]
      if (
        option === undefined ||
        !allowed.includes(option) ||
        values.has(option) ||
        value === undefined ||
        value.startsWith('--')
      )
        throw new InputError('integration-request-option-invalid')
      values.set(option, value)
    }
    const required = (name: string): string => {
      const value = values.get(name)
      if (value === undefined || value === '')
        throw new InputError('integration-request-option-required')
      return value
    }
    repo = required('--repo')
    operationId = required('--operation-id')
    const input = parseRequestInput(strictJson(readFileSync(required('--input'), 'utf8')))
    if (input.context.repo !== repo) throw new InputError('integration-request-repository-mismatch')
    const result = submitIntegrationRequest({
      mode,
      input,
      operationId,
      journalRoot: resolve(required('--journal')),
      bootstrap: driver.bootstrap(repo),
      call: driver.call,
    })
    driver.stdout(JSON.stringify(result) + '\n')
    return result.status === 'registered' ? 0 : 2
  } catch (error) {
    const code =
      error instanceof InputError || error instanceof IntegrationError
        ? error.message
        : 'integration-request-operation-unavailable'
    driver.stdout(
      JSON.stringify({
        schemaVersion: 1,
        operation: 'submit',
        status: 'error',
        repo,
        operationId,
        errorCode: code,
        retryable: false,
        sideEffects: 'inspect-operation-journal',
        recovery: 'recover-same-request',
        evidence: [],
        diagnostics: [code],
      }) + '\n',
    )
    driver.stderr('Integration request failed. Preserve the request and journal for recovery.\n')
    return 2
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.exitCode = runIntegrationRequestCli(process.argv.slice(2), {
    call: runGhCommand,
    bootstrap: deployedRequestBootstrap,
    stdout: text => process.stdout.write(text),
    stderr: text => process.stderr.write(text),
  })
}
