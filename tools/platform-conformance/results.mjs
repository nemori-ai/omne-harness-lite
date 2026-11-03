import { resolve, relative, sep } from 'node:path'

export function summarize(raw, memberRoot, requested, processResult) {
  const issues = []
  const files = []
  if (!raw || !Array.isArray(raw.testResults) || raw.testResults.length === 0)
    issues.push('Missing or empty Vitest testResults')
  const byName = new Map()
  for (const file of raw?.testResults ?? []) {
    if (typeof file.name !== 'string') {
      issues.push('Report file has no name')
      continue
    }
    const name = relative(memberRoot, resolve(memberRoot, file.name)).split(sep).join('/')
    if (byName.has(name)) issues.push(`Duplicate report file: ${name}`)
    byName.set(name, file)
  }
  let failed =
    !processResult.interrupted &&
    !processResult.spawnError &&
    processResult.code !== null &&
    processResult.code !== 0
  if (raw?.success === false || raw?.numFailedTests > 0 || raw?.numFailedTestSuites > 0)
    failed = true
  for (const name of requested) {
    const reported = byName.get(name)
    const row = { file: name, pass: 0, fail: 0, skip: 0, skipped: [] }
    files.push(row)
    if (!reported) {
      issues.push(`Requested file missing from report: ${name}`)
      continue
    }
    if (reported.status === 'failed') failed = true
    const assertions = reported.assertionResults
    if (!Array.isArray(assertions) || assertions.length === 0) {
      issues.push(`No assertions reported: ${name}`)
      continue
    }
    for (const assertion of assertions) {
      if (assertion.status === 'passed') row.pass++
      else if (assertion.status === 'failed') {
        row.fail++
        failed = true
      } else {
        row.skip++
        const reason = [
          assertion.skipReason,
          assertion.pendingReason,
          assertion.meta?.skipReason,
        ].find(value => typeof value === 'string' && value.trim().length > 0)
        row.skipped.push({
          test: assertion.fullName ?? assertion.title ?? '(unnamed)',
          status: assertion.status ?? 'unknown',
          reason: reason ?? 'unknown: Vitest JSON did not expose a skip reason',
        })
        issues.push(
          `Required test did not run: ${name}: ${assertion.fullName ?? assertion.title ?? '(unnamed)'}`,
        )
      }
    }
  }
  if (processResult.interrupted || processResult.spawnError || processResult.code === null)
    issues.push(
      `Runner did not finish: ${processResult.interrupted ?? processResult.spawnError ?? 'no exit code'}`,
    )
  return { files, issues, failed }
}

export function conclusion(failed, incomplete) {
  return failed
    ? { conclusion: 'failed', exitCode: 1 }
    : incomplete
      ? { conclusion: 'incomplete', exitCode: 3 }
      : { conclusion: 'passed', exitCode: 0 }
}
