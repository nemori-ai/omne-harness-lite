import type { TenantId } from '@omne-harness/public-contract'
import type { MediaClient, Reference } from './upload.ts'

/** What the attachment shows once its representation is ready. */
export type Prepared = Readonly<{
  outcome: 'none' | 'converted' | 'inconvertible'
  /** The words, when they came back in line; many words are kept apart and not shown. */
  text: string | null
}>
export type Ready = Readonly<{ kind: 'ready'; ref: Reference }> & Prepared
export type Failed = Readonly<{ kind: 'failed'; reason: string; ref?: Reference }>
export type PrepareOutcome = Ready | Failed

const RECOVERIES = 2
const WORDS: Readonly<Record<string, string>> = {
  'basis-unavailable': '现在查不到该怎么转换',
  'engine-unavailable': '转换的服务现在不可用',
  'engine-error': '转换出错',
  timeout: '转换超时',
  'invalid-result': '转换的结果不对',
  'outcome-unknown': '不知道转换有没有成功',
  cancelled: '转换被取消',
}
type Answer = Awaited<ReturnType<MediaClient['prepare-media']>>
type Preprocess = Extract<Answer, { outcome: 'succeeded' }>['body']['preprocess']

function settled(preprocess: Preprocess, ref: Reference): PrepareOutcome {
  if (preprocess.kind === 'not-needed') return { kind: 'ready', ref, outcome: 'none', text: null }
  if (preprocess.kind === 'done') {
    const { representation } = preprocess
    if (representation.outcome === 'inconvertible')
      return { kind: 'ready', ref, outcome: 'inconvertible', text: null }
    const text = typeof representation.text === 'string' ? representation.text : null
    return { kind: 'ready', ref, outcome: 'converted', text }
  }
  const reason = preprocess.kind === 'failed' ? WORDS[preprocess.reason] : undefined
  return { kind: 'failed', reason: reason ?? '服务端现在备不好这份附件', ref }
}

/** Asks the server to make the representation ready; asking again is safe, so a lost answer is asked again. */
export async function prepareMedium(
  client: MediaClient,
  tenant: TenantId,
  ref: Reference,
): Promise<PrepareOutcome> {
  for (let tried = 0; tried <= RECOVERIES; tried += 1) {
    const answer = await client['prepare-media']({ tenant, ref }).catch(() => null)
    if (answer?.outcome === 'succeeded') return settled(answer.body.preprocess, ref)
    if (answer?.outcome === 'not-found')
      return { kind: 'failed', reason: '这份附件在服务端已经不在了' }
  }
  return { kind: 'failed', reason: '服务端现在备不好这份附件', ref }
}
