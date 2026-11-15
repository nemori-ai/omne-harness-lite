import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { ScenarioResult, WindowsAssembly } from './types.ts'

export async function runFailureClosureScenario(
  assembly: WindowsAssembly,
): Promise<ScenarioResult> {
  const checks: Record<string, boolean> = {}

  const beforeRetention = assembly.negativeFacilities.counters()
  const beforeRetentionResources = assembly.resources()
  assembly.negativeFacilities.activate({ retention: true })
  const withoutRetention = await assembly.invoke('Shell', 'create_session', {
    columns: 80,
    rows: 24,
  })
  const withoutRetentionCompleted = await assembly.settle(withoutRetention)
  assembly.negativeFacilities.activate(null)
  const afterRetention = assembly.negativeFacilities.counters()
  const retainedTerminalRef = { id: 'missing-extension', generation: 'missing-extension' }

  checks.terminalRetentionAbsentRefusesUnavailable =
    withoutRetentionCompleted.state.terminal.kind === 'completed' &&
    /^rejected reason=unavailable session retention unavailable zero starts$/u.test(
      withoutRetentionCompleted.text,
    )
  checks.terminalRetentionAbsentStartsNoTerminal =
    afterRetention.terminalCreates === beforeRetention.terminalCreates &&
    afterRetention.terminalExecutes === beforeRetention.terminalExecutes &&
    afterRetention.commandStarts === beforeRetention.commandStarts &&
    assembly.resources().length === beforeRetentionResources.length

  assembly.negativeFacilities.activate({ retention: true })
  const withoutAttachment = await assembly.invoke('Shell', 'execute', {
    script: 'Write-Output "must not run"',
    terminal: retainedTerminalRef,
  })
  const withoutAttachmentCompleted = await assembly.settle(withoutAttachment)
  assembly.negativeFacilities.activate(null)
  const afterAttachment = assembly.negativeFacilities.counters()
  checks.terminalAttachAbsentRefusesUnavailable =
    /^rejected reason=unavailable session attachment unavailable zero starts$/u.test(
      withoutAttachmentCompleted.text,
    )
  checks.terminalAttachAbsentStartsNothing =
    afterAttachment.terminalCreates === beforeRetention.terminalCreates &&
    afterAttachment.terminalExecutes === beforeRetention.terminalExecutes &&
    afterAttachment.commandStarts === beforeRetention.commandStarts &&
    assembly.resources().length === beforeRetentionResources.length

  const control = await assembly.invoke('Shell', 'execute', {
    script: 'Write-Output "counter control"',
  })
  await assembly.settle(control)
  checks.negativeCountersObserveRealStarts =
    assembly.negativeFacilities.counters().commandStarts > afterAttachment.commandStarts

  const listRoot = join(assembly.workspace, 'entry-name-fixture')
  await mkdir(listRoot, { recursive: true })
  await assembly.settle(
    await assembly.invoke('Files', 'write', {
      path: join(listRoot, 'list-negative-fixture.txt'),
      text: 'legacy writer without entry names',
      mode: 'create',
    }),
  )
  assembly.negativeFacilities.activate({ entryName: true })
  const namelessList = await assembly.invoke('Files', 'list', { path: listRoot })
  const namelessCompleted = await assembly.settle(namelessList)
  assembly.negativeFacilities.activate(null)
  checks.listFailsWholeOnMissingName =
    namelessCompleted.state.terminal.kind === 'completed' &&
    /^unavailable reason=entry-name-unavailable no entries returned$/u.test(namelessCompleted.text)
  checks.listDoesNotInventOrDropNames =
    !namelessCompleted.text.includes('list-negative-fixture.txt') &&
    !namelessCompleted.text.includes('\tdirectory\t') &&
    !namelessCompleted.text.includes('\tfile\t')

  const namedList = await assembly.invoke('Files', 'list', { path: listRoot })
  const namedCompleted = await assembly.settle(namedList)
  checks.listSucceedsWithAllNames =
    namedCompleted.state.terminal.kind === 'completed' &&
    namedCompleted.text.includes('"list-negative-fixture.txt"')

  await assembly.record('failure-closure-checks', checks)

  return {
    checks,
    observations: {
      retentionWithoutExtension: {
        createSession: withoutRetentionCompleted.text,
        execute: withoutAttachmentCompleted.text,
        counters: { before: beforeRetention, after: afterRetention, attach: afterAttachment },
      },
      namelessList: namelessCompleted.text,
      namedList: namedCompleted.text,
    },
  }
}
