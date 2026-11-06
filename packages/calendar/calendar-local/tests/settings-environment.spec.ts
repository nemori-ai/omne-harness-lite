import { expect, test, vi } from 'vitest'
import { createCalendarSettingsEnvironment } from '@omne-harness/calendar-local'
import { calendarCallContextSchema } from '@omne-harness/calendar-contract'
import type { SettingsBasis, SettingItem } from '@omne-harness/settings'
import { SettingDefinitionsSchema } from '@omne-harness/settings'

const context = calendarCallContextSchema.parse({
  principalRef: 'alice',
  owner: { kind: 'tenant', tenantId: 'tenant:1', ownerId: 'alice' },
  actor: { kind: 'human', actorRef: 'alice' },
  authContextRef: 'auth:1',
  requestId: 'query:1',
  originatingSessionRef: null,
})
const target = { policyId: 'preferences', targetRef: 'environment:alice', scopeRef: 'tenant:1' }
const definitionRef = {
  providerId: 'preferences',
  definitionId: 'environment',
  version: '1',
  digest: 'a'.repeat(64),
}
const item = (id: string, value: string | null): SettingItem => ({
  id,
  groupId: 'environment',
  category: 'preference',
  sensitivity: 'ordinary',
  merge: 'override',
  valueSchema: { type: ['string', 'null'] },
  default: { kind: 'value', value },
  presentation: {
    title: id,
    description: 'Selected date environment',
    impact: 'Used for future calculations',
    clear: 'Use the declared default',
    adoption: 'next-read',
  },
})
function fixture() {
  const basis: SettingsBasis = {
    scopeKey: 'scope:environment:alice',
    revision: 'basis:7',
    completeness: 'complete',
    unavailableProviders: [],
    views: [
      {
        target,
        enabled: true,
        definitionRef,
        grants: [],
        state: { revision: 4, sources: [] },
        definition: {
          providerId: 'preferences',
          definitionId: 'environment',
          version: '1',
          groups: [
            {
              id: 'environment',
              parentId: null,
              title: 'Date environment',
              description: 'Date interpretation preferences',
              order: 0,
            },
          ],
          items: [item('timezone', 'Asia/Shanghai'), item('calendar', 'cn')],
        },
      },
    ],
  }
  const binding = {
    principal: 'issued:alice',
    owner: context.owner,
    target,
    definitionRef,
    request: {
      deploymentRef: 'deployment:1',
      mode: 'management' as const,
      targets: [target],
      selectionRef: null,
    },
    timezoneItemId: 'timezone',
    calendarItemId: 'calendar',
  }
  const read = vi.fn(async () => basis)
  const resolve = vi.fn(async () => binding)
  const environment = createCalendarSettingsEnvironment({ settings: { read }, resolve })
  return { basis, binding, read, resolve, environment }
}

test('projects both values from one authorized basis and retains its revision', async () => {
  const { environment, read, resolve, binding } = fixture()
  expect(await environment.read(context)).toEqual({
    kind: 'found',
    value: {
      owner: context.owner,
      revision: 'basis:7',
      timezone: 'Asia/Shanghai',
      calendarId: 'cn',
    },
  })
  expect(resolve).toHaveBeenCalledWith(context)
  expect(read).toHaveBeenCalledExactlyOnceWith(binding.principal, binding.request)
})

test('a declared null calendar is preserved', async () => {
  const { environment, read, basis } = fixture()
  read.mockResolvedValue({
    ...basis,
    views: [
      {
        ...basis.views[0]!,
        definition: {
          ...basis.views[0]!.definition,
          items: [item('timezone', 'Asia/Shanghai'), item('calendar', null)],
        },
      },
    ],
  })
  expect(await environment.read(context)).toMatchObject({
    kind: 'found',
    value: { calendarId: null },
  })
})

test('maps settings by item identity regardless of declaration order', async () => {
  const { environment, read, basis } = fixture()
  const view = basis.views[0]!
  read.mockResolvedValue({
    ...basis,
    views: [
      { ...view, definition: { ...view.definition, items: [...view.definition.items].reverse() } },
    ],
  })
  expect(await environment.read(context)).toMatchObject({
    kind: 'found',
    value: { timezone: 'Asia/Shanghai', calendarId: 'cn' },
  })
})

test.each(['timezone', 'calendar'])('an undeclared %s item remains missing', async missing => {
  const { environment, read, basis } = fixture()
  const view = basis.views[0]!
  read.mockResolvedValue({
    ...basis,
    views: [
      {
        ...view,
        definition: {
          ...view.definition,
          items: view.definition.items.filter(item => item.id !== missing),
        },
      },
    ],
  })
  expect(await environment.read(context)).toEqual({ kind: 'missing' })
})

test('invalid original context does not reach the trusted resolver', async () => {
  const { environment, resolve, read } = fixture()
  const { requestId: _requestId, ...invalid } = context
  expect(await Reflect.apply(environment.read, environment, [invalid])).toEqual({
    kind: 'unavailable',
  })
  expect(resolve).not.toHaveBeenCalled()
  expect(read).not.toHaveBeenCalled()
})

