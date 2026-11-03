import { resolve, relative, sep } from 'node:path'

// R2-D149 第 3 项：调用者在清单里声明的平台互斥用例，在不属于它的平台上跳过时不算缺测。
// 未声明的跳过、在声明平台上跳过、以及没有匹配到任何用例的声明，仍是未完整运行。
function declarationFor(exclusive, file, test) {
  return exclusive.find(item => item.file === file && item.test === test)
}

export function summarize(raw, memberRoot, requested, processResult, scope = {}) {
  const { platform = process.platform, exclusive = [] } = scope
  const matched = new Set()
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
    const row = { file: name, pass: 0, fail: 0, skip: 0, skipped: [], platformExcluded: [] }
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
      const testName = assertion.fullName ?? assertion.title ?? '(unnamed)'
      const declared = declarationFor(exclusive, name, testName)
      if (declared) matched.add(declared)
      if (assertion.status === 'passed') row.pass++
      else if (assertion.status === 'failed') {
        row.fail++
        failed = true
      } else {
        row.skip++
        if (declared && !declared.runsOn.includes(platform)) {
          row.platformExcluded.push({
            test: testName,
            status: assertion.status ?? 'unknown',
            runsOn: declared.runsOn,
            reason: declared.reason,
          })
          continue
        }
        const reason = [
          assertion.skipReason,
          assertion.pendingReason,
          assertion.meta?.skipReason,
        ].find(value => typeof value === 'string' && value.trim().length > 0)
        row.skipped.push({
          test: testName,
          status: assertion.status ?? 'unknown',
          reason: reason ?? 'unknown: Vitest JSON did not expose a skip reason',
        })
        issues.push(
          declared
            ? `Required test did not run on its declared platform ${platform}: ${name}: ${testName}`
            : `Required test did not run: ${name}: ${testName}`,
        )
      }
    }
  }
  for (const item of exclusive)
    if (!matched.has(item))
      issues.push(
        `Platform-exclusive declaration matched no reported test: ${item.file}: ${item.test}`,
      )
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
