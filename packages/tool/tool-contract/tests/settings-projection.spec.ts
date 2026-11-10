// The settings a tool asset body declares (P15), projected into the Settings definition shape by
// the category hook: what the hook reads from the body, what it decides itself, that the body
// judgment refuses a malformed declaration, and that the definition judgment refuses an item
// without its presentation.
import { readBodyText } from '@omne-harness/assets'
import { defineSettings } from '@omne-harness/settings'
import {
  toolAssetBody,
  toolBodyContract,
  type ToolSettingsDeclaration,
} from '@omne-harness/tool-contract'
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

const VERSION = 'sha256:0123abcd'

/** The definition the settings hook derives from the asset body of a tool with this declaration. */
function project(declaration: ToolSettingsDeclaration | null, name = 'Web', version = VERSION) {
  const body = toolAssetBody({
    name,
    requiredCapabilities: [],
    declarations: { settings: declaration },
  })
  return toolBodyContract().settings?.(body, { capabilityName: name, definition: version })
}
const secretItem = {
  path: ['exa', 'apiKey'],
  category: 'binding',
  sensitive: true,
  presentation,
} as const

describe('the settings hook of the tool body contract', () => {
  it('projects a sensitive item as a secret item with an absent default and its presentation', () => {
    const projected = project(declaration([secretItem]))
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
    // The category; the assembly that holds the asset registers it under the asset reference.
    expect(projected?.providerId).toBe('tool')
    expect(projected?.version).toBe('sha256:0123abcd')
  })

  it('is a legal Settings definition', () => {
    const projected = project(
      declaration(
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
    )
    expect(defineSettings(projected)).toMatchObject({ kind: 'defined' })
    expect(projected?.items[1]).toMatchObject({
      id: 'limits.lines',
      sensitivity: 'ordinary',
      default: { kind: 'value', value: 10 },
      valueSchema: { type: 'integer', minimum: 1 },
    })
  })

  it('keeps the default of a secret item absent even when the declaration names one', () => {
    const projected = project(declaration([secretItem], '{"exa":{"apiKey":"placeholder"}}'))
    expect(projected?.items[0]?.default).toEqual({ kind: 'absent' })
    expect(JSON.stringify(projected)).not.toContain('placeholder')
  })

  it('projects a tool without a settings declaration as null', () => {
    expect(project(null)).toBeNull()
  })

  it('tells two names and two versions apart, and keeps the id grammar', () => {
    const ids = [
      ['Web', VERSION],
      ['Web_search', VERSION],
      ['Web search', VERSION],
      ['Web', 'sha256:ffff'],
    ].map(([name, version]) => {
      const projected = project(declaration([secretItem]), name, version)
      if (projected === null || projected === undefined) throw new Error('declared')
      return `${projected.providerId}|${projected.definitionId}|${projected.version}`
    })
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids)
      for (const part of id.split('|')) expect(part).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,255}$/)
  })

  it('refuses a declared path that the schema does not describe, instead of inventing a schema', () => {
    expect(() => project(declaration([{ ...secretItem, path: ['exa', 'endpoint'] }]))).toThrow(
      /exa\.endpoint/,
    )
  })

  describe('a declared path the schema describes through something that is no object', () => {
    const withSchema = (schema: string, path: readonly string[]) => {
      const base = declaration([{ ...secretItem, path }])
      return project({ ...base, schema: { ...base.schema, schema: json(schema) } })
    }

    it('refuses a path whose first segment is missing, naming the item', () => {
      expect(() =>
        withSchema('{"type":"object","properties":{"exa":{"type":"object"}}}', ['nope', 'deeper']),
      ).toThrow(
        new TypeError('tool settings: the schema describes no object at the item nope.deeper'),
      )
    })

    it.each([
      ['properties is not an object', '{"type":"object","properties":5}'],
      ['a segment holds a string', '{"type":"object","properties":{"exa":"text"}}'],
      ['a segment holds an array', '{"type":"object","properties":{"exa":[1]}}'],
      ['a segment holds a boolean schema', '{"type":"object","properties":{"exa":true}}'],
      [
        'the leaf holds a boolean schema',
        '{"type":"object","properties":{"exa":{"type":"object","properties":{"apiKey":true}}}}',
      ],
      [
        'the leaf holds a number',
        '{"type":"object","properties":{"exa":{"type":"object","properties":{"apiKey":7}}}}',
      ],
    ])('refuses it when %s', (_name, schema) => {
      expect(() => withSchema(schema, ['exa', 'apiKey'])).toThrow(
        new TypeError('tool settings: the schema describes no object at the item exa.apiKey'),
      )
    })
  })

  it('gives an ordinary item an absent default when the default tree does not hold it', () => {
    const lines = {
      path: ['limits', 'lines'],
      category: 'preference',
      sensitive: false,
      presentation: { ...presentation, title: 'Lines', unit: 'lines' },
    } as const
    for (const defaults of ['{}', '{"limits":{}}', '{"exa":{"apiKey":"x"}}', '{"limits":5}']) {
      const projected = project(declaration([secretItem, lines], defaults))
      expect(
        projected?.items.map(item => item.default),
        defaults,
      ).toEqual([{ kind: 'absent' }, { kind: 'absent' }])
    }
  })
})

