import type {
  Custody,
  Preprocess,
  Representation,
  Representations,
} from '@omne-harness/media-contract'
import type { IntakeProcessor, IntakeVerdict } from '@omne-harness/session-contract'

export { createModelMediaSource } from './model-source.ts'
export { createToolMediaStore } from './tool-store.ts'
export {
  CONVERTER_CATEGORY,
  converterBodyContract,
  converterCategoryDisplay,
  parseConverterBody,
  type ConverterBody,
  type ConverterBodyRejection,
} from './converter-category.ts'
export { createConverterDefinitions, type ConverterLayers } from './converter-definitions.ts'

export const REFERENCES_PROCESSOR = 'media.references'

type Screening<P> = Parameters<IntakeProcessor<P>['run']>[0]
type Block = Screening<unknown>['effective']['blocks'][number]

type IntakeMedia = Readonly<{
  custody: Pick<Custody, 'hold'>
  representations: Pick<Representations, 'read'>
}>
type Verdict = IntakeVerdict
const NO_MEDIUM = 'the content reference names no medium of this tenant that is ready'

function written(representation: Representation): Readonly<Record<string, unknown>> {
  const { definition, engine } = representation
  if (representation.outcome === 'inconvertible')
    return { snapshot: { outcome: 'inconvertible', definition, engine } }
  const { text, others } = representation
  const inline = typeof text === 'string'
  const snapshot = { outcome: 'converted', definition, engine, text: inline ? null : text, others }
  return inline ? { transcript: text, snapshot } : { snapshot }
}

/** A medium goes into an input only once its preprocessing has ended: done, or nothing to do. */
function unready(state: Preprocess, block: Block['id']): Verdict | null {
  if (state.kind === 'not-started' || state.kind === 'running')
    return {
      kind: 'block',
      block,
      reason: 'the medium is not ready: its preprocessing has not ended',
    }
  if (state.kind === 'failed')
    return { kind: 'block', block, reason: `preparing the medium failed: ${state.reason}` }
  return null
}

/** Holds every medium an input refers to before it is written; gives its facts (ME-4) and snapshot (I-5). */
export function createReferencesProcessor<P>(
  media: () => IntakeMedia | undefined,
): IntakeProcessor<P> {
  type Referring = Extract<Block, { ref: unknown }>
  type Taken = Readonly<{ block: Block }> | Readonly<{ verdict: IntakeVerdict }>
  const stop = (verdict: IntakeVerdict): Taken => ({ verdict })

  /** One block that refers to a medium: what goes into the input in its place, or why the input does not go. */
  async function referred(block: Referring, { request, access }: Screening<P>): Promise<Taken> {
    const face = media()
    if (face === undefined)
      return stop({ kind: 'unavailable', diagnostic: 'the custody of media is not there' })
    const { tenant } = access
    const read = await face.representations.read({ tenant, ref: block.ref })
    if ('failure' in read) return stop({ kind: 'block', block: block.id, reason: NO_MEDIUM })
    const refused = unready(read.ok, block.id)
    if (refused !== null) return stop(refused)
    const holder = {
      owner: REFERENCES_PROCESSOR,
      work: access.session,
      position: request.input,
      purpose: 'input',
    }
    const held = await face.custody.hold({ tenant, ref: block.ref, holder })
    if ('failure' in held)
      return stop(
        held.failure.kind === 'invalid-reference'
          ? { kind: 'block', block: block.id, reason: NO_MEDIUM }
          : { kind: 'unavailable', diagnostic: `the hold answered ${held.failure.kind}` },
      )
    const done = read.ok.kind === 'done' ? written(read.ok.representation) : {}
    return { block: { ...block, facts: held.ok.facts, ...done } as Block }
  }

  async function run(screening: Screening<P>): Promise<IntakeVerdict> {
    const { effective } = screening
    const blocks: Block[] = []
    for (const block of effective.blocks) {
      const taken: Taken = 'ref' in block ? await referred(block, screening) : { block }
      if ('verdict' in taken) return taken.verdict
      blocks.push(taken.block)
    }
    if (!blocks.some(block => 'ref' in block)) return { kind: 'pass' }
    // The same blocks in the same order, each of its own kind: still a message of its role.
    return { kind: 'pass', effective: { ...effective, blocks } as unknown as typeof effective }
  }
  return { name: REFERENCES_PROCESSOR, run }
}
