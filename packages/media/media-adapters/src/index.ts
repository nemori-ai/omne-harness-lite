import type { Custody } from '@omne-harness/media-contract'
import type { IntakeProcessor, IntakeVerdict } from '@omne-harness/session-contract'

export const REFERENCES_PROCESSOR = 'media.references'

type Screening<P> = Parameters<IntakeProcessor<P>['run']>[0]
type Block = Screening<unknown>['effective']['blocks'][number]

/** Holds every medium an input refers to before the input is written, and gives its facts (ME-4). */
export function createReferencesProcessor<P>(
  custody: () => Pick<Custody, 'hold'> | null | undefined,
): IntakeProcessor<P> {
  async function run({ effective, request, access }: Screening<P>): Promise<IntakeVerdict> {
    const holder = {
      owner: REFERENCES_PROCESSOR,
      work: access.session,
      position: request.input,
      purpose: 'input',
    }
    const blocks: Block[] = []
    for (const block of effective.blocks) {
      if (!('ref' in block)) {
        blocks.push(block)
        continue
      }
      const media = custody()
      if (media === null || media === undefined)
        return { kind: 'unavailable', diagnostic: 'the custody of media is not there' }
      const held = await media.hold({ tenant: access.tenant, ref: block.ref, holder })
      if ('ok' in held) blocks.push({ ...block, facts: held.ok.facts })
      else if (held.failure.kind === 'invalid-reference')
        return {
          kind: 'block',
          block: block.id,
          reason: 'the content reference names no medium of this tenant that is ready',
        }
      else return { kind: 'unavailable', diagnostic: `the hold answered ${held.failure.kind}` }
    }
    if (!blocks.some(block => 'ref' in block)) return { kind: 'pass' }
    // The same blocks in the same order, each of its own kind: still a message of its role.
    return { kind: 'pass', effective: { ...effective, blocks } as unknown as typeof effective }
  }
  return { name: REFERENCES_PROCESSOR, run }
}
