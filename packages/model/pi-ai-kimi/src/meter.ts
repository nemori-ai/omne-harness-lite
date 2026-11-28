import type { ModelTextTokenizer } from '@omne-harness/model-contract/provider'
import type { FamilyMeter, MeterMargin } from '@omne-harness/pi-ai-transport/chat-completions'
import {
  chatRepresentation,
  chatUnitsOf,
  createGatewayMeter,
  tileImageTokens,
} from '@omne-harness/pi-ai-transport/family-kit'
import { KIMI_OWNER } from './owner.ts'
import type { KimiRecord } from './record.ts'

export const OUTPUT_GROUP_METHOD = 'kimi-complete-output-group-workload-estimated/1'
export { ANCHORED_METHOD, type MeterMargin } from '@omne-harness/pi-ai-transport/chat-completions'

// The pinned endpoints measured approximately one token per 28×28 tile. Include
// the observed framing charge with headroom, before the operator's normal margin.
const IMAGE_TILES = { tilePixels: '28', tokensPerTile: '1', overheadTokens: '16' } as const

export function createKimiMeter(
  record: KimiRecord,
  tokenizer: ModelTextTokenizer,
  margin: MeterMargin,
): FamilyMeter {
  return createGatewayMeter({
    owner: KIMI_OWNER,
    record,
    tokenizer,
    margin,
    outputGroup: OUTPUT_GROUP_METHOD,
    uncountable: 'reasoning-not-countable',
    form: 'as-written',
    contentOf: tokenInput => chatUnitsOf(tokenInput, ['auto']),
    imageTokens: ({ units, media }) => tileImageTokens(KIMI_OWNER, IMAGE_TILES, units, media),
    represent: view =>
      chatRepresentation(view, {
        instructionRole: record.wire.roles.instruction,
        imageDetail: record.wire.image?.detail ?? 'auto',
        files: false,
      }),
  })
}
