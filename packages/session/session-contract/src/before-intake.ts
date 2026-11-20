import { judgeMessage, type Message, type MessageContentBlock } from '@omne-harness/message'
import type { InputId, SessionAccess, SessionOperationId } from './identity.ts'
import type { InputSourceName } from './input-sources.ts'
import { digestOf } from './operations.ts'

type ContentBlock = MessageContentBlock
type BlockId = ContentBlock['id']

/** What a processor reads of one input: the original, and in `effective` what those before it made of it. */
export type IntakeScreening<P> = Readonly<{
  original: Message
  effective: Message
  source: InputSourceName
  request: Readonly<{ input: InputId; operation: SessionOperationId }>
  access: SessionAccess<P>
}>

export type IntakeVerdict =
  | Readonly<{ kind: 'pass'; effective?: Message }>
  | Readonly<{ kind: 'block'; block?: BlockId; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** Runs again when the same submission enters again before it was committed: idempotent on the request. */
export type IntakeProcessor<P> = Readonly<{
  name: string
  run(input: IntakeScreening<P>): Promise<IntakeVerdict>
}>

export type BeforeIntakeRegistry<P> = Readonly<{
  register(processor: IntakeProcessor<P>): () => void
  current(): readonly IntakeProcessor<P>[]
}>

const NAME = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/u

export function createBeforeIntakeRegistry<P>(): BeforeIntakeRegistry<P> {
  const registered = new Map<string, IntakeProcessor<P>>()
  return Object.freeze({
    register(processor: IntakeProcessor<P>) {
      const { name } = processor
      if (typeof name !== 'string' || !NAME.test(name))
        throw new TypeError(`"${String(name)}" is not a processor name <domain>.<name>`)
      if (typeof processor.run !== 'function') throw new TypeError(`processor ${name} cannot run`)
      if (registered.has(name)) throw new Error(`processor ${name} is already registered`)
      registered.set(name, processor)
      return () => {
        if (registered.get(name) === processor) registered.delete(name)
      }
    },
    current: () => [...registered.values()].sort((a, b) => (a.name < b.name ? -1 : 1)),
  })
}

const isReference = (block: ContentBlock): block is Extract<ContentBlock, { ref: unknown }> =>
  Object.hasOwn(block, 'ref')

/** A message as its sender may bring it: facts, snapshot and inline text of a reference block are not the sender's to give. */
export function originalContent<M extends Message>(message: M): M {
  const blocks = message.blocks.map(block => {
    if (!isReference(block as ContentBlock)) return block
    const { facts: _facts, snapshot: _snapshot, ...bare } = block as Record<string, unknown>
    return Object.hasOwn(bare, 'transcript') ? { ...bare, transcript: null } : bare
  })
  return { ...message, blocks } as M
}

/** An effective content may only add to the reference blocks of the original what `originalContent` drops. */
function withinOriginal(original: Message, effective: unknown): effective is Message {
  const judged = judgeMessage(effective)
  return 'ok' in judged && digestOf(originalContent(judged.ok)) === digestOf(original)
}

const OUT_OF_BOUNDS = 'its effective content changes more than the reference blocks may gain'

export type Screened =
  | Readonly<{ kind: 'screened'; effective: Message }>
  | Readonly<{ kind: 'blocked'; processor: string; block: BlockId | null; reason: string }>
  | Readonly<{ kind: 'unavailable'; processor: string; diagnostic: string }>

const VERDICTS: ReadonlySet<unknown> = new Set(['pass', 'block', 'unavailable'])
const isVerdict = (answer: unknown): answer is IntakeVerdict =>
  typeof answer === 'object' && answer !== null && VERDICTS.has((answer as IntakeVerdict).kind)

async function verdictOf<P>(
  processor: IntakeProcessor<P>,
  input: IntakeScreening<P>,
): Promise<IntakeVerdict> {
  try {
    const answer: unknown = await processor.run(input)
    return isVerdict(answer) ? answer : { kind: 'unavailable', diagnostic: 'no verdict' }
  } catch (error) {
    const thrown = error instanceof Error ? error.message : String(error)
    return { kind: 'unavailable', diagnostic: `threw: ${thrown}` }
  }
}

/** Runs the processors in the order of their names. A block refuses; a throw or no verdict is unavailable. */
export async function screenInput<P>(
  input: Readonly<{ processors: readonly IntakeProcessor<P>[] }> &
    Omit<IntakeScreening<P>, 'effective'>,
): Promise<Screened> {
  const { processors, ...given } = input
  const original = originalContent(given.original)
  let effective = original
  for (const each of processors) {
    const processor = each.name
    const verdict = await verdictOf(each, { ...given, original, effective })
    if (verdict.kind === 'block')
      return { kind: 'blocked', processor, block: verdict.block ?? null, reason: verdict.reason }
    if (verdict.kind === 'unavailable')
      return { kind: 'unavailable', processor, diagnostic: verdict.diagnostic }
    if (verdict.effective === undefined) continue
    if (!withinOriginal(original, verdict.effective))
      return { kind: 'unavailable', processor, diagnostic: OUT_OF_BOUNDS }
    effective = verdict.effective
  }
  return { kind: 'screened', effective }
}

export type IntakeBlockRefusal = Readonly<{
  kind: 'inline' | 'unmeasured'
  index: number
  block: BlockId
}>

/** The log holds no bytes of media, and every reference it holds was measured (SE-37). */
export function judgeIntakeBlocks(message: Message): IntakeBlockRefusal | null {
  const blocks = message.blocks as readonly ContentBlock[]
  const refusal = (kind: IntakeBlockRefusal['kind'], index: number): IntakeBlockRefusal | null =>
    index < 0 ? null : { kind, index, block: blocks[index]!.id }
  return (
    refusal(
      'inline',
      blocks.findIndex(block => Object.hasOwn(block, 'inline')),
    ) ??
    refusal(
      'unmeasured',
      blocks.findIndex(block => isReference(block) && block.facts === undefined),
    )
  )
}