describe('the body judgment of a settings declaration', () => {
  const LIMITS = {
    maxBytes: 8192,
    maxDepth: 16,
    maxItems: 64,
    maxMembers: 32,
    maxStringLength: 400,
    maxNumberLength: 20,
  }
  const judgeSettings = (settings: unknown) => {
    const read = readBodyText(JSON.stringify({ name: 'Web', settings }), LIMITS)
    if (read.kind !== 'ok') throw new Error('fixture body')
    return toolBodyContract().judge(read.value)
  }
  const item = { path: ['exa', 'apiKey'], category: 'binding', sensitive: true, presentation }
  const valid = { schema: { type: 'object' }, defaults: {}, items: [item] }

  it('accepts a body whose declaration has a schema object, defaults and well-formed items', () => {
    expect(judgeSettings(valid)).toEqual({ ok: true })
  })

  it.each(['preference', 'binding', 'placement-identity', 'governance'])(
    'accepts an item of the category %s',
    category => {
      expect(judgeSettings({ ...valid, items: [{ ...item, category }] })).toEqual({ ok: true })
    },
  )

  it.each([
    ['a declaration that is not an object', 'settings'],
    ['a schema that is not an object', { ...valid, schema: true }],
    ['missing defaults', { schema: valid.schema, items: valid.items }],
    ['items that are not a list', { ...valid, items: item }],
    ['missing items', { schema: valid.schema, defaults: valid.defaults }],
    ['an item that is not an object', { ...valid, items: ['exa.apiKey'] }],
    ['an item without a path', { ...valid, items: [{ ...item, path: undefined }] }],
    ['a path that is not a list', { ...valid, items: [{ ...item, path: 'exa.apiKey' }] }],
    ['a path segment that is not a string', { ...valid, items: [{ ...item, path: ['exa', 7] }] }],
    ['an item without a category', { ...valid, items: [{ ...item, category: undefined }] }],
    ['a category that is not a string', { ...valid, items: [{ ...item, category: 1 }] }],
    ['an item without a sensitivity', { ...valid, items: [{ ...item, sensitive: undefined }] }],
    ['an item without a presentation', { ...valid, items: [{ ...item, presentation: undefined }] }],
    ['an empty path', { ...valid, items: [{ ...item, path: [] }] }],
    ['an empty path segment', { ...valid, items: [{ ...item, path: ['exa', ''] }] }],
    ['an unknown category', { ...valid, items: [{ ...item, category: 'secret' }] }],
    ['a sensitivity that is not boolean', { ...valid, items: [{ ...item, sensitive: 'yes' }] }],
    ['a presentation that is not an object', { ...valid, items: [{ ...item, presentation: 'x' }] }],
  ])('refuses %s', (_case, settings) => {
    expect(judgeSettings(settings)).toEqual({ ok: false, rejected: 'invalid-settings' })
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
