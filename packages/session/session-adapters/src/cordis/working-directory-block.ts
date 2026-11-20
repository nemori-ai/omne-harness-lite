import type { NeedBinding, SuppliedBlockDescriptor } from '@omne-harness/runtime-context-contract'
import { workingDirectorySchema, type WorkingDirectory } from '../working-directory-schema.ts'

declare module '@omne-harness/runtime-context-contract' {
  interface ContextBlocks {
    'session.working-directory': WorkingDirectory
  }
}

export const workingDirectoryProducer = Object.freeze({
  producer: '@omne-harness/session-adapters/session.working-directory',
})

// It changes only in the action before a step, and a rebuilt process has no value until then.
export const workingDirectoryDescriptor = Object.freeze({
  key: 'session.working-directory',
  schema: workingDirectorySchema,
  consumers: Object.freeze(['model', 'coordinator', 'extension'] as const),
  required: true,
  disclosure: 'eligibility-checked',
  carriesPrevious: true,
  volatility: 'per-step',
  kind: 'supplied',
  recovery: 'recompute',
} satisfies SuppliedBlockDescriptor<'session.working-directory', WorkingDirectory>)

export const workingDirectoryModelBinding = Object.freeze({
  key: 'session.working-directory',
  need: Object.freeze({
    name: 'session.working-directory-for-model',
    shape: workingDirectorySchema,
    consumer: 'model',
    purpose: 'The model is told the directory its file and command tools use in this step',
    necessity: 'required',
  }),
} satisfies NeedBinding<'session.working-directory', WorkingDirectory>)

export const workingDirectoryCallBinding = Object.freeze({
  key: 'session.working-directory',
  need: Object.freeze({
    name: 'session.working-directory-for-calls',
    shape: workingDirectorySchema,
    consumer: 'coordinator',
    purpose: 'A tool call is accepted with the working directory of the step that made it',
    necessity: 'required',
  }),
} satisfies NeedBinding<'session.working-directory', WorkingDirectory>)

export const workingDirectoryBindings = Object.freeze([
  workingDirectoryModelBinding,
  workingDirectoryCallBinding,
])
