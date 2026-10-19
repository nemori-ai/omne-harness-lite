/** 四种模态。`voice` 覆盖全部 `audio/*` 媒体类型。 */
export type Modality = 'text' | 'image' | 'voice' | 'video'

/** 全部模态，按 text、image、voice、video 的顺序，冻结。 */
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

/** RFC 9110 §5.6.3 的 OWS：零个或多个空格或水平制表符。 */
const OWS = '[ \\t]*'
/** RFC 9110 §5.6.2 的 token：一个或多个 tchar。 */
const TOKEN = "[!#$%&'*+\\-.^_`|~0-9A-Za-z]+"
/** RFC 9110 §5.6.4 的 quoted-string，obs-text 取 %x80-FF。 */
const QUOTED_STRING =
  '"(?:[\\t \\x21\\x23-\\x5B\\x5D-\\x7E\\x80-\\xFF]|\\\\[\\t \\x21-\\x7E\\x80-\\xFF])*"'
/** RFC 9110 §5.6.6 的 parameter：`parameter-name "=" parameter-value`，`=` 两侧没有空白。 */
const PARAMETER = `${TOKEN}=(?:${TOKEN}|${QUOTED_STRING})`
/** RFC 9110 §8.3.1 的 `type "/" subtype`，从输入开头匹配。 */
const TYPE_AND_SUBTYPE = new RegExp(`^(${TOKEN})/(${TOKEN})`)
/**
 * RFC 9110 §5.6.6 `parameters = *( OWS ";" OWS [ parameter ] )` 的一个槽，粘连匹配。
 * 分号后的 OWS 只在后面紧跟参数或输入结束时属于这个槽，否则属于下一个槽分号前的 OWS。
 * 每段空白因此只有一种划分，不合文法的输入不会引起指数回溯。
 */
const PARAMETER_SLOT = new RegExp(`${OWS};(?:${OWS}(?:${PARAMETER}|$))?`, 'gy')

/**
 * 文本是否恰好由零个或多个参数槽组成。逐槽匹配，回溯只发生在一个槽之内，
 * 所以耗时与输入长度成正比，参数槽再多，正则引擎的回溯栈也不随槽数增长。
 */
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

/** 判定一个值是不是已知模态的字面量。 */
export function judgeModality(value: unknown): ModalityJudgment {
  if (typeof value !== 'string') return { rejected: 'type' }
  const modality = findModality(value)
  return modality === undefined ? { rejected: 'modality' } : { ok: modality }
}

/**
 * 判定一个值是不是由已知模态、互不重复的元素组成的数组。空数组合法。
 * `index` 指第一个出错的元素（重复时是后出现的那个），整体不是数组时为 `null`。
 */
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

/**
 * 判定一个值是不是合乎 RFC 9110 §8.3.1 文法的媒体类型，返回小写的 `type/subtype`
 * 规范形式（参数丢弃）和按顶层类型识别的模态；顶层类型不属于四种模态时 `modality` 为 `null`。
 * 不看内容，不看扩展名。
 */
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

/** 值是合法媒体类型，且已经是规范形式（小写、无参数、无空白）时为 `true`。 */
export function isCanonicalMediaType(value: string): boolean {
  const judgment = judgeMediaType(value)
  return 'ok' in judgment && judgment.ok.mediaType === value
}

/** `required` 中不在 `available` 里的模态，按 `MODALITIES` 顺序、去重，返回冻结数组。 */
export function missingModalities(
  required: readonly Modality[],
  available: readonly Modality[],
): readonly Modality[] {
  return Object.freeze(
    MODALITIES.filter(modality => required.includes(modality) && !available.includes(modality)),
  )
}
