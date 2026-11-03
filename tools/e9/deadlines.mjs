function seconds(environment, name, initial, minimum) {
  const value = environment[name] ?? String(initial)
  const parsed = Number(value)
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < minimum)
    throw new Error(`${name} must be a safe integer >= ${minimum}`)
  return parsed
}

export function wrapperDeadlines(timeoutMs, adapter, environment = process.env) {
  const queueMs =
    (seconds(environment, 'OMNE_TEST_SLOT_MAX_WAIT_SECONDS', 7200, 0) +
      seconds(environment, 'OMNE_TEST_SLOT_POLL_SECONDS', 5, 1)) *
    1000
  const metadataMs = 2 * 30000
  const executionMs = adapter ? timeoutMs + 2000 : 60000 + 3 * 30000
  const cleanupMs = 15000
  const archiveMs = 30000
  const wrapperMs = queueMs + metadataMs + executionMs + cleanupMs + archiveMs
  if (!Number.isSafeInteger(wrapperMs)) throw new Error('wrapper deadline exceeds safe duration')
  return { queueMs, metadataMs, executionMs, cleanupMs, archiveMs, wrapperMs }
}
