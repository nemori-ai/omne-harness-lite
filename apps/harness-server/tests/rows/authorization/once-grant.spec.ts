import { describe, expect, it } from 'vitest'
import {
  decisionEvidence,
  effectiveArgumentsOf,
  type AdmissionCheck,
} from '@omne-harness/authorization'
import { createToolActionResolution } from '../../../src/entry/tool-action-resolution.ts'
import {
  createActionAdmission,
  type AuthorizationWriter,
} from '../../../src/rows/authorization/action-admission.ts'
import {
  onceTarget,
  permissionDecisionOf,
  type ToolPermissionCheck,
} from '../../../src/rows/authorization/current-tool-permission.ts'
import { echoCall, toolsCall } from '../../entry/tool-call-support.ts'
import { forwardWorld } from '../../entry/tool-forward-support.ts'

const evidence = decisionEvidence('once-grant-test', '1', {})
const allowing = { check: async () => ({ kind: 'allowed', evidence }) } as unknown as AdmissionCheck
const rules = {
  revision: 'r1',
  rules: [
    { id: 'tools', effect: 'allow', tool: 'Tools' },
    { id: 'echo', effect: 'allow', tool: 'ToyEcho' },
  ],
}
const card = { owner: 'cards', record: 'card-1', revision: '1', digest: 'c' }
const said = { owner: 'cards', record: 'answer-1', revision: '1', digest: 'a' }
const releasedOnce = {
  card,
  answer: { kind: 'chosen', option: 'allow-once', value: null, evidence: said },
} as const
const inquiry = {
  inquiry: { policy: { onAsk: 'ask-human' } },
  basis: { permissionRevision: '1' },
} as never

type Written = Parameters<AuthorizationWriter['express']>[0]

// The gate asks until the session holds a once authorization; the writer is what puts it there.
async function admitting(answer: Awaited<ReturnType<AuthorizationWriter['express']>>) {
  const world = await forwardWorld()
  const written: Written[] = []
  const writer: AuthorizationWriter = {
    express: async input => {
      written.push(input)
      return answer
    },
  }
  const check: ToolPermissionCheck = {
    check: async input =>
      permissionDecisionOf(
        { kind: 'decision-required', revision: '1' },
        inquiry,
        input.carrier === true,
        {
          evidence,
          condition: null,
          once:
            written.length === 0
              ? null
              : ({ ...written[0]!.expression.scope, source: said } as never),
        },
      ),
  }
  const admission = createActionAdmission({
    actionRules: rules,
    readAdmission: () => allowing,
    readPermission: () => check,
    readResolution: () =>
      createToolActionResolution({
        release: () => world.release,
        catalog: () => world.catalog,
        view: () => world.view,
      }),
    readAuthorizations: () => writer,
  })
  const adoption = (name: 'Tools' | 'ToyEcho') => {
    const availability = world.request(name).availability
    if (availability.kind !== 'available') throw new Error(`${name} unavailable`)
    return availability.definition.adoption
  }
  const admit = async (name: 'Tools' | 'ToyEcho', args: string) =>
    admission.admit({
      principal: world.principal,
      tenant: world.tenant,
      execution: 'e',
      passage: 'p',
      action: 'a',
      advance: {},
      permissions: [],
      decision: releasedOnce,
      original: { name, arguments: args },
      effectiveArguments: args,
      definition: adoption(name),
    } as never)
  return { world, written, admit, adoption }
}

describe('a person who releases one call', () => {
  it('writes a once authorization for this very action first, then judges again and allows', async () => {
    const { world, written, admit, adoption } = await admitting('written')
    const args = echoCall(world, {})
    expect(await admit('ToyEcho', args)).toMatchObject({ ok: { kind: 'allow' } })
    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({
      card,
      expression: {
        scope: {
          kind: 'once',
          consumer: { owner: '@omne-harness/agent', work: 'e', position: 'a' },
          target: onceTarget(adoption('ToyEcho')),
          argumentsDigest: effectiveArgumentsOf(args).digest,
        },
        direction: 'grant',
        source: said,
      },
    })
  })

  it('waits when the authorization cannot be written now, and does not decide when the session refuses it', async () => {
    const waiting = await admitting('unavailable')
    expect(await waiting.admit('ToyEcho', echoCall(waiting.world, {}))).toMatchObject({
      ok: { kind: 'unavailable' },
    })
    const refused = await admitting('refused')
    expect(await refused.admit('ToyEcho', echoCall(refused.world, {}))).toMatchObject({
      ok: { kind: 'undecidable' },
    })
  })

  it('writes the same authorization for a target the call carries through Tools: the place is the action', async () => {
    const { world, written, admit, adoption } = await admitting('written')
    const carried = toolsCall(world, { name: 'ToyEcho', command: 'info', arguments: {} })
    expect(await admit('Tools', carried)).toMatchObject({ ok: { kind: 'allow' } })
    expect(written).toHaveLength(1)
    expect(written[0]?.expression.scope).toMatchObject({
      kind: 'once',
      consumer: { owner: '@omne-harness/agent', work: 'e', position: 'a' },
      target: onceTarget(adoption('ToyEcho')),
    })
    expect(written[0]?.expression.scope).not.toMatchObject({
      argumentsDigest: effectiveArgumentsOf(carried).digest,
    })
  })
})

describe('a person who releases the tool for this session', () => {
  const forSession = {
    card,
    answer: { kind: 'chosen', option: 'allow-session', value: null, evidence: said },
  } as const
  const gate = { capabilityId: 'tool/ToyEcho', enforcementKey: 'tool.invoke', basis: 'verdict-7' }

  // The gate asks until the session holds a release for it that rests on the basis it has now.
  async function admittingForSession(first: 'ask' | 'allow') {
    const world = await forwardWorld()
    const written: Written[] = []
    const check: ToolPermissionCheck = {
      check: async input => {
        if (input.definition.name !== 'ToyEcho' || first === 'allow' || written.length > 0)
          return { kind: 'allow', evidence, condition: null }
        return { kind: 'ask', evidence, gate }
      },
    }
    const admission = createActionAdmission({
      actionRules: rules,
      readAdmission: () => allowing,
      readPermission: () => check,
      readResolution: () =>
        createToolActionResolution({
          release: () => world.release,
          catalog: () => world.catalog,
          view: () => world.view,
        }),
      readAuthorizations: () => ({
        express: async input => {
          written.push(input)
          return 'written'
        },
      }),
    })
    const echo = world.request('ToyEcho').availability
    if (echo.kind !== 'available') throw new Error('ToyEcho unavailable')
    const args = echoCall(world, {})
    const answer = await admission.admit({
      principal: world.principal,
      tenant: world.tenant,
      execution: 'e',
      passage: 'p',
      action: 'a',
      advance: {},
      permissions: [],
      decision: forSession,
      original: { name: 'ToyEcho', arguments: args },
      effectiveArguments: args,
      definition: echo.definition.adoption,
    } as never)
    return { answer, written }
  }

  it('writes an authorization for the gate with the basis the gate has now, then judges again and allows', async () => {
    const { answer, written } = await admittingForSession('ask')
    expect(answer).toMatchObject({ ok: { kind: 'allow' } })
    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({
      card,
      expression: { scope: { kind: 'session', ...gate }, direction: 'grant', source: said },
    })
  })

  it('writes nothing when the gate no longer asks: judging answers what it is now', async () => {
    const { answer, written } = await admittingForSession('allow')
    expect(answer).toMatchObject({ ok: { kind: 'allow' } })
    expect(written).toHaveLength(0)
  })
})
