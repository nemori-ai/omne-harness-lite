import type { MediaMeasurementFact, TransportFailure } from '@omne-harness/model-contract'
import type { ModelTextTokenizer } from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import type { FamilyMeter, MeterMargin } from '@omne-harness/pi-ai-transport/chat-completions'
import {
  chatRepresentation,
  chatUnitsOf,
  componentAdoption,
  createGatewayMeter,
  type ChatUnit,
} from '@omne-harness/pi-ai-transport/family-kit'
import { IMAGE_RULES, type ImageDetail } from './images.ts'
import { OPENAI_OWNER } from './owner.ts'
import type { OpenAiRecord } from './record.ts'

export const OUTPUT_GROUP_METHOD = 'openai-complete-output-group-workload-estimated/1'
export { ANCHORED_METHOD, type MeterMargin } from '@omne-harness/pi-ai-transport/chat-completions'

const DETAILS: readonly ImageDetail[] = ['low', 'high', 'auto', 'original']

function unavailable(diagnostic: string): Outcome<never, TransportFailure> {
  return { failure: { kind: 'unavailable', dependency: OPENAI_OWNER, diagnostic } }
}

function imageTokens(
  record: OpenAiRecord,
  units: readonly ChatUnit<ImageDetail>[],
  media: readonly MediaMeasurementFact[],
): Outcome<readonly bigint[], TransportFailure> {
  const facts = media.filter(fact => fact.kind === 'image')
  const images = units.flatMap((unit, index) => unit.images.map(image => ({ ...image, index })))
  if (facts.length !== images.length) return unavailable('image-measurement-missing')
  const rule = IMAGE_RULES[record.meter.image]
  const extras = units.map(() => 0n)
  for (const [position, fact] of facts.entries()) {
    const image = images[position]
    if (fact.kind !== 'image' || image === undefined)
      return unavailable('image-measurement-missing')
    const tokens = rule({
      width: Number(fact.widthPixels),
      height: Number(fact.heightPixels),
      detail: image.detail,
    })
    if (tokens === null)
      return {
        failure: {
          kind: 'unsupported',
          field: `image ${position}`,
          adapter: componentAdoption(OPENAI_OWNER, record, 'media'),
        },
      }
    extras[image.index] = (extras[image.index] ?? 0n) + BigInt(tokens)
  }
  return { ok: extras }
}

// A chat record names the role of the system prompt and the image detail on its wire. The
// Responses interface sends the system prompt as a developer message and writes no image detail.
export function createOpenAiMeter(
  record: OpenAiRecord,
  tokenizer: ModelTextTokenizer,
  margin: MeterMargin,
): FamilyMeter {
  const responses = 'engine' in record
  return createGatewayMeter({
    owner: OPENAI_OWNER,
    record,
    tokenizer,
    margin,
    outputGroup: OUTPUT_GROUP_METHOD,
    uncountable: 'encrypted-reasoning-not-countable',
    form: 'as-written',
    contentOf: tokenInput => chatUnitsOf(tokenInput, DETAILS),
    imageTokens: ({ units, media }) => imageTokens(record, units, media),
    represent: view =>
      chatRepresentation(view, {
        instructionRole: responses ? 'developer' : record.wire.roles.instruction,
        imageDetail: responses ? 'auto' : (record.wire.image?.detail ?? 'auto'),
        files: false,
      }),
  })
}
