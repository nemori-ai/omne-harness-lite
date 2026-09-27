import { expectTypeOf, it } from 'vitest'
import type { BodyContract } from '@omne-harness-lite/asset-model'
import type { BlockId, TextBlock } from '@omne-harness-lite/content-blocks'
import type { AccountId } from '@omne-harness-lite/identity-values'
import type { SkillPackage } from '@omne-harness-lite/skill-package/v2'
import {
  recognize,
  parseInvocation,
  expandPrompt,
  expandSkill,
  slashCommandBodyContract,
  validate,
  type CommandInvocation,
  type ParseResult,
  type ParseFailure,
  type ParameterDeclaration,
  type ExpansionBlockAnnotation,
  type SkillReference,
  type SlashCommandJudgment,
} from '../src/index.ts'

it('SC-3 four result arms and failed cannot be sent as content', () => {
  expectTypeOf<ParseResult['kind']>().toEqualTypeOf<'expanded' | 'skill' | 'command' | 'failed'>()
  expectTypeOf<SlashCommandJudgment>().not.toEqualTypeOf<ParseResult>()
  const failure: ParseFailure = {
    kind: 'failed',
    reason: 'unknown_command',
    at: { start: 0, end: 2 },
    explanation: 'unknown',
  }
  // @ts-expect-error a parsing failure is not a content block
  const outbound: TextBlock = failure
  // @ts-expect-error non-missing failures require their original-raw span
  const missingSpan: ParseFailure = {
    kind: 'failed',
    reason: 'unknown_command',
    explanation: 'unknown',
  }
  // @ts-expect-error representation rejections do not become parsing failures
  const mixed: ParseResult = { rejected: 'malformed' }
  void [outbound, missingSpan, mixed]
})

it('SC-4 parser accepts exactly explicit invocation and command set, no permission or host arguments', () => {
  expectTypeOf<Parameters<typeof parseInvocation>>().toEqualTypeOf<
    [
      invocation: CommandInvocation,
      commandSet: Readonly<Record<string, import('../src/index.ts').SlashCommandDefinition>>,
    ]
  >()
  const result = recognize('/x')
  if (result.kind !== 'invocation') return
  // @ts-expect-error there is no permission/runtime third input
  parseInvocation(result.invocation, {}, { allowed: true })
  // @ts-expect-error an invocation cannot be replaced by user-facing source text
  parseInvocation('/x', {})
  // @ts-expect-error schema names are the fixed nine selectors
  validate('RuntimeCommand', {})
  expectTypeOf(expandPrompt)
    .parameter(0)
    .toEqualTypeOf<import('../src/index.ts').SlashCommandDefinition>()
})

it('SC-6 literal category body and projection annotation identity', () => {
  expectTypeOf(slashCommandBodyContract).toEqualTypeOf<BodyContract<'slash_command'>>()
  // @ts-expect-error a slash body cannot occupy the skill slot
  const skillPort: BodyContract<'skill'> = slashCommandBodyContract
  // @ts-expect-error tool references do not occupy a skill binding
  const tool: SkillReference = { category: 'tool', name: 'x' }
  // @ts-expect-error enum declarations require a values domain
  const enumWithoutValues: ParameterDeclaration = { name: 'x', kind: 'enum', required: true }
  // @ts-expect-error only enum declarations carry a values domain
  const extraValues: ParameterDeclaration = {
    name: 'x',
    kind: 'string',
    required: true,
    values: ['a'],
  }
  const namedWithFalse: ParameterDeclaration = {
    name: 'x',
    kind: 'string',
    required: true,
    // @ts-expect-error false positional markers are not a canonical declaration
    positional: false,
  }
  const needsBrand = (id: AccountId) => {
    const annotation: ExpansionBlockAnnotation = {
      // @ts-expect-error an AccountId cannot become a BlockId
      id,
      visibility: { toHuman: true, toModel: true },
    }
    return annotation
  }
  expectTypeOf<ExpansionBlockAnnotation['id']>().toEqualTypeOf<BlockId>()
  expectTypeOf<Parameters<typeof expandSkill>>().toEqualTypeOf<
    [CommandInvocation, string, SkillPackage, readonly ExpansionBlockAnnotation[]]
  >()
  expectTypeOf<ReturnType<typeof expandSkill>>().toEqualTypeOf<readonly TextBlock[]>()
  void [skillPort, tool, enumWithoutValues, extraValues, namedWithFalse, needsBrand]
})
