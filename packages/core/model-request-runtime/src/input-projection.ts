

import { type JsonObject, type JsonValue } from '@omne-harness-lite/content-blocks'
import type { RequestInputEvidence } from '@omne-harness-lite/model-response'










export interface InputProjection {
  readonly units: readonly JsonValue[]
  readonly envelope: JsonObject
  readonly requestInput: Extract<RequestInputEvidence, { kind: 'known' }>
}
