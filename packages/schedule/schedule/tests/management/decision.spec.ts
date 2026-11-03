import { describe, expect, it } from 'vitest'
import {
  ScheduleCommandSchema,
  ScheduleControlSchema,
  ScheduleInstantSchema,
  ScheduleViewSchema,
} from '@omne-harness/schedule-contract'
import {
  createScheduleManagementIdentity,
  createScheduleDefinitionRef,
  createScheduleRecordRef,
  decideScheduleManagement,
} from '@omne-harness/schedule'
import {
  context,
  createInput,
  decisionInput,
  definition,
  observation,
  record,
  scope,
  successorId,
} from './fixtures.ts'
import matrix from './state-matrix.json' with { type: 'json' }

function decide(input: ReturnType<typeof decisionInput>) {
  const original = structuredClone(input)
  const result = decideScheduleManagement(input)
  expect(input).toEqual(original)
  if (result.kind === 'save') expect(ScheduleViewSchema.safeParse(result.result).success).toBe(true)
  return result
}

describe('management state matrix', () => {
  it.each(matrix)('$control / $action produces $result', row => {
    const action = (
      [
        'update',
        'reviseDraft',
        'promote',
        'discard',
        'pause',
        'resume',
        'stop',
        'replace',
        'reconfirmConsent',
      ] as const
    ).find(value => value === row.action)
    if (action === undefined) throw new Error('Unknown matrix action')
    const input = decisionInput(action, ScheduleControlSchema.parse(row.control))
    const result = decide(input)
    if (row.result === 'rejected')
      expect(result).toMatchObject({ kind: 'rejected', error: { code: row.error } })
    else {
      expect(result.kind).toBe('save')
      if (result.kind !== 'save') return
      expect(result.mutation.kind === 'noChange').toBe(row.result === 'noChange')
      expect(
        result.mutation.kind === 'replace'
          ? result.mutation.predecessor.view.control
          : result.result.control,
      ).toBe(row.controlAfter)
      if (result.mutation.kind === 'replace')
        expect(result.result.control).toBe(row.successorControl)
    }
  })
})

it('creates all four revisions and reserves one intent with server metadata', () => {
  const input = createInput()
  const result = decide(input)
  expect(result).toMatchObject({
    kind: 'save',
    mutation: { kind: 'insert' },
    quota: { kind: 'reserve' },
    result: {
      revision: 1,
      definitionRevision: 1,
      timeRuleRevision: 1,
      stateRevision: 1,
      createdBy: 'alice',
      createdAt: input.now,
      sourceScheduleKey: null,
      eligibleConsumed: 0,
      acceptedJobCount: 0,
    },
    revisions: [{ beforeRecordRef: null, view: { beforeDefinitionRef: null, action: 'create' } }],
  })
})

it('rejects empty active activation and stale candidate but permits an empty draft', () => {
  for (const input of [
    createInput(),
    decisionInput('promote', 'draft'),
    decisionInput('replace'),
  ]) {
    if (input.definition.kind !== 'resolved') throw new Error('fixture')
    expect(decide({ ...input, definition: { ...input.definition, next: null } })).toMatchObject({
      kind: 'rejected',
      error: { code: 'no_future_slot' },
    })
    expect(
      decide({ ...input, now: ScheduleInstantSchema.parse('2026-11-05T09:00:00.000Z') }),
    ).toMatchObject({ kind: 'rejected', error: { code: 'stale_basis' } })
  }
  expect(
    decide({ ...createInput('draft'), definition: { ...observation(), next: null } }),
  ).toMatchObject({ kind: 'save', result: { control: 'draft', nextOccurrence: null } })
})

it('text edits preserve time, control, counts and immutable references', () => {
  const input = decisionInput('update', 'paused')
  const result = decide(input)
  expect(result).toMatchObject({
    kind: 'save',
    quota: { kind: 'none' },
    result: {
      control: 'paused',
      revision: 5,
      definitionRevision: 3,
      stateRevision: 2,
      timeRuleRevision: 1,
      eligibleConsumed: 3,
      acceptedJobCount: 2,
    },
  })
  if (result.kind !== 'save' || input.current === null) throw new Error('fixture')
  expect(result.revisions[0]).toMatchObject({
    beforeRecordRef: createScheduleRecordRef(input.current.view),
    afterRecordRef: createScheduleRecordRef(result.result),
    view: {
      beforeDefinitionRef: createScheduleDefinitionRef(input.current.view),
      afterDefinitionRef: createScheduleDefinitionRef(result.result),
    },
  })
})

