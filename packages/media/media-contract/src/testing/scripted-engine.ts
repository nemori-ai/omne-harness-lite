import type { ConverterEngine, EngineDeclaration, EngineInput, EngineOutput } from '../engine.ts'

const DECLARATION: EngineDeclaration = {
  name: 'fixture.scripted',
  revision: '1',
  accepts: ['audio/*', 'application/pdf'],
  maxBytes: 1_048_576,
  egress: { kind: 'in-process' },
  concurrency: 2,
  parameters: { type: 'object' },
}

export type ScriptedEngine = Readonly<{ engine: ConverterEngine; calls: EngineInput[] }>

/** An engine whose every answer the test decides; it records what it was asked. */
export function createScriptedEngine(
  answer: (input: EngineInput) => Promise<EngineOutput>,
  declaration: Partial<EngineDeclaration> = {},
): ScriptedEngine {
  const calls: EngineInput[] = []
  const engine: ConverterEngine = {
    declaration: { ...DECLARATION, ...declaration },
    convert(input) {
      calls.push(input)
      return answer(input)
    },
  }
  return { engine, calls }
}
