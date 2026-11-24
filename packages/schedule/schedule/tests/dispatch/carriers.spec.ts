import { describe, expect, it } from 'vitest'
import { SchedulePurposeSchema, type SchedulePurpose } from '@omne-harness/schedule-contract'
import { carriersOf, needText } from '../../src/dispatch/carriers.ts'

const notice = {
  event: 'failed',
  content: { title: null, body: 'failed' },
  target: { kind: 'owner' },
} as const

function program(notifications: readonly (typeof notice)[] = []): SchedulePurpose {
  return SchedulePurposeSchema.parse({
    kind: 'execution',
    work: { kind: 'program', programRef: 'probe', input: {} },
    scope: { kind: 'fleet' },
    catchUp: { kind: 'none' },
    overlap: 'parallel',
    misfire: null,
    notifications: [...notifications],
  })
}

function agent(policy: Record<string, unknown>, returnTo: string | null): SchedulePurpose {
  return SchedulePurposeSchema.parse({
    ...program(),
    work: {
      kind: 'agent',
      instruction: 'do it',
      session: { mode: 'existing', sessionRef: 's-1' },
      materials: [],
      returnTo: returnTo === null ? null : { kind: 'external', targetRef: returnTo },
      resultPolicy: {
        audience: { kind: 'userDeliverable', target: { kind: 'owner' } },
        resultSeriesId: null,
        attention: 'notify',
        ...policy,
      },
    },
  })
}

const names = (purpose: SchedulePurpose) => carriersOf(purpose).map(needText)

describe('the carriers a purpose selects', () => {
  it('program work needs the program path and the named program', () => {
    expect(names(program())).toEqual(['executor:program', 'program:probe'])
  })

  it('a notification on any event needs the notifications as well', () => {
    expect(names(program([notice]))).toEqual(['executor:program', 'program:probe', 'notification'])
  })

  it('a reminder needs only the notifications', () => {
    const reminder = SchedulePurposeSchema.parse({
      kind: 'reminder',
      content: { title: null, body: 'stand up' },
      admissionPolicy: 'reminder-window-v1',
      overlap: 'skip',
    })
    expect(names(reminder)).toEqual(['notification'])
  })

  it('agent work needs its path, its publication, its return target and its archive', () => {
    expect(
      names(
        agent(
          {
            publication: { kind: 'provider', providerRef: 'pages' },
            archive: { kind: 'provider', providerRef: 'drive', targetRef: 'folder' },
          },
          'chat-1',
        ),
      ),
    ).toEqual(['executor:agent.existing', 'publication:pages', 'return:chat-1', 'archive:drive'])
  })

  it('internal results publish nothing; deliverable results without a return target return nowhere', () => {
    const internal = agent(
      {
        audience: { kind: 'masterInternal' },
        publication: { kind: 'none' },
        attention: 'silent',
        archive: { kind: 'none' },
      },
      'chat-1',
    )
    expect(names(internal)).toEqual(['executor:agent.existing', 'return:chat-1'])
    const deliverable = agent(
      { publication: { kind: 'provider', providerRef: 'pages' }, archive: { kind: 'none' } },
      null,
    )
    expect(names(deliverable)).toEqual(['executor:agent.existing', 'publication:pages'])
  })

  it('a master publication is named without a provider; none and no archive need nothing', () => {
    expect(
      names(agent({ publication: { kind: 'master' }, archive: { kind: 'none' } }, 'chat-1')),
    ).toEqual(['executor:agent.existing', 'publication', 'return:chat-1'])
  })
})
