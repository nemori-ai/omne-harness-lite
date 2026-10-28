import { isDeepStrictEqual } from 'node:util'
import { fail, succeed } from '@omne-harness/operation-result'
import type {
  ToolCredentialFailure,
  ToolCredentialUsage,
} from '@omne-harness/tool-contract/provider'
import {
  toolCredentialsConformance,
  runConformanceCase,
  type ToolCredentialsFixture,
} from '@omne-harness/tool-contract/testing'
import { expect, it } from 'vitest'
import { input, callId, scope, tenant } from './background-calls-fixture.ts'
import { adoption, evidence, functionDefinition } from './tool-values.ts'

type Breach = 'none' | 'resolution' | 'use' | 'failure' | 'fallback' | 'action-on-failure'
function fixture(breach: Breach): ToolCredentialsFixture<string, 'selected-secret'> {
  const request = {
    ...input,
    call: callId(),
    request: {
      availability: {
        kind: 'available' as const,
        definition: functionDefinition(),
        executor: adoption('executor'),
        layer: { kind: 'official' as const },
      },
      invocation: { kind: 'direct' as const, source: evidence('source') },
      command: null,
      arguments: { original: '{}', effective: '{}', complete: true },
      settings: adoption('settings'),
      context: adoption('context'),
      workspace: null,
      environment: null,
      requesterScope: scope('credentials'),
      resources: [],
      scope: { owner: 'scope', key: 'key', grant: evidence('grant') },
      consumer: { owner: 'consumer', work: 'work', position: 'position', purpose: 'result' },
      batchDecision: null,
      mode: 'foreground' as const,
      limits: { concurrency: 1, foregroundMs: 0, backgroundAfterMs: null },
    },
    usage: { adoption: functionDefinition().adoption, purpose: 'send', target: 'service' },
  }
  let stored: ToolCredentialUsage & { tenant: typeof input.tenant } = {
    ...request.usage,
    tenant: request.tenant,
  }
  let failure: ToolCredentialFailure | null = null
  let actions = 0
  const sources: string[] = []
  const mismatch = () => !isDeepStrictEqual(stored, { ...request.usage, tenant: request.tenant })
  const invalid = () => fail({ kind: 'invalid' as const, field: 'binding', reason: 'mismatch' })
  return {
    request,
    otherTenant: tenant('b'),
    credentials: {
      resolve: async () => {
        sources.push('tenant')
        if (failure && breach !== 'failure') {
          if (breach === 'fallback') sources.push('organization')
          if (breach === 'action-on-failure') actions += 1
          return fail(failure)
        }
        return mismatch() && breach !== 'resolution'
          ? invalid()
          : succeed('selected-secret' as const)
      },
    },
    use: async () => {
      if (mismatch() && breach !== 'use') return invalid()
      actions += 1
      return succeed('sent')
    },
    replaceBinding: binding => {
      stored = binding
    },
    failSelected: next => {
      failure = next
    },
    sourcesRead: () => sources,
    uses: () => actions,
  }
}

const names = [
  'a matching secret can perform the restricted action',
  ...[
    'tenant',
    'adoption.owner',
    'adoption.name',
    'adoption.revision',
    'adoption.digest',
    'purpose',
    'target',
  ].flatMap(field => [
    `rejects actual ${field} mismatch at resolution`,
    `rechecks actual ${field} binding at protected use`,
  ]),
  ...['missing', 'denied', 'invalid', 'unavailable'].map(
    kind => `a selected ${kind} secret terminates without fallback`,
  ),
]

it.each(names)('credential suite checks %s and detects its violating provider', async name => {
  const cases = toolCredentialsConformance<string, 'selected-secret'>()
  expect(cases.map(test => test.name)).toEqual(names)
  expect(cases.map(test => test.clause)).toEqual(names.map(() => 'P15'))
  const scenario = cases.find(test => test.name === name)
  if (!scenario) throw new Error('missing credential case')
  expect(await runConformanceCase(scenario, fixture('none'))).toEqual({ kind: 'passed' })
  if (name.includes('mismatch')) await expect(scenario.run(fixture('resolution'))).rejects.toThrow()
  else if (name.includes('rechecks')) await expect(scenario.run(fixture('use'))).rejects.toThrow()
  else if (name.includes('selected'))
    for (const breach of ['failure', 'fallback', 'action-on-failure'] as const)
      await expect(scenario.run(fixture(breach))).rejects.toThrow()
})
