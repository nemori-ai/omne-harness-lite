import type {
  ModelRuntimeHostInputs,
  ModelRuntimeOperations,
} from '@omne-harness-lite/model-request-runtime'

/** One original input binding. This borrow does not own the physical model pool. */
export interface SessionDriverModelBorrow {
  readonly operations: ModelRuntimeOperations
  /** Return only after all users of this borrow have actually stopped. Failure retains it. */
  readonly release: () => Promise<void>
}

/** Root-selected assembly adapter, not a model projection service or an execution authority. */
export interface SessionDriverModelFactory {
  readonly acquire: (
    inputs: ModelRuntimeHostInputs,
  ) => Promise<SessionDriverModelBorrow | { readonly unavailable: true }>
}
