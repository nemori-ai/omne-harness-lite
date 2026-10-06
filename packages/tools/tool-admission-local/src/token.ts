import type { ToolCallBlock } from '@omne-harness-lite/content-blocks'
import type { AdmissionToken } from '@omne-harness-lite/tool-admission'
import { admissionArgumentDigest } from '@omne-harness-lite/loop-extension-runner'

/** A provisional locator, never accepted by the formal runner decoder. */
export function tokenForCall(
  call: Extract<ToolCallBlock, { readonly arguments: unknown }>,
): AdmissionToken {
  return `admission.1.${Buffer.from(JSON.stringify([call.callId, admissionArgumentDigest(call.arguments)])).toString('base64url')}` as AdmissionToken
}
