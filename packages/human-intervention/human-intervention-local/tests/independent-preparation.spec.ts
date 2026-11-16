import { expect, it } from 'vitest'
import { OperationRefSchema, RegisterRequestSchema } from '@omne-harness/human-intervention'
import { IndependentCommandSchema } from '@omne-harness/human-intervention-local'

const wait = { owner: 'independent', waitId: 'wait-a', incarnation: 'one', destination: 'inbox' }
const base = {
  originRef: 'form',
  wait,
  positionRef: 'step-a',
  adoptionRef: 'implementation-v1',
}
const registration = (origin: Record<string, unknown>) =>
  RegisterRequestSchema.parse({
    protocol: 'hitl/1',
    operation: OperationRefSchema.parse({
      tenantRef: 'tenant-a',
      actorRef: 'owner',
      operationId: 'register',
    }),
    preparationRef: 'prepared',
    displayContext: 'One question',
    origin,
    questions: [
      {
        kind: 'question',
        cardId: 'first',
        title: 'first',
        description: 'Please answer',
        declineConsequence: 'Skip this question',
        options: [{ id: 'yes', label: 'Yes', description: 'Continue' }],
      },
    ],
  })
const prepare = (
  origin: Record<string, unknown>,
  audience: { readers?: string[]; responders?: string[] } = {},
) =>
  IndependentCommandSchema.safeParse({
    kind: 'prepare',
    operation: { tenantRef: 'tenant-a', actorRef: 'owner', operationId: 'prepare' },
    preparation: {
      registration: registration(origin),
      readers: audience.readers ?? ['owner', 'human'],
      responders: audience.responders ?? ['human'],
      compatibleImplementations: ['implementation-v1'],
    },
  }).success

it('prepares an independent origin without session lifecycle, and the tool and agent origins of a run', () => {
  const run = { sessionRef: 's', runRef: 'r' }
  expect(prepare({ ...base, kind: 'independent' })).toBe(true)
  expect(prepare({ ...base, ...run, kind: 'tool', toolCallRef: 'call-1' })).toBe(true)
  expect(prepare({ ...base, ...run, kind: 'agent-extension' })).toBe(true)
  expect(prepare({ ...base, ...run, kind: 'admission' })).toBe(true)
  expect(prepare({ ...base, ...run, kind: 'admission', toolCallRef: 'call-1' })).toBe(true)
})

it('refuses an independent origin that names a session', () => {
  expect(prepare({ ...base, kind: 'independent', sessionRef: 'session-1' })).toBe(false)
})

it('requires the preparing actor among the readers, and every responder among the readers', () => {
  const origin = { ...base, kind: 'independent' }
  expect(prepare(origin, { readers: ['owner', 'human'], responders: ['human'] })).toBe(true)
  expect(prepare(origin, { readers: ['human'], responders: ['human'] })).toBe(false)
  expect(prepare(origin, { readers: ['owner', 'human'], responders: ['human', 'stranger'] })).toBe(
    false,
  )
  expect(prepare(origin, { readers: ['owner', 'human'], responders: ['stranger'] })).toBe(false)
})
