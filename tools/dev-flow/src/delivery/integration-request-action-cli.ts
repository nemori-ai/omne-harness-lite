#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  canonical,
  digest,
  integer,
  object,
  same,
  string,
  IntegrationError,
} from '../integration/parse.ts'
import { collaborationJson } from './collaboration-json.ts'
import { parseRequestInput } from './collaboration-parse.ts'
import { fullSha } from './collaboration-values.ts'
import { runGhCommand } from './github-read.ts'
import { registerIntegrationRequest } from './integration-request-action.ts'
import {
  deployedRequestBootstrap,
  type IntegrationRequestDriver,
} from './integration-request-cli.ts'
import { InputError } from './protocol.ts'

export function runIntegrationRequestAction(
  env: NodeJS.ProcessEnv,
  driver: IntegrationRequestDriver,
): number {
  try {
    const required = (name: string) => string(env[name], name)
    if (
      required('GITHUB_EVENT_NAME') !== 'workflow_dispatch' ||
      required('GITHUB_REF_TYPE') !== 'branch'
    )
      throw new InputError('integration-request-action-event-invalid')
    const request = required('OMNE_REQUEST'),
      input = parseRequestInput(collaborationJson(request))
    const inputDigest = digest(canonical(input))
    if (
      required('OMNE_INPUT_DIGEST') !== inputDigest ||
      required('GITHUB_REPOSITORY') !== input.context.repo
    )
      throw new InputError('integration-request-action-input-mismatch')
    const event = object(
      collaborationJson(readFileSync(required('GITHUB_EVENT_PATH'), 'utf8')),
      'workflow event',
    )
    const inputs = object(event.inputs, 'workflow inputs')
    same(
      inputs,
      { request, 'input-digest': inputDigest },
      'integration-request-action-event-input-mismatch',
    )
    const path = '.github/workflows/integration-request.yml',
      ref = required('GITHUB_REF_NAME')
    if (required('GITHUB_WORKFLOW_REF') !== `${input.context.repo}/${path}@refs/heads/${ref}`)
      throw new InputError('integration-request-action-workflow-ref-invalid')
    const runId = integer(Number(required('GITHUB_RUN_ID')), 'runId')
    const result = registerIntegrationRequest({
      input,
      workflow: {
        path,
        ref,
        head: fullSha(required('GITHUB_SHA'), 'GITHUB_SHA'),
        runId,
        runAttempt: integer(Number(required('GITHUB_RUN_ATTEMPT')), 'runAttempt'),
        inputDigest,
      },
      bootstrap: driver.bootstrap(input.context.repo),
      call: driver.call,
      journalRoot: join(required('RUNNER_TEMP'), `integration-request-${runId}`),
    })
    driver.stdout(JSON.stringify(result) + '\n')
    return result.status === 'unknown' ? 2 : 0
  } catch (error) {
    const errorCode =
      error instanceof InputError || error instanceof IntegrationError
        ? error.message
        : 'integration-request-registration-unavailable'
    driver.stdout(
      JSON.stringify({
        schemaVersion: 1,
        operation: 'register',
        status: 'error',
        errorCode,
        retryable: false,
        sideEffects: 'inspect-run-receipt',
        recovery: 'recover-same-request',
      }) + '\n',
    )
    driver.stderr('Integration request registration failed. No registration success is asserted.\n')
    return 2
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.exitCode = runIntegrationRequestAction(process.env, {
    call: runGhCommand,
    bootstrap: deployedRequestBootstrap,
    stdout: text => process.stdout.write(text),
    stderr: text => process.stderr.write(text),
  })
}
