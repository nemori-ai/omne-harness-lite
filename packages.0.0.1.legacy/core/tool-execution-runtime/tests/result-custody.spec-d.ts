import { expectTypeOf } from 'vitest'
import type { StorageUnit } from '@omne-harness-lite/storage'
import type {
  ToolResultCustodySource,
  ToolResultCustodyEvidence,
  ToolTerminalRecord,
  ToolOriginalIssueIdentity,
} from '../src/index.ts'

expectTypeOf<Parameters<ToolResultCustodySource['verifyIn']>>().toEqualTypeOf<
  [StorageUnit, ToolOriginalIssueIdentity, ToolTerminalRecord]
>()
declare const onlyDigest: { readonly original: ToolOriginalIssueIdentity; readonly digest: string }
// @ts-expect-error A digest cannot replace the original terminal and immutable result references.
const incomplete: ToolResultCustodyEvidence = onlyDigest
declare const source: ToolResultCustodySource
// @ts-expect-error A result source must not mint an original execution claim.
source.claim
void incomplete