it('identical text is a receipt-only noChange despite later observation time', () => {
  const input = decisionInput('update')
  const request = {
    kind: 'execute',
    input: ScheduleCommandSchema.parse({
      ...input.request.input,
      patch: { kind: 'label', label: definition.label },
    }),
  } as const
  expect(
    decide({
      ...input,
      request,
      operation: createScheduleManagementIdentity(scope, request),
      now: ScheduleInstantSchema.parse('2026-11-04T01:00:00.000Z'),
    }),
  ).toMatchObject({
    kind: 'save',
    mutation: { kind: 'noChange' },
    quota: { kind: 'none' },
    revisions: [],
    events: [],
    result: record().view,
  })
})

it('replace preserves predecessor history and uses the verified new author', () => {
  const input = decisionInput('replace', 'paused')
  const newScope = {
    ...scope,
    actor: { kind: 'human', actorRef: 'bob' },
    principalRef: 'principal:bob',
  } as const
  const result = decide({
    ...input,
    operation: createScheduleManagementIdentity(newScope, input.request),
    access: {
      ...input.access,
      authority: {
        ...input.access.authority,
        scope: newScope,
        authorOnCreate: { kind: 'human', actorRef: 'bob' },
      },
    },
  })
  expect(result).toMatchObject({
    kind: 'save',
    mutation: {
      kind: 'replace',
      predecessor: {
        quota: { kind: 'transferred', successorId },
        view: {
          author: { actorRef: 'alice' },
          eligibleConsumed: 3,
          acceptedJobCount: 2,
          control: 'superseded',
          revision: 5,
          definitionRevision: 2,
          timeRuleRevision: 1,
        },
      },
      successor: {
        view: {
          author: { actorRef: 'bob' },
          createdBy: 'bob',
          control: 'paused',
          eligibleConsumed: 0,
          acceptedJobCount: 0,
        },
      },
    },
    quota: { kind: 'transfer', author: { actorRef: 'bob' } },
  })
})

it('adopts confirmed ordinary dependency recovery on resume', () => {
  const input = decisionInput('resume', 'paused')
  const current = record('paused')
  const recovered = { ...input.access.currentStanding, generation: 2 }
  expect(
    decide({
      ...input,
      current: {
        ...current,
        view: {
          ...current.view,
          standing: {
            ...current.view.standing,
            kind: 'blocked',
            reasons: ['membership_suspended'],
          },
        },
      },
      access: { ...input.access, currentStanding: recovered },
    }),
  ).toMatchObject({
    kind: 'save',
    mutation: { kind: 'update', next: { consentLock: { kind: 'clear' } } },
    result: {
      control: 'active',
      standing: recovered,
      stateRevision: current.view.stateRevision + 1,
      definitionRevision: current.view.definitionRevision,
      timeRuleRevision: current.view.timeRuleRevision,
    },
  })
})

it('consent regrant does not clear a lock on resume; reconfirm keeps unrelated blockers and pause', () => {
  const input = decisionInput('resume', 'paused')
  const current = record('paused')
  const blocked = {
    ...current.view.standing,
    kind: 'blocked',
    reasons: ['consent_revoked', 'calendar_missing'],
  } as const
  const locked = {
    ...current,
    consentLock: { kind: 'reconfirmationRequired', grantRef: 'old', revokedGeneration: 1 } as const,
    view: { ...current.view, standing: { ...blocked, reasons: [...blocked.reasons] } },
  }
  expect(
    decide({
      ...input,
      current: locked,
      access: {
        ...input.access,
        currentStanding: { ...input.access.currentStanding, generation: 2 },
      },
    }),
  ).toMatchObject({
    kind: 'save',
    mutation: { next: { consentLock: locked.consentLock } },
    result: { standing: { kind: 'blocked' } },
  })
  const reconfirm = decisionInput('reconfirmConsent', 'paused')
  expect(
    decide({
      ...reconfirm,
      current: locked,
      access: {
        ...reconfirm.access,
        currentStanding: { ...blocked, reasons: ['calendar_missing'] },
      },
    }),
  ).toMatchObject({
    kind: 'save',
    mutation: { next: { consentLock: { kind: 'clear' } } },
    result: {
      control: 'paused',
      standing: { reasons: ['calendar_missing'] },
      consentAdoption: { grantRef: 'grant:new' },
    },
  })
})

