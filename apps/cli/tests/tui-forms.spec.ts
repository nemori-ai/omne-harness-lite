import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { forms, fieldValue, prepareForm, type Tenant } from '../src/tui/forms.ts'
import { validIntent } from '../src/validation.ts'
import { tuiOptions } from '../src/tui/application.ts'
const signal = new AbortController().signal
it('preserves the form grammar and applies only the current name and schema-owner changes', () => {
  for (const name of ['tui-forms.schema.json'])
    expect(readFileSync(new URL('../forms/' + name, import.meta.url), 'utf8')).toBe(
      readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8'),
    )
  const baseline = JSON.parse(
    readFileSync(
      new URL(
        '../../../.meta_harness/design/spec/compositions/governance-cli-entry/v2/forms.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as { id: string; payloadSchema?: string; fields: unknown[] }[]
  for (const form of baseline) {
    if (form.payloadSchema !== undefined) {
      form.payloadSchema =
        'https://omne-harness-lite.invalid/packages/core/governance-center-entry/schema/governance-center-entry.schema.json' +
        form.payloadSchema.slice(form.payloadSchema.indexOf('#'))
    }
    if (form.id === 'organization create') {
      form.fields.unshift({
        name: 'name',
        label: 'Organization name',
        kind: 'text',
        required: true,
      })
    }
  }
  expect(forms).toEqual(baseline)
})
it('all 34 forms produce the original canonical intent, with secrets separate and expectedTenant captured', async () => {
  const examples: {
    definition: string
    valid: boolean
    value: { action: string; operation?: string; payload?: Record<string, unknown> }
  }[] = JSON.parse(
    readFileSync(
      new URL(
        '../../../packages/core/governance-client-operations/tests/fixtures/action-examples.json',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  for (const form of forms) {
    if (form.action === 'configure') {
      const prepared = await prepareForm(
        form,
        { endpoint: 'https://center.invalid/', trustMode: 'system-ca' },
        undefined,
        false,
        signal,
      )
      expect(prepared.intent).toEqual({
        action: 'configure',
        endpoint: 'https://center.invalid/',
        trust: { mode: 'ca' },
      })
      continue
    }
    const sample = examples.find(
      e =>
        e.valid &&
        e.definition === 'Input' &&
        e.value.action === form.action &&
        (form.action !== 'invoke' || e.value.operation === form.operation),
    )
    expect(sample, form.id).toBeDefined()
    const original = structuredClone(sample!.value)
    if (form.operation === 'capability.organization-governance/v2#S-21') {
      original.payload = { ...original.payload, name: 'test organization' }
    }
    const draft = { ...(original.payload ?? {}) }
    let tenant: Tenant | undefined
    for (const field of form.fields) {
      if (field.kind === 'current-tenant') {
        tenant = draft[field.name] as Tenant | undefined
        delete draft[field.name]
      } else if (field.kind === 'secret-file') {
        draft[field.name] = '/not-opened'
        delete original.payload?.[field.name]
      } else if (field.kind === 'integer' && draft[field.name] !== undefined)
        draft[field.name] = String(draft[field.name])
    }
    const prepared = await prepareForm(form, draft, tenant, false, signal)
    expect(validIntent(prepared.intent), form.id).toBe(true)
    expect(prepared.intent, form.id).toEqual(original)
    expect(Object.keys(prepared.secretPaths)).toEqual(
      form.fields.filter(f => f.kind === 'secret-file').map(f => f.name),
    )
  }
})
it('rejects stale condition values and fabricated expectedTenant rather than silently mapping them', async () => {
  const form = forms.find(f => f.id === 'invitation inspect')!
  await expect(
    prepareForm(
      form,
      { callerIdentityKind: 'account', expectedTenant: { account: 'a', organization: 'o' } },
      undefined,
      false,
      signal,
    ),
  ).rejects.toThrow('invalid-options')
})
it('retains strings exactly and rejects unsafe numeric spellings before rounding', () => {
  const field = { name: 'value', label: 'Value', kind: 'integer' as const, required: true }
  for (const value of ['1e3', '01', '1.5', '9007199254740993', ' 1 ', '+2'])
    expect(() => fieldValue(field, value)).toThrow()
  expect(fieldValue(field, '42')).toBe(42)
  expect(fieldValue({ ...field, kind: 'text' }, ' Case ')).toBe(' Case ')
})
it('tui option grammar is separate and has no ambiguous fallback to the one-shot parser', () => {
  expect(tuiOptions(['tui', '--help'], '/home')).toBe('help')
  expect(tuiOptions(['tui', '--terminal-profile', 'xterm-379', '--setup'], '/home')).toEqual({
    directory: '/home/.omne-harness-lite',
    profile: 'xterm-379',
    setup: true,
  })
  for (const args of [
    ['machine', 'tui'],
    ['tui'],
    ['tui', '--help', '--setup'],
    ['tui', '--setup', '--setup'],
    ['tui', '--terminal-profile', 'xterm-379', '--credential', 'secret'],
  ])
    expect(() => tuiOptions(args, '/home')).toThrow('invalid-options')
})
