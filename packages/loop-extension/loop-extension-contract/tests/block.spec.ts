import { describe, expect, it } from 'vitest'
import {
  ENABLED_EXTENSIONS_BLOCK,
  ENABLED_EXTENSIONS_PUBLICATION,
  enabledExtensionsBinding,
  enabledExtensionsDescriptor,
  enabledExtensionsProducer,
} from '@omne-harness/loop-extension-contract'
import { builtin } from './support.ts'

const member = {
  capability: 'probe',
  assetRef: 'asset/probe',
  version: 'v1',
  declaration: builtin(),
}
const view = { members: [member], basis: { assets: '2', settings: '1' } }
const validate = (value: unknown) => enabledExtensionsDescriptor.schema['~standard'].validate(value)

describe('the block of the enabled loop extensions', () => {
  it('is a required block its producer supplies at each read, for the coordinator alone', () => {
    expect(ENABLED_EXTENSIONS_BLOCK).toBe('loop-extension.enabled')
    expect(enabledExtensionsDescriptor).toMatchObject({
      key: 'loop-extension.enabled',
      consumers: ['coordinator'],
      required: true,
      volatility: 'per-read',
      kind: 'supplied',
      recovery: 'recompute',
      carriesPrevious: false,
    })
    expect(enabledExtensionsProducer).toEqual({ producer: '@omne-harness/loop-extension/enabled' })
    expect(enabledExtensionsBinding).toMatchObject({
      key: 'loop-extension.enabled',
      need: { name: 'loop-extension.chain', consumer: 'coordinator', necessity: 'required' },
    })
    expect(enabledExtensionsBinding.need.shape).toBe(enabledExtensionsDescriptor.schema)
  })

  it('is adopted under one identity whose digest is a SHA-256', () => {
    expect(ENABLED_EXTENSIONS_PUBLICATION).toMatchObject({
      owner: '@omne-harness/loop-extension-contract',
      name: 'loop-extension.enabled-publication',
      revision: '1',
      digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    })
  })

  it('takes a view, with members or with none', () => {
    expect(validate(view)).toEqual({ value: view })
    const empty = { members: [], basis: { assets: '1', settings: '1' } }
    expect(validate(empty)).toEqual({ value: empty })
  })

  it.each([
    ['nothing', undefined],
    ['a list', [view]],
    ['no basis', { members: [] }],
    ['a basis that is a list', { members: [], basis: [] }],
    ['members that are not a list', { members: {}, basis: view.basis }],
    ['a basis with no revision of the assets', { members: [], basis: { settings: '1' } }],
    ['a basis with no revision of the settings', { members: [], basis: { assets: '1' } }],
    ['a member that is not a record', { ...view, members: ['probe'] }],
    ['a member with no declaration', { ...view, members: [{ ...member, declaration: null }] }],
    ['a member with no capability', { ...view, members: [{ ...member, capability: 7 }] }],
    ['a member with no asset', { ...view, members: [{ ...member, assetRef: undefined }] }],
    ['a member with no version', { ...view, members: [{ ...member, version: 1 }] }],
    ['one bad member among good ones', { ...view, members: [member, { ...member, version: 1 }] }],
  ] as const)('refuses %s', (_name, value) => {
    expect(validate(value)).toEqual({
      issues: [{ message: 'Expected the view of the enabled loop extensions' }],
    })
  })
})
