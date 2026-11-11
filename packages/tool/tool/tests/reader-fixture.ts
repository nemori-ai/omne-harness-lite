import {
  createToolResultReader,
  type ToolResultReader,
  type ToolsOptions,
  type ToolsReadRuntime,
} from '@omne-harness/tool'
import type { Access, ToolDefinition } from '@omne-harness/tool-contract'
import {
  deriveDefinition,
  type ToolImplementation,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import { toolsAdoption } from '../src/tools-protocol.ts'
import { createReaderAuthor } from './reader-author.ts'

export type { ToolsOptions } from '@omne-harness/tool'
export type ReaderFixture<P> = ToolResultReader<P> &
  Readonly<{
    implementation: ToolImplementation<Access<P>, ToolMessageContentBlock>
    definition: ToolDefinition
  }>

/** Test-only command transport. This is not the released five-command Tools author. */
export function createReaderFixture<P>(
  runtime: ToolsReadRuntime<P>,
  options: ToolsOptions,
): ReaderFixture<P> {
  const reader = createToolResultReader(runtime, options)
  const implementation = createReaderAuthor<P>(options, (args, access) =>
    reader.read({ ...access, arguments: args }),
  )
  return {
    ...reader,
    implementation,
    definition: deriveDefinition(
      {
        asset: { name: 'Tools', adoption: toolsAdoption },
        requiredCapabilities: [],
        programmable: false,
      },
      implementation.facts,
    ),
  }
}
