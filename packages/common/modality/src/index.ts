export type Modality = 'text' | 'image' | 'voice' | 'video'

export const MODALITIES: readonly Modality[] = Object.freeze<Modality[]>([
  'text',
  'image',
  'voice',
  'video',
])

export type ModalityJudgment = { ok: Modality } | { rejected: 'type' | 'modality' }

export type ModalitiesJudgment =
  | { ok: readonly Modality[] }
  | { rejected: 'type' | 'modality' | 'duplicate'; index: number | null }

export type MediaTypeJudgment =
  | { ok: { mediaType: string; modality: Modality | null } }
  | { rejected: 'type' | 'media-type' }

const OWS = '[ \\t]*'
const TOKEN = "[!#$%&'*+\\-.^_`|~0-9A-Za-z]+"
const QUOTED_STRING =
  '"(?:[\\t \\x21\\x23-\\x5B\\x5D-\\x7E\\x80-\\xFF]|\\\\[\\t \\x21-\\x7E\\x80-\\xFF])*"'
const PARAMETER = `${TOKEN}=(?:${TOKEN}|${QUOTED_STRING})`
const TYPE_AND_SUBTYPE = new RegExp(`^(${TOKEN})/(${TOKEN})`)
// 分号后的 OWS 只在后面紧跟参数或输入结束时属于这个槽，否则属于下一个槽分号前的 OWS，
// 每段空白因此只有一种划分，不合文法的输入不会引起指数回溯。
const PARAMETER_SLOT = new RegExp(`${OWS};(?:${OWS}(?:${PARAMETER}|$))?`, 'gy')

function isParameterList(text: string): boolean {
  let end = 0
  for (const slot of text.matchAll(PARAMETER_SLOT)) end = slot.index + slot[0].length
  return end === text.length
}

const MODALITY_OF_TOP_LEVEL_TYPE: ReadonlyMap<string, Modality> = new Map<string, Modality>([
  ['text', 'text'],
  ['image', 'image'],
  ['audio', 'voice'],
  ['video', 'video'],
])

function findModality(value: unknown): Modality | undefined {
  return MODALITIES.find(modality => modality === value)
}

export function judgeModality(value: unknown): ModalityJudgment {
  if (typeof value !== 'string') return { rejected: 'type' }
  const modality = findModality(value)
  return modality === undefined ? { rejected: 'modality' } : { ok: modality }
}

export function judgeModalities(value: unknown): ModalitiesJudgment {
  if (!Array.isArray(value)) return { rejected: 'type', index: null }
  const seen = new Set<Modality>()
  const accepted: Modality[] = []
  for (let index = 0; index < value.length; index += 1) {
    const judgment = judgeModality(value[index])
    if ('rejected' in judgment) return { rejected: judgment.rejected, index }
    if (seen.has(judgment.ok)) return { rejected: 'duplicate', index }
    seen.add(judgment.ok)
    accepted.push(judgment.ok)
  }
  return { ok: Object.freeze(accepted) }
}

export function judgeMediaType(value: unknown): MediaTypeJudgment {
  if (typeof value !== 'string') return { rejected: 'type' }
  const match = TYPE_AND_SUBTYPE.exec(value)
  if (match === null || !isParameterList(value.slice(match[0].length)))
    return { rejected: 'media-type' }
  const topLevel = (match[1] ?? '').toLowerCase()
  const subtype = (match[2] ?? '').toLowerCase()
  return {
    ok: {
      mediaType: `${topLevel}/${subtype}`,
      modality: MODALITY_OF_TOP_LEVEL_TYPE.get(topLevel) ?? null,
    },
  }
}

export function isCanonicalMediaType(value: string): boolean {
  const judgment = judgeMediaType(value)
  return 'ok' in judgment && judgment.ok.mediaType === value
}

export function missingModalities(
  required: readonly Modality[],
  available: readonly Modality[],
): readonly Modality[] {
  return Object.freeze(
    MODALITIES.filter(modality => required.includes(modality) && !available.includes(modality)),
  )
}
