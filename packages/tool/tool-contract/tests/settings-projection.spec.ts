// The projection of a tool's settings declaration (P15) into the Settings definition shape: what
// `toolSettingDefinitions` reads from the declaration, what it decides itself, and that the
// declaration judgment refuses an item without its presentation.
import { defineSettings } from '@omne-harness/settings'
import { toolSettingDefinitions, type ToolSettingsDeclaration } from '@omne-harness/tool-contract'
import { judgeToolDefinition } from '@omne-harness/tool-contract/provider'
import { describe, expect, it } from 'vitest'
import { adoption, functionDefinition, json } from './tool-values.ts'

const presentation = {
  title: 'Exa API key',
  description: 'The key search sends to Exa.',
  impact: 'The next search uses the new key.',
  clear: 'search is unconfigured until a key is set again.',
  adoption: 'next-read',
} as const

function declaration(
  items: ToolSettingsDeclaration['items'],
  defaults = '{}',
): ToolSettingsDeclaration {
  return {
    schema: {
      schema: json(
        '{"type":"object","properties":{"exa":{"type":"object","properties":{"apiKey":{"type":"string","minLength":1}}},"limits":{"type":"object","properties":{"lines":{"type":"integer","minimum":1}}}}}',
      ),
      vocabulary: adoption('json-schema'),
      descriptions: [{ path: 'exa.apiKey', text: 'The Exa key.' }],
    },
    defaults: json(defaults),
    items,
  }
}

const owner = { owner: '@omne-harness/harness-server', name: 'Web', revision: '0.0.0' }
const web = { ...owner, digest: 'sha256:0123abcd' }
const secretItem = {
  path: ['exa', 'apiKey'],
  category: 'binding',
  sensitive: true,
  presentation,
} as const

describe('toolSettingDefinitions', () => {
  it('projects a sensitive item as a secret item with an absent default and its presentation', () => {
    const projected = toolSettingDefinitions({
      adoption: web,
      name: 'Web',
      declaration: declaration([secretItem]),
    })
    expect(projected).not.toBeNull()
    expect(projected?.items).toEqual([
      {
        id: 'exa.apiKey',
        groupId: projected?.groups[0]?.id,
        category: 'binding',
        presentation,
        valueSchema: { type: 'string', minLength: 1 },
        default: { kind: 'absent' },
        merge: 'override',
        sensitivity: 'secret',
      },
    ])
    expect(projected?.definitionId).toBe('Web')
    // The owner is an npm-style name; the Settings id grammar has no `@`, so it is encoded.
    expect(projected?.providerId).toBe('tool:_40_omne-harness/harness-server')
    expect(projected?.version).toBe('sha256:0123abcd')
  })

  it('is a legal Settings definition', () => {
    const projected = toolSettingDefinitions({
      adoption: web,
      name: 'Web',
      declaration: declaration(
        [
          secretItem,
          {
            path: ['limits', 'lines'],
            category: 'preference',
            sensitive: false,
            presentation: { ...presentation, title: 'Lines', unit: 'lines' },
          },
        ],
        '{"limits":{"lines":10}}',
      ),
    })
    expect(defineSettings(projected)).toMatchObject({ kind: 'defined' })
    expect(projected?.items[1]).toMatchObject({
      id: 'limits.lines',
      sensitivity: 'ordinary',
      default: { kind: 'value', value: 10 },
      valueSchema: { type: 'integer', minimum: 1 },
    })
  })

  it('keeps the default of a secret item absent even when the declaration names one', () => {
    const projected = toolSettingDefinitions({
      adoption: web,
      name: 'Web',
      declaration: declaration([secretItem], '{"exa":{"apiKey":"placeholder"}}'),
    })
    expect(projected?.items[0]?.default).toEqual({ kind: 'absent' })
    expect(JSON.stringify(projected)).not.toContain('placeholder')
  })

  it('projects a tool without a settings declaration as null', () => {
    expect(toolSettingDefinitions({ adoption: web, name: 'Web', declaration: null })).toBeNull()
  })

  it('tells two owners, two names and two digests apart, and keeps the id grammar', () => {
    const ids = [
      { ...web, owner: 'omne-harness/harness-server' },
      { ...web, owner: '@omne-harness/harness-server' },
      { ...web, owner: '@omne-harness/harness_server' },
      { ...web, digest: 'sha256:ffff' },
    ].map(candidate => {
      const projected = toolSettingDefinitions({
        adoption: candidate,
        name: 'Web',
        declaration: declaration([secretItem]),
      })
      if (projected === null) throw new Error('declared')
      return `${projected.providerId}|${projected.definitionId}|${projected.version}`
    })
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids)
      for (const part of id.split('|')) expect(part).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,255}$/)
  })

  it('refuses a declared path that the schema does not describe, instead of inventing a schema', () => {
    expect(() =>
      toolSettingDefinitions({
        adoption: web,
        name: 'Web',
        declaration: declaration([{ ...secretItem, path: ['exa', 'endpoint'] }]),
      }),
    ).toThrow(/exa\.endpoint/)
  })
})

describe('definition judgment of the settings presentation', () => {
  const withSettings = (settings: unknown) => {
    const definition = functionDefinition()
    return judgeToolDefinition({
      ...definition,
      declarations: { ...definition.declarations, settings },
    })
  }

  it('accepts an item with its presentation', () => {
    expect(withSettings(declaration([secretItem]))).toHaveProperty('ok')
  })

  it('refuses an item without a presentation, and a presentation with an unknown field', () => {
    const { presentation: _omitted, ...bare } = secretItem
    expect(withSettings(declaration([bare as unknown as typeof secretItem]))).toMatchObject({
      failure: { field: 'declarations.settings.items[0].presentation', reason: 'missing' },
    })
    expect(
      withSettings(
        declaration([
          { ...secretItem, presentation: { ...presentation, enumLabels: [] } as never },
        ]),
      ),
    ).toMatchObject({
      failure: {
        field: 'declarations.settings.items[0].presentation.enumLabels',
        reason: 'unknown-field',
      },
    })
    expect(
      withSettings(
        declaration([
          { ...secretItem, presentation: { ...presentation, adoption: 'now' } as never },
        ]),
      ),
    ).toMatchObject({
      failure: { field: 'declarations.settings.items[0].presentation.adoption' },
    })
  })
})