it('terminal standing permits only owner stop and never releases quota twice', () => {
  const current = record()
  const invalidated = {
    ...current,
    quota: { kind: 'released', releaseRef: 'already-released' } as const,
    view: {
      ...current.view,
      standing: {
        ...current.view.standing,
        kind: 'terminallyInvalidated' as const,
        reasons: ['deleted'],
      },
    },
  }
  for (const action of ['pause', 'resume', 'update', 'replace', 'reconfirmConsent'] as const)
    expect(decide({ ...decisionInput(action), current: invalidated })).toMatchObject({
      kind: 'rejected',
      error: { code: 'invalid_transition' },
    })
  expect(decide({ ...decisionInput('stop'), current: invalidated })).toMatchObject({
    kind: 'save',
    quota: { kind: 'none' },
    result: { control: 'stopped', standing: { kind: 'terminallyInvalidated' } },
  })
})

it('rejects mismatched owner, author scope, operation binding and total revision', () => {
  const input = decisionInput('pause')
  const current = record()
  expect(
    decide({ ...input, current: { ...current, view: { ...current.view, revision: 5 } } }),
  ).toMatchObject({ kind: 'rejected', error: { code: 'revision_conflict' } })
  expect(
    decide({
      ...input,
      current: {
        ...current,
        view: { ...current.view, owner: { kind: 'system', systemScopeRef: 'other' } },
      },
    }),
  ).toMatchObject({ kind: 'rejected', error: { code: 'forbidden' } })
  expect(
    decide({
      ...input,
      operation: createScheduleManagementIdentity(
        { ...scope, principalRef: 'other' },
        input.request,
      ),
    }),
  ).toMatchObject({ kind: 'rejected', error: { code: 'forbidden' } })
  expect(
    decide({
      ...input,
      access: {
        ...input.access,
        authority: {
          ...input.access.authority,
          role: 'author',
          authorOnCreate: { kind: 'human', actorRef: 'other' },
        },
      },
    }),
  ).toMatchObject({ kind: 'rejected', error: { code: 'forbidden' } })
  expect(context.actor.kind).toBe('human')
})

it('draft text changes preserve the time axis; actual rule changes advance it', () => {
  const input = decisionInput('reviseDraft', 'draft')
  expect(decide(input)).toMatchObject({
    kind: 'save',
    result: {
      revision: 5,
      definitionRevision: 3,
      stateRevision: 2,
      timeRuleRevision: 1,
      control: 'draft',
    },
  })
  const revised = { ...definition, limits: { ...definition.limits, jobLimit: 5 } }
  const request = {
    kind: 'execute',
    input: ScheduleCommandSchema.parse({ ...input.request.input, definition: revised }),
  } as const
  expect(
    decide({
      ...input,
      request,
      operation: createScheduleManagementIdentity(scope, request),
      definition: observation(revised, 3),
    }),
  ).toMatchObject({ kind: 'save', result: { timeRuleRevision: 2, definitionRevision: 3 } })
})

it('promotion sets the first activation boundary without a second reservation', () => {
  const input = decisionInput('promote', 'draft')
  const result = decide(input)
  expect(result).toMatchObject({
    kind: 'save',
    quota: { kind: 'none' },
    mutation: {
      next: {
        activationExclusive: input.now,
        quota: { kind: 'held', reservationRef: 'reservation:old' },
      },
    },
    result: {
      control: 'active',
      promotedAt: input.now,
      promotedBy: 'alice',
      definitionRevision: 2,
      stateRevision: 3,
    },
  })
  const resume = decisionInput('resume', 'paused')
  expect(
    decide({ ...resume, now: ScheduleInstantSchema.parse('2026-11-04T01:00:00.000Z') }),
  ).toMatchObject({
    kind: 'save',
    mutation: { next: { activationExclusive: resume.current?.activationExclusive } },
  })
})

