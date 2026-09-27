import { readJsonStrict, type JsonValue } from '@omne-harness-lite/content-blocks'
import type { BodyContractSupply } from './types.ts'
import { createAssetModelJudge } from './judge.ts'

export function parseWorkspaceManifestText(
  text: string,
  bodies: BodyContractSupply,
): { readonly ok: JsonValue } | { readonly rejected: string } {
  const parsed = readJsonStrict(text)
  if ('failed' in parsed) return Object.freeze({ rejected: 'malformed' })
  const result = createAssetModelJudge(bodies).judgeAssetValue(
    'WorkspaceCarrierManifest',
    parsed.ok,
  )
  return 'rejected' in result ? result : Object.freeze({ ok: parsed.ok })
}
