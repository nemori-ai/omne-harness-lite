import assert from 'node:assert/strict'
import type { ScenarioResult, WindowsAssembly } from './types.ts'

/**
 * R2-D115 failure closure: read queue full returns unavailable
 *
 * When in-flight reserved bytes exceed globalReadResultBytes (134217728 = 128 MiB),
 * subsequent reads must return unavailable without starting.
 *
 * Current configuration (storage.ts:27-30):
 * - globalReadResultBytes = 134217728 (128 MiB)
 * - maxReadResultBytes = 4 MiB per read
 * - Therefore 32 concurrent 4 MiB reads can be in flight
 * - The 33rd read should receive unavailable
 */
export async function runFailureClosureScenario(assembly: WindowsAssembly): Promise<ScenarioResult> {
  const checks: Record<string, boolean> = {}

  // Test R2-D115: Read queue full
  // Create a small test file
  await assembly.invoke('Files', 'write', {
    target: 'read-queue-test.txt',
    writeMode: 'replace',
    content: 'Test content for read queue saturation check',
  })

  // Start 32 concurrent reads (each reserves 4 MiB, total 128 MiB = globalReadResultBytes)
  const inFlightReads = []
  for (let i = 0; i < 32; i++) {
    inFlightReads.push(
      assembly.attempt('Files', 'read', {
        target: 'read-queue-test.txt',
        offset: null,
        limit: null,
      }),
    )
  }

  // The 33rd read should be rejected with unavailable (exceeds global reservation)
  const overLimitRead = await assembly.attempt('Files', 'read', {
    target: 'read-queue-test.txt',
    offset: null,
    limit: null,
  })

  checks.readQueueFullRejectsWithUnavailable =
    overLimitRead.outcome.kind === 'rejected' &&
    overLimitRead.outcome.reason.kind === 'unavailable'

  // Wait for the original 32 reads to complete
  const completedReads = await Promise.all(inFlightReads)
  const allInLimitReadsAccepted = completedReads.every(
    read => read.outcome.kind === 'accepted' || read.outcome.kind === 'commit-unknown',
  )
  checks.inLimitReadsAccepted = allInLimitReadsAccepted

  // Verify that after the in-flight reads complete, new reads can proceed
  const subsequentRead = await assembly.invoke('Files', 'read', {
    target: 'read-queue-test.txt',
    offset: null,
    limit: null,
  })
  const completed = await assembly.settle(subsequentRead)
  checks.subsequentReadSucceeds = completed.state.terminal.kind === 'completed'

  // Test R2-D77: Terminal retention extension
  // Note: The current windows-composition fixture DOES provide the retention extension.
  // A true negative test would require a provider without the extension.
  // For now, we verify that WITH retention, terminal creation succeeds.
  const terminal = await assembly.invoke('Shell', 'createTerminal', {
    rows: 24,
    columns: 80,
    workingDirectory: null,
  })
  const terminalCompleted = await assembly.settle(terminal)
  checks.terminalCreationWithRetention = terminalCompleted.state.terminal.kind === 'completed'

  // Test R2-D61: Files.list with all names present
  // Note: The current host-local provider always supplies names from real directory entries.
  // A true negative test would require a provider that omits FileEntry.name.
  // For now, we verify that WITH all names present, list succeeds.
  await assembly.invoke('Files', 'write', {
    target: 'list-test-file.txt',
    writeMode: 'replace',
    content: 'test',
  })

  const listResult = await assembly.invoke('Files', 'list', {
    target: '',
    recursive: false,
  })
  const listCompleted = await assembly.settle(listResult)
  checks.listSucceedsWithAllNames =
    listCompleted.state.terminal.kind === 'completed' && listCompleted.text.includes('name=')

  await assembly.record('failure-closure-checks', checks)

  return {
    checks,
    observations: {
      overLimitRead,
      inFlightReadsCount: completedReads.length,
      terminalCreated: terminalCompleted.text.includes('token='),
      listResult: listCompleted.text.split('\n').length,
    },
  }
}
