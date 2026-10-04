
import type { NonConnectorEvaluationInput } from '@omne-harness-lite/asset-evaluation'






export type CurrentInputResult =
  | { readonly input: NonConnectorEvaluationInput }
  | { readonly failure: 'invalidInput' | 'unavailable' }
export interface CurrentEvaluationInputs {
  read(session: unknown, tenant: unknown): Promise<CurrentInputResult>
}
