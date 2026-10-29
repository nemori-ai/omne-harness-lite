import { AssertionError } from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import { fail, succeed } from '@omne-harness/operation-result'
import type {
  ToolCredentialFailure,
  ToolCredentialUsage,
} from '@omne-harness/tool-contract/provider'
import {
  toolCredentialsConformance,
  runConformanceCase,
  type ToolCredentialEscapeExit,
  type ToolCredentialsFixture,
} from '@omne-harness/tool-contract/testing'
import { expect, it } from 'vitest'
import { input, callId, scope, tenant } from './background-calls-fixture.ts'
import { adoption, evidence, functionDefinition } from './tool-values.ts'

// `escape`: the raw capability stays usable after the use ended. `revocation`: a failed revocation
// is swallowed and the use reports success. `wrap`: the unknown error of the action is wrapped
// instead of rethrown as it was. `refuse`: a matching secret is refused.
type Breach =
  | 'none'
  | 'resolution'
  | 'use'
  | 'failure'
  | 'fallback'
  | 'action-on-failure'
  | 'escape'
  | 'revocation'
  | 'wrap'
  | 'refuse'
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
  let revocationFailure: Error | null = null
  const sources: string[] = []
  const mismatch = () => !isDeepStrictEqual(stored, { ...request.usage, tenant: request.tenant })
  const invalid = () => fail({ kind: 'invalid' as const, field: 'binding', reason: 'mismatch' })
  // The raw capability of one use: it acts until revoked, unless the provider breaches `escape`.
  const raw = () => {
    let revoked = false
    return {
      act: () => {
        if (revoked && breach !== 'escape') throw new Error('revoked')
        actions += 1
      },
      revoke: () => {
        if (revocationFailure) throw revocationFailure
        revoked = true
      },
    }
  }
  // One use: run `action` on a fresh raw capability, then revoke it; the exits of P15.
  const restrictedUse = async <T>(action: (capability: ReturnType<typeof raw>) => Promise<T>) => {
    const capability = raw()
    let result: T
    try {
      result = await action(capability)
    } catch (actionError) {
      try {
        capability.revoke()
      } catch (revocationError) {
        if (breach === 'revocation') throw actionError
        throw new AggregateError([actionError, revocationError], 'both failed')
      }
      throw breach === 'wrap' ? new Error('wrapped', { cause: actionError }) : actionError
    }
    try {
      capability.revoke()
    } catch (revocationError) {
      if (breach !== 'revocation') throw revocationError
    }
    return succeed(result)
  }
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
        return (mismatch() && breach !== 'resolution') || breach === 'refuse'
          ? invalid()
          : succeed('selected-secret' as const)
      },
    },
    use: async () => {
      if (mismatch() && breach !== 'use') return invalid()
      return restrictedUse(async capability => {
        capability.act()
        return 'sent'
      })
    },
    escape: async (_capability, exit: ToolCredentialEscapeExit) => {
      let kept: ReturnType<typeof raw> | null = null
      const ended: unknown = await restrictedUse(async capability => {
        kept = capability
        if (exit.kind === 'throw') throw exit.error
        return capability
      }).then(
        value => value,
        (error: unknown) => error,
      )
      return {
        ended,
        retry: async () => {
          try {
            kept?.act()
          } catch {
            // A refused action is the expected end of an escaped capability.
          }
        },
      }
    },
    failRevocation: () => {
      revocationFailure = new Error('revocation failed')
      return revocationFailure
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
  'a capability returned out of a use cannot act after the use ended',
  'a capability thrown out of a use cannot act after the use ended',
  'a failed revocation after a successful action is not reported as success',
  'a failed revocation after a failed action keeps both errors',
]

/** The violating providers that each case must catch, by an assertion of the suite. */
function breachesOf(name: string): readonly Breach[] {
  if (name.includes('matching secret')) return ['refuse']
  if (name.includes('mismatch')) return ['resolution']
  if (name.includes('rechecks')) return ['use']
  if (name.includes('selected')) return ['failure', 'fallback', 'action-on-failure']
  if (name.includes('returned out')) return ['escape']
  if (name.includes('thrown out')) return ['escape', 'wrap']
  if (name.includes('successful action')) return ['revocation']
  if (name.includes('failed action')) return ['revocation']
  return []
}

it.each(names)('credential suite checks %s and detects its violating provider', async name => {
  const cases = toolCredentialsConformance<string, 'selected-secret'>()
  expect(cases.map(test => test.name)).toEqual(names)
  expect(cases.map(test => test.clause)).toEqual(names.map(() => 'P15'))
  const scenario = cases.find(test => test.name === name)
  if (!scenario) throw new Error('missing credential case')
  expect(await runConformanceCase(scenario, fixture('none'))).toEqual({ kind: 'passed' })
  const breaches = breachesOf(name)
  expect(breaches.length, 'every case has a violating provider').toBeGreaterThan(0)
  // Only an assertion of the suite counts as a detected breach; a crash is not a detection.
  for (const breach of breaches)
    await expect(scenario.run(fixture(breach)), breach).rejects.toThrow(AssertionError)
})
