import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { ScenarioResult, WindowsAssembly } from './types.ts'

/**
 * The failure closures of this wave that belong to the whole Windows assembly: a Shell author
 * whose provider lacks the retention extension (R2-D77) and a `Files.list` over entries that omit
 * their name (R2-D61). Both narrow the real provider's lease, so the real registry, Tool entry and
 * author still decide the answer.
 *
 * R2-D115 (a read whose result does not fit the global budget answers `unavailable`) is NOT here:
 * R2-D122/R2-D123 fix it at the storage layer, where a deterministic configuration exhausts the
 * budget. A composition test cannot reach the read queue deterministically.
 */
export async function runFailureClosureScenario(
  assembly: WindowsAssembly,
): Promise<ScenarioResult> {
  const checks: Record<string, boolean> = {}

  // R2-D77: a provider without the `TerminalFacility.retention` extension must refuse session
  // retention with `unavailable` and start nothing. The fixture removes only the extension from the
  // real provider's lease, so the real registry, Tool entry and Shell author still decide.
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

  // The attach path (`execute`/`close_session` on a named terminal) refuses before the facility too.
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

  // Control: the same counters do move once a provider really starts something, so the zero above
  // is evidence and not a counter that never works.
  const control = await assembly.invoke('Shell', 'execute', {
    script: 'Write-Output "counter control"',
  })
  await assembly.settle(control)
  checks.negativeCountersObserveRealStarts =
    assembly.negativeFacilities.counters().commandStarts > afterAttachment.commandStarts

  // R2-D61: a Files.list whose entries omit `name` fails as a whole; it neither drops entries nor
  // invents names. The fixture strips the name the real provider supplied.
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

  // Control: with the real names the same directory lists, so the failure above is the missing
  // name and not an empty or unreadable directory.
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
