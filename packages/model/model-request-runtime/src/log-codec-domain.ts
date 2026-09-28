import { judgeModelResponse as judgeV4 } from '@omne-harness-lite/model-response'
import { judgeModelResponse as judgeV5 } from '@omne-harness-lite/model-response/v5'

/** Fixed module-owned representation domains; never caller-supplied codec policy. */
export const legacyCodecDomain = Object.freeze({
  writeFormat: 'mrr/1',
  readFormats: Object.freeze(['mrr/1']),
})
export const currentCodecDomain = Object.freeze({
  writeFormat: 'mrr/2',
  readFormats: Object.freeze(['mrr/1', 'mrr/2']),
})
export type ModelLogCodecDomain = typeof legacyCodecDomain | typeof currentCodecDomain
export function responseJudgeForFormat(format: string) {
  return format === 'mrr/1' ? judgeV4 : judgeV5
}