it('reconfirmation requires owner authority and the exact authorized grant', () => {
  const input = decisionInput('reconfirmConsent', 'paused')
  expect(
    decide({
      ...input,
      access: { ...input.access, authority: { ...input.access.authority, role: 'author' } },
    }),
  ).toMatchObject({ kind: 'rejected', error: { code: 'forbidden' } })
  expect(
    decide({
      ...input,
      access: { ...input.access, consent: { kind: 'notRequired', guardRef: 'none' } },
    }),
  ).toMatchObject({ kind: 'rejected', error: { code: 'consent_required' } })
})

it('executionText only edits an agent instruction and preserves the original work binding', () => {
  const base = decisionInput('update', 'paused')
  const current = record('paused')
  const agentDefinition = ScheduleViewSchema.shape.definition.parse({
    ...definition,
    purpose: {
      kind: 'execution',
      work: {
        kind: 'agent',
        instruction: 'Old instruction',
        session: { mode: 'existing', sessionRef: 'session:execution' },
        materials: [],
        returnTo: null,
        resultPolicy: {
          audience: { kind: 'userDeliverable', target: { kind: 'owner' } },
          publication: { kind: 'provider', providerRef: 'publication:test' },
          resultSeriesId: null,
          attention: 'silent',
          archive: { kind: 'none' },
        },
      },
      scope: { kind: 'fleet' },
      catchUp: { kind: 'none' },
      overlap: 'parallel',
      misfire: { kind: 'lapse' },
      notifications: [],
    },
  })
  const view = { ...current.view, definition: agentDefinition }
  const request = {
    kind: 'execute',
    input: ScheduleCommandSchema.parse({
      ...base.request.input,
      patch: { kind: 'executionText', instruction: 'New instruction', label: null },
    }),
  } as const
  const input = {
    ...base,
    request,
    operation: createScheduleManagementIdentity(scope, request),
    current: { ...current, view, definitionRef: createScheduleDefinitionRef(view) },
  }
  expect(decide(input)).toMatchObject({
    kind: 'save',
    result: {
      control: 'paused',
      timeRuleRevision: 1,
      definition: {
        purpose: {
          work: {
            instruction: 'New instruction',
            session: { mode: 'existing', sessionRef: 'session:execution' },
          },
        },
      },
    },
  })
  expect(decide({ ...input, current })).toMatchObject({
    kind: 'rejected',
    error: { code: 'invalid_input' },
  })
  if (agentDefinition.purpose.kind !== 'execution') throw new Error('fixture')
  const programView = {
    ...view,
    definition: {
      ...agentDefinition,
      purpose: {
        ...agentDefinition.purpose,
        work: { kind: 'program', programRef: 'program:one', input: {} } as const,
      },
    },
  }
  expect(
    decide({
      ...input,
      current: {
        ...current,
        view: programView,
        definitionRef: createScheduleDefinitionRef(programView),
      },
    }),
  ).toMatchObject({ kind: 'rejected', error: { code: 'invalid_input' } })
})

it('system createdBy projects the verified principal and never the scheduler actor label', () => {
  const base = createInput()
  const systemScope = {
    ...scope,
    owner: { kind: 'system', systemScopeRef: 'system:maintenance' },
    principalRef: 'principal:maintenance',
    actor: { kind: 'system', actorRef: 'actor:scheduler' },
  } as const
  expect(
    decide({
      ...base,
      operation: createScheduleManagementIdentity(systemScope, base.request),
      access: {
        ...base.access,
        authority: {
          ...base.access.authority,
          scope: systemScope,
          role: 'system',
          authorOnCreate: { kind: 'system', principalRef: 'principal:maintenance' },
        },
      },
    }),
  ).toMatchObject({ kind: 'save', result: { createdBy: 'principal:maintenance' } })
})
