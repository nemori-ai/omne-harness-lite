import { readJsonStrict, type JsonValue } from '@omne-harness-lite/content-blocks'
import type { AssetModelJudge } from './judge.ts'

export function parseWorkspaceManifestText(
  text: string,
  owner: AssetModelJudge,
): { readonly ok: JsonValue } | { readonly rejected: string } {
  const parsed = readJsonStrict(text)
  if ('failed' in parsed) return Object.freeze({ rejected: 'malformed' })
  const result = owner.judgeAssetValue('WorkspaceCarrierManifest', parsed.ok)
  return 'rejected' in result ? result : Object.freeze({ ok: parsed.ok })
}
