import { adoptedSchemaBytes } from './adopted-schema-input.ts'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import {
  judgeContentBlock,
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { type SkillPackage } from '@omne-harness-lite/skill-package/v2'
import {
  slashCommandBodyContract,
  slashCommandAttributeDeclarations,
  slashCommandReferences,
  expandSkill,
  recognize,
  expandPrompt,
  parseInvocation,
  SCHEMA_DEF_NAMES,
  schemaId,
  type CommandInvocation,
  type ExpansionBlockAnnotation,
  type SlashCommandDefinition,
} from '../src/index.ts'

function invocation(raw: string): CommandInvocation {
  const result = recognize(raw)
  if (result.kind !== 'invocation') throw new Error('invocation fixture required')
  return result.invocation
}
function annotation(id: string, toHuman: boolean, toModel: boolean): ExpansionBlockAnnotation {
  const parsed = parseOpaqueIdentifier(id, 'BlockId')
  if ('invalidInput' in parsed) throw new Error('bad annotation fixture')
  return { id: parsed.ok, visibility: { toHuman, toModel } }
}
function json(source: string): JsonValue {
  const result = readJsonStrict(source)
  if ('failed' in result) throw new Error('invalid fixture')
  return result.ok
}
const prompt = { description: 'p', binding: { kind: 'prompt', template: '$ARGUMENTS' } } as const
const command = {
  description: 'c',
  binding: { kind: 'command', service: 'registry.reload' },
} as const
const skillDefinition = {
  description: 's',
  binding: { kind: 'skill', skill: { category: 'skill', name: 'review' } },
} as const

describe('V-1/V-3/SC-6 body contract and pure declaration module', () => {
  const bodies = [prompt, command, skillDefinition]
  for (const body of bodies)
    it(`P-empty declarations ${body.binding.kind}`, () => {
      const before = writeJsonLossless(body)
      expect(slashCommandAttributeDeclarations(body)).toEqual([])
      expect(slashCommandBodyContract.deriveDeclarations(json(before))).toEqual({
        declarations: [],
      })
      expect(writeJsonLossless(body)).toBe(before)
    })
  it('P-skill reference only, copied and frozen; no prompt/service edges', () => {
    const refs = slashCommandReferences(skillDefinition)
    expect(refs).toEqual([{ category: 'skill', name: 'review' }])
    expect(refs[0]).not.toBe(skillDefinition.binding.skill)
    expect(Object.isFrozen(refs)).toBe(true)
    expect(Object.isFrozen(refs[0])).toBe(true)
    expect(slashCommandReferences(prompt)).toEqual([])
    expect(slashCommandReferences(command)).toEqual([])
    expect(slashCommandBodyContract.references(json(writeJsonLossless(skillDefinition)))).toEqual(
      refs,
    )
  })
  it('P-port record name/context chooses the full ordered receiver judge', () => {
    expect(slashCommandBodyContract.category).toBe('slash_command')
    expect(
      slashCommandBodyContract.judge(command, {
        capabilityName: 'omne-official:x',
        origin: 'official',
      }),
    ).toEqual({ ok: true })
    expect(
      slashCommandBodyContract.judge(command, { capabilityName: 'x', origin: 'official' }),
    ).toEqual({ rejected: 'name_reserved' })
    expect(slashCommandBodyContract.judge(prompt, { capabilityName: 'a/b' })).toEqual({
      rejected: 'name_invalid',
    })
    expect(
      slashCommandBodyContract.judge({ binding: { kind: 'unknown' } }, { capabilityName: 'a/b' }),
    ).toEqual({ rejected: 'binding_unknown' })
  })
  it('P-all nine fixed definitions usable through AM body port; unknown is a technical precondition', () => {
    const examples = [
      'x',
      'service.action',
      prompt.binding,
      { name: 'x', kind: 'string', required: true },
      prompt,
      { start: 0, end: 1 },
      invocation('/x'),
      recognize('//x'),
      { kind: 'expanded', text: '' },
    ]
    expect(SCHEMA_DEF_NAMES).toHaveLength(9)
    SCHEMA_DEF_NAMES.forEach((definition, index) =>
      expect(slashCommandBodyContract.judge(examples[index], { definition })).toEqual({ ok: true }),
    )
    expect(slashCommandBodyContract.judge({ start: 2, end: 1 }, { definition: 'Span' })).toEqual({
      rejected: 'malformed',
    })
    expect(
      slashCommandBodyContract.judge(
        { kind: 'failed', reason: 'unknown_command', explanation: 'x' },
        { definition: 'ParseResult' },
      ),
    ).toEqual({ rejected: 'malformed' })
    expect(() => slashCommandBodyContract.judge(prompt, { definition: 'NotOwned' })).toThrow(
      TypeError,
    )
    expect(() =>
      slashCommandBodyContract.deriveDeclarations({ binding: { kind: 'unknown' } }),
    ).toThrow(TypeError)
    expect(() => slashCommandBodyContract.references({ binding: { kind: 'unknown' } })).toThrow(
      TypeError,
    )
  })
  it('P-schema resource exact frozen bytes and schema value detached/deeply immutable', () => {
    const resource = readFileSync(new URL('../schema/slash-command.schema.json', import.meta.url))
    const frozen = adoptedSchemaBytes('slash-command', 2)
    expect(resource.equals(frozen)).toBe(true)
    expect(createHash('sha256').update(resource).digest('hex')).toBe(
      '595e5662cf7ebd5d84c5ba3edee7b4dd8a6e817a4738343bfa86c318cc1ac40e',
    )
    const schema = slashCommandBodyContract.schema
    if (typeof schema !== 'object' || schema === null) throw new Error('object Schema required')
    expect(schema.$id).toBe(schemaId)
    expect(Object.isFrozen(schema)).toBe(true)
    expect(Object.isFrozen(schema.$defs)).toBe(true)
    const source = readFileSync(new URL('../src/declarations.ts', import.meta.url), 'utf8')
    expect(source.match(/^import (?!type\b)/gmu)).toBeNull()
    expect(source).not.toMatch(/Date[.]now|new Date|performance[.]now|process[.]|globalThis[.]/u)
  })
})

describe('S-22 skill-body and raw-argument exact data projections', () => {
  const annotations = [annotation('body-id', false, true), annotation('arg-id', true, false)]
  const bodies = [
    '',
    'plain\r\ntext\n',
    '  # Heading\n\n$ARGUMENTS $0 <xml/>  ',
    '\ud83d\ude00\u0000\t',
  ]
  for (const body of bodies)
    for (const argumentText of ['', '--x="a b" \\ c', '😀 $ARGUMENTS\n/next'])
      it(`K-exact ${JSON.stringify(body)} ${JSON.stringify(argumentText)}`, () => {
        const skill: SkillPackage = {
          manifest: { name: 'review', description: 'review' },
          body,
          resources: [],
        }
        const input = invocation(`/review${argumentText === '' ? '' : `  ${argumentText}  `}`)
        const count = argumentText === '' ? 1 : 2
        const outputs = expandSkill(input, 'review', skill, annotations.slice(0, count))
        expect(outputs).toEqual([
          {
            kind: 'text',
            id: 'body-id',
            visibility: { toHuman: false, toModel: true },
            text: body,
            origin: { kind: 'skill_body', command: 'review', skill: 'review' },
          },
          ...(count === 1
            ? []
            : [
                {
                  kind: 'text',
                  id: 'arg-id',
                  visibility: { toHuman: true, toModel: false },
                  text: argumentText,
                  origin: { kind: 'slash_command_args', command: 'review' },
                },
              ]),
        ])
        expect(Object.isFrozen(outputs)).toBe(true)
        outputs.forEach(block => {
          expect(judgeContentBlock(block)).toEqual({ ok: block })
          expect(Object.isFrozen(block)).toBe(true)
          expect(Object.isFrozen(block.visibility)).toBe(true)
          expect(Object.isFrozen(block.origin)).toBe(true)
        })
        expect(writeJsonLossless(skill)).toContain(JSON.stringify(body))
      })
  it('K-caller labels copied; source command differs from selected skill name', () => {
    const annotation = annotations[0]
    if (annotation === undefined) throw new Error('annotation required')
    const skill: SkillPackage = {
      manifest: { name: 'review', description: 'review' },
      body: 'unchanged',
      resources: [],
    }
    const mutable = { id: annotation.id, visibility: { toHuman: true, toModel: false } }
    const blocks = expandSkill(invocation('/code-review'), 'review', skill, [mutable])
    mutable.visibility.toModel = true
    expect(blocks[0]?.visibility).toEqual({ toHuman: true, toModel: false })
    expect(blocks[0]?.origin).toEqual({
      kind: 'skill_body',
      command: 'code-review',
      skill: 'review',
    })
  })
  it('K-exact annotation count and invalid selected skill fail technical preconditions', () => {
    const skill: SkillPackage = {
      manifest: { name: 'review', description: 'review' },
      body: 'x',
      resources: [],
    }
    expect(() => expandSkill(invocation('/review'), 'review', skill, [])).toThrow(TypeError)
    expect(() => expandSkill(invocation('/review'), 'review', skill, annotations)).toThrow(
      TypeError,
    )
    expect(() =>
      expandSkill(invocation('/review arg'), 'review', skill, annotations.slice(0, 1)),
    ).toThrow(TypeError)
    expect(() =>
      expandSkill(invocation('/review'), 'other', skill, annotations.slice(0, 1)),
    ).toThrow(TypeError)
  })
  it('K-content-block malformed annotations rejected, never defaulted', () => {
    const skill: SkillPackage = {
      manifest: { name: 'review', description: 'review' },
      body: 'x',
      resources: [],
    }
    const invalid = { id: '', visibility: { toHuman: true, toModel: false } }
    // @ts-expect-error raw external identifiers have not acquired the BlockId brand
    expect(() => expandSkill(invocation('/review'), 'review', skill, [invalid])).toThrow(TypeError)
    const missing = { id: annotations[0]?.id, visibility: { toHuman: true } }
    // @ts-expect-error both visibility members are a required caller-owned annotation
    expect(() => expandSkill(invocation('/review'), 'review', skill, [missing])).toThrow(TypeError)
  })
  it('K-prompt helper uses parser binding outcomes and rejects wrong binding precondition', () => {
    const definition: SlashCommandDefinition = {
      ...prompt,
      parameters: [{ name: 'x', kind: 'integer', required: true, positional: true }],
    }
    const input = invocation('/x bad')
    expect(expandPrompt(definition, input)).toEqual(parseInvocation(input, { x: definition }))
    expect(() => expandPrompt(command, input)).toThrow(TypeError)
  })
})
