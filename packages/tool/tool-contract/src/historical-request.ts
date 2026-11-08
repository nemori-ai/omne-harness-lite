import type {
  FixedToolRequest,
  ToolDefinition,
  ToolAvailability,
  ToolProgramDeclaration,
} from './definitions.ts'

export type HistoricalReturns = Readonly<{
  kind: 'ordinary' | 'structured'
  program: ToolProgramDeclaration
}>
export type HistoricalDefinition<T extends ToolDefinition = ToolDefinition> = T extends {
  kind: 'function'
}
  ? Omit<T, 'returns'> & Readonly<{ returns: HistoricalReturns }>
  : T extends { kind: 'commands' }
    ? Omit<T, 'commands'> &
        Readonly<{
          commands: readonly (Omit<T['commands'][number], 'returns'> &
            Readonly<{ returns: HistoricalReturns }>)[]
        }>
    : never
export type HistoricalAvailability<T extends ToolAvailability = ToolAvailability> =
  T extends ToolAvailability
    ? Omit<T, 'definition'> & Readonly<{ definition: HistoricalDefinition }>
    : never
export type HistoricalFixedToolRequest = Omit<FixedToolRequest, 'availability'> &
  Readonly<{ availability: HistoricalAvailability }>
