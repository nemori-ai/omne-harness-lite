import { describe, expect, it } from 'vitest'
import {
  evaluateToolAvailability,
  presentTool,
  type AvailabilityFacts,
} from '@omne-harness/tool-contract'
import { adoption, commandsDefinition, functionDefinition } from './tool-values.ts'

function facts(): AvailabilityFacts {
  return {
    definition: { ...functionDefinition(), requiredCapabilities: ['file-system', 'network'] },
    executor: adoption('executor'),
    qualification: 'allowed',
    dependencies: [
      { name: 'file-system', available: true },
      { name: 'network', available: true },
    ],
    inputCompatible: true,
    outputCompatible: true,
    attachmentsReadable: true,
  }
}

describe('tool presentation', () => {
  it('presents a command tool as one line per command and reads programmable as boolean true only', () => {
    expect(presentTool({ ...commandsDefinition(), programmable: true })).toEqual({
      name: 'files',
      description: 'Reads one file.',
      programmable: true,
      commands: [
        { name: 'read', summary: 'Read a file.' },
        { name: 'shell', summary: 'Run a command.' },
      ],
    })
    expect(presentTool(functionDefinition())).toEqual({
      name: 'read_file',
      description: 'Reads one file.',
      programmable: false,
      commands: [],
    })
    expect(presentTool({ ...functionDefinition(), programmable: false }).programmable).toBe(false)
  })
})

describe('tool availability', () => {
  it('is available when every verified fact holds', () => {
    const input = facts()
    expect(evaluateToolAvailability(input)).toEqual({
      kind: 'available',
      definition: input.definition,
      executor: input.executor,
    })
  })

  it('names every unmet condition, so a caller does not hit the same gap again', () => {
    const input: AvailabilityFacts = {
      ...facts(),
      qualification: 'denied',
      dependencies: [{ name: 'file-system', available: false }],
      outputCompatible: false,
    }
    expect(evaluateToolAvailability(input)).toEqual({
      kind: 'known-unavailable',
      definition: input.definition,
      reason:
        'qualification-denied; dependency-unavailable:file-system; dependency-unavailable:network; output-incompatible',
    })
  })

  it('needs a fact for each required capability, and ignores an optional one that is down', () => {
    const optionalDown: AvailabilityFacts = {
      ...facts(),
      dependencies: [...facts().dependencies, { name: 'telemetry', available: false }],
    }
    expect(evaluateToolAvailability(optionalDown).kind).toBe('available')
    const unreadable: AvailabilityFacts = {
      ...facts(),
      attachmentsReadable: false,
      inputCompatible: false,
    }
    expect(evaluateToolAvailability(unreadable)).toMatchObject({
      kind: 'known-unavailable',
      reason: 'input-incompatible; attachments-unreadable',
    })
  })
})
