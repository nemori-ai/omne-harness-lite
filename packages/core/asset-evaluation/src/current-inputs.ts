import type { NonConnectorEvaluationInput } from './types.ts'

export type CurrentInputResult =
  | { readonly input: NonConnectorEvaluationInput }
  | { readonly failure: 'invalidInput' | 'unavailable' }
export interface CurrentEvaluationInputs {
  read(session: unknown, tenant: unknown): Promise<CurrentInputResult>
}
