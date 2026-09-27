import { expect, it } from 'vitest'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { type SkillPackage } from '@omne-harness-lite/skill-package/v2'
import {
  recognize,
  parseInvocation,
  judgeInvocation,
  judgeSlashCommand,
  expandSkill,
  type CommandInvocation,
  type SlashCommandDefinition,
} from '../src/index.ts'

function invocation(raw: string): CommandInvocation {
  const result = recognize(raw)
  if (result.kind !== 'invocation') throw new Error('invocation required')
  return result.invocation
}

it('CS-1 core step fixed type failure, human/machine use identical public function', () => {
  const definition: SlashCommandDefinition = {
    description: 'fix',
    binding: { kind: 'prompt', template: 'Fix $0' },
    parameters: [{ name: 'issue', kind: 'integer', required: true, positional: true }],
  }
  const human = parseInvocation(invocation('/fix-issue abc'), { 'fix-issue': definition })
  const machine = parseInvocation(invocation('/fix-issue abc'), { 'fix-issue': definition })
  expect(human).toMatchObject({
    kind: 'failed',
    reason: 'type_mismatch',
    at: { start: 11, end: 14 },
  })
  expect(machine).toEqual(human)
})

it('CS-2 core step current set replaces previous facts; unknown reveals no alternate scope', () => {
  const input = invocation('/summarize text')
  const definition = {
    description: 'p',
    binding: { kind: 'prompt', template: '$ARGUMENTS' },
  } as const
  expect(parseInvocation(input, { summarize: definition })).toEqual({
    kind: 'expanded',
    text: 'text',
  })
  expect(judgeInvocation(input)).toEqual({ ok: true })
  const removed = parseInvocation(input, {})
  const nonexistent = parseInvocation(invocation('/nonexistent text'), {})
  expect(removed).toMatchObject({
    kind: 'failed',
    reason: 'unknown_command',
    at: { start: 0, end: 10 },
  })
  if (removed.kind !== 'failed' || nonexistent.kind !== 'failed')
    throw new Error('failure expected')
  expect(removed.explanation).toBe(nonexistent.explanation)
  expect(removed.explanation).not.toMatch(
    /permission|tenant|layer|other session|summarize|nonexistent/iu,
  )
  expect(judgeInvocation({ ...input, raw: '/summarize changed' })).toEqual({
    rejected: 'malformed',
  })
})

it('CS-3 core step selected authorized package is explicit; only two S-22 expansion blocks', () => {
  const input = invocation('/code-review focus on error handling')
  const definition = {
    description: 'review',
    binding: { kind: 'skill', skill: { category: 'skill', name: 'code-review' } },
  } as const
  const parsed = parseInvocation(input, { 'code-review': definition })
  expect(parsed).toEqual({ kind: 'skill', skill: { category: 'skill', name: 'code-review' } })
  const pkg: SkillPackage = {
    manifest: { name: 'code-review', description: 'review' },
    body: '  Review exactly\n$0\n',
    resources: [],
  }
  const bodyId = parseOpaqueIdentifier('body', 'BlockId'),
    argId = parseOpaqueIdentifier('arg', 'BlockId')
  if ('invalidInput' in bodyId || 'invalidInput' in argId) throw new Error('valid ids required')
  const blocks = expandSkill(input, 'code-review', pkg, [
    { id: bodyId.ok, visibility: { toHuman: true, toModel: true } },
    { id: argId.ok, visibility: { toHuman: true, toModel: true } },
  ])
  expect(blocks.map(block => [block.text, block.origin])).toEqual([
    [
      '  Review exactly\n$0\n',
      { kind: 'skill_body', command: 'code-review', skill: 'code-review' },
    ],
    ['focus on error handling', { kind: 'slash_command_args', command: 'code-review' }],
  ])
  // Authorization, log record and delivery are caller obligations, not facts proven here.
  expect(blocks).toHaveLength(2)
})

it('CS-4 core step command-set shape; record origin/name supplied separately before parsing', () => {
  const definition = {
    description: 'reload',
    binding: { kind: 'command', service: 'registry.reload.skill' },
  } as const
  expect(
    judgeSlashCommand(definition, {
      capabilityName: 'omne-official:reload-skill',
      origin: 'official',
    }),
  ).toEqual({ ok: true })
  expect(
    parseInvocation(invocation('/omne-official:reload-skill'), {
      'omne-official:reload-skill': definition,
    }),
  ).toEqual({ kind: 'command', service: 'registry.reload.skill' })
  expect(
    judgeSlashCommand(definition, {
      capabilityName: 'omne-official:reload-skill',
      origin: 'customized',
    }),
  ).toEqual({ rejected: 'name_reserved' })
})

it('CS-6 core step importer-supplied declarations; literal ARGUMENTS bracket and missing semantics', () => {
  const definition: SlashCommandDefinition = {
    description: 'imported',
    binding: { kind: 'prompt', template: '$0 $1 $ARGUMENTS[0]' },
    parameters: [
      { name: 'first', kind: 'string', required: true, positional: true },
      { name: 'second', kind: 'string', required: false, positional: true },
    ],
  }
  expect(parseInvocation(invocation('/x first'), { x: definition })).toEqual({
    kind: 'expanded',
    text: 'first  first[0]',
  })
  expect(parseInvocation(invocation('/x'), { x: definition })).toMatchObject({
    kind: 'failed',
    reason: 'missing_required',
  })
  expect(judgeSlashCommand({ ...definition, parameters: undefined })).toEqual({
    rejected: 'malformed',
  })
})
