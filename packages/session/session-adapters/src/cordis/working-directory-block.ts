import type { NeedBinding, StatefulBlockDescriptor } from '@omne-harness/runtime-context-contract'
import { workingDirectorySchema, type WorkingDirectory } from '../working-directory-schema.ts'

declare module '@omne-harness/runtime-context-contract' {
  interface ContextBlocks {
    'session.working-directory': WorkingDirectory
  }
}

// Committed into the session log at a step boundary; a rebuilt process recovers the last commit.
export const workingDirectoryDescriptor = Object.freeze({
  key: 'session.working-directory',
  schema: workingDirectorySchema,
  consumers: Object.freeze(['model', 'coordinator', 'extension'] as const),
  required: true,
  disclosure: 'eligibility-checked',
  carriesPrevious: true,
  volatility: 'per-step',
  kind: 'stateful',
  writers: Object.freeze(['coordinator'] as const),
  // The one writer commits the whole value; the update replaces it.
  reduce: (_current: unknown, update: unknown) => workingDirectorySchema.parse(update),
  persistence: 'checkpointed',
  singleWriterPerStep: true,
} satisfies StatefulBlockDescriptor<'session.working-directory', WorkingDirectory>)

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