test('missing trusted binding never reads settings', async () => {
  const read = vi.fn()
  const environment = createCalendarSettingsEnvironment({
    settings: { read },
    resolve: async () => null,
  })
  expect(await environment.read(context)).toEqual({ kind: 'unavailable' })
  expect(read).not.toHaveBeenCalled()
})

test.each([
  'partial',
  'provider',
  'target',
  'definition',
  'duplicate',
  'revision',
  'timezone',
  'calendar',
])('does not use an invalid %s basis', async fault => {
  const { environment, read, basis } = fixture()
  const view = basis.views[0]!
  const broken = {
    ...basis,
    ...(fault === 'partial' ? { completeness: 'partial' as const } : {}),
    ...(fault === 'provider' ? { unavailableProviders: ['missing'] } : {}),
    ...(fault === 'revision' ? { revision: '' } : {}),
    views:
      fault === 'duplicate'
        ? [view, view]
        : [
            {
              ...view,
              ...(fault === 'target' ? { target: { ...target, targetRef: 'other' } } : {}),
              ...(fault === 'definition'
                ? { definitionRef: { ...definitionRef, version: '2' } }
                : {}),
              ...(fault === 'timezone' || fault === 'calendar'
                ? {
                    definition: {
                      ...view.definition,
                      items: [
                        item('timezone', fault === 'timezone' ? 'Not/AZone' : 'Asia/Shanghai'),
                        item('calendar', fault === 'calendar' ? '' : 'cn'),
                      ],
                    },
                  }
                : {}),
            },
          ],
  }
  read.mockResolvedValue(broken)
  expect(await environment.read(context)).toEqual({ kind: 'unavailable' })
})

test.each(['timezone', 'calendar'])(
  'absent %s value stays missing rather than becoming a default',
  async missing => {
    const { environment, read, basis } = fixture()
    read.mockResolvedValue({
      ...basis,
      views: [
        {
          ...basis.views[0]!,
          definition: {
            ...basis.views[0]!.definition,
            items: [item('timezone', 'Asia/Shanghai'), item('calendar', 'cn')].map(entry =>
              entry.id === missing ? { ...entry, default: { kind: 'absent' as const } } : entry,
            ),
          },
        },
      ],
    })
    expect(await environment.read(context)).toEqual({ kind: 'missing' })
  },
)

test('rejects a different owner before reading any settings', async () => {
  const { environment, read } = fixture()
  expect(
    await environment.read({
      ...context,
      owner: { kind: 'tenant', tenantId: 'tenant:2', ownerId: 'alice' },
    }),
  ).toEqual({ kind: 'unavailable' })
  expect(read).not.toHaveBeenCalled()
})

test('does not leak exceptions from context recovery or the provider', async () => {
  const f = fixture()
  f.resolve.mockRejectedValueOnce(new Error('context unavailable'))
  expect(await f.environment.read(context)).toEqual({ kind: 'unavailable' })
  expect(f.read).not.toHaveBeenCalled()
  f.read.mockRejectedValueOnce(new Error('settings unavailable'))
  expect(await f.environment.read(context)).toEqual({ kind: 'unavailable' })
})

test.each(['providerId', 'definitionId', 'version'] as const)(
  'rejects declaration %s that does not match the adopted reference',
  async field => {
    const { environment, read, basis } = fixture()
    const view = basis.views[0]!
    read.mockResolvedValue({
      ...basis,
      views: [{ ...view, definition: { ...view.definition, [field]: 'other' } }],
    })
    expect(await environment.read(context)).toEqual({ kind: 'unavailable' })
  },
)

test('semantic evaluation failure does not expose an invalid environment result', async () => {
  const { environment, read, basis } = fixture()
  const view = basis.views[0]!
  const definition = SettingDefinitionsSchema.parse({
    ...view.definition,
    items: view.definition.items.map(item => ({ ...item, groupId: 'undeclared-group' })),
  })
  read.mockResolvedValue({ ...basis, views: [{ ...view, definition }] })
  expect(await environment.read(context)).toEqual({ kind: 'unavailable' })
})

test.each(['targets', 'target', 'items'])(
  'rejects incoherent host %s before reading settings',
  async fault => {
    const { environment, resolve, binding, read } = fixture()
    resolve.mockResolvedValue({
      ...binding,
      ...(fault === 'targets'
        ? { request: { ...binding.request, targets: [target, target] } }
        : {}),
      ...(fault === 'target' ? { target: { ...target, targetRef: 'other' } } : {}),
      ...(fault === 'items' ? { calendarItemId: binding.timezoneItemId } : {}),
    })
    expect(await environment.read(context)).toEqual({ kind: 'unavailable' })
    expect(read).not.toHaveBeenCalled()
  },
)
