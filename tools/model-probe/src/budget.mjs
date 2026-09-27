import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

const scale = 10n ** 18n
export function usdUnits(value) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value))
    throw new Error('USD must be a nonnegative decimal string')
  const [whole, fraction = ''] = value.split('.')
  // Reservations round up, including rates more precise than our accounting unit.
  return (
    BigInt(whole) * scale +
    BigInt(fraction.slice(0, 18).padEnd(18, '0')) +
    (/[^0]/.test(fraction.slice(18)) ? 1n : 0n)
  )
}
export function usdString(units) {
  return `${units / scale}.${(units % scale).toString().padStart(18, '0')}`
}
export function estimateReservation(pricing, inputBytes, outputTokens) {
  if (
    !Number.isSafeInteger(inputBytes) ||
    inputBytes < 0 ||
    !Number.isSafeInteger(outputTokens) ||
    outputTokens < 1
  )
    throw new Error('Invalid token bounds')
  const rates = [pricing, ...(pricing.overrides ?? [])]
  // A byte is a conservative input-token bound for these controlled ASCII fixtures.
  const input = rates
    .flatMap(p =>
      [p.prompt, p.input_cache_write, p.input_cache_write_1h].filter(v => v !== undefined),
    )
    .map(usdUnits)
  const output = rates.map(p => usdUnits(p.completion))
  if (!input.length || !output.length) throw new Error('Missing pricing: cannot reserve')
  const max = values => values.reduce((a, b) => (a > b ? a : b))
  const requestFee = max(rates.map(p => usdUnits(p.request ?? '0')))
  return usdString(
    BigInt(inputBytes) * max(input) + BigInt(outputTokens) * max(output) + requestFee,
  )
}

// One lock covers the complete run; a killed process leaves a visible lock and reservation.
// Never automatically recover a stale lock: the external effect may already have occurred.
export async function openLedger(
  path,
  { limitUsd, researchLimitUsd },
  { reconciliation = false } = {},
) {
  const limit = usdUnits(limitUsd)
  const researchLimit = usdUnits(researchLimitUsd)
  if (researchLimit > limit || limit > usdUnits('100'))
    throw new Error('Budget exceeds approved scope')
  await mkdir(dirname(path), { recursive: true })
  const lock = await open(`${path}.lock`, 'wx', 0o600)
  let state
  try {
    try {
      state = JSON.parse(await readFile(path, 'utf8'))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      state = { format: 1, limitUsd, researchLimitUsd, entries: [] }
    }
    if (
      state.format !== 1 ||
      state.limitUsd !== limitUsd ||
      state.researchLimitUsd !== researchLimitUsd ||
      !Array.isArray(state.entries)
    )
      throw new Error('Ledger/config mismatch')
    if (!reconciliation && state.entries.some(e => e.state !== 'settled'))
      throw new Error('Unsettled request: reconcile before sending')
  } catch (error) {
    await lock.close()
    await rm(`${path}.lock`)
    throw error
  }
  async function persist() {
    const temp = `${path}.${randomUUID()}.tmp`
    await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
    const file = await open(temp, 'r')
    try {
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temp, path)
    const directory = await open(dirname(path), 'r')
    try {
      await directory.sync()
    } finally {
      await directory.close()
    }
  }
  return {
    async reserve({ model, provider, stage, estimateUsd }) {
      if (!['research', 'acceptance'].includes(stage)) throw new Error('Invalid verification stage')
      if (state.entries.some(e => e.state !== 'settled')) throw new Error('Unsettled request: stop')
      const spent = state.entries.reduce((sum, e) => sum + usdUnits(e.actualUsd), 0n)
      const researchSpent = state.entries
        .filter(e => e.stage === 'research')
        .reduce((sum, e) => sum + usdUnits(e.actualUsd), 0n)
      const reserve = usdUnits(estimateUsd)
      if (
        spent + reserve > limit ||
        (stage === 'research' && researchSpent + reserve > researchLimit)
      )
        throw new Error('Budget reservation refused')
      const id = randomUUID()
      state.entries.push({ id, model, provider, stage, estimateUsd, state: 'reserved' })
      await persist()
      return id
    },
    async settle(id, actualUsd) {
      const entry = state.entries.find(e => e.id === id)
      if (!entry || entry.state !== 'reserved') throw new Error('Invalid settlement')
      if (actualUsd === undefined) {
        entry.state = 'unknown'
        await persist()
        throw new Error('Actual cost unknown: stop paid verification')
      }
      const actual = usdUnits(actualUsd)
      entry.actualUsd = usdString(actual)
      entry.state = 'settled'
      await persist()
      if (actual > usdUnits(entry.estimateUsd))
        throw new Error('Reservation underestimated: stop paid verification')
    },
    snapshot: () => structuredClone(state),
    async reconcile(id, actualUsd, source) {
      if (
        !reconciliation ||
        typeof source?.evidence !== 'string' ||
        typeof source?.sha256 !== 'string' ||
        !source.evidence ||
        !/^[a-f0-9]{64}$/.test(source.sha256)
      )
        throw new Error('Explicit upstream reconciliation evidence required')
      const entry = state.entries.find(e => e.id === id)
      if (!entry || entry.state === 'settled') throw new Error('Invalid reconciliation')
      entry.actualUsd = usdString(usdUnits(actualUsd))
      entry.state = 'settled'
      entry.costSource = source
      await persist()
      if (usdUnits(actualUsd) > usdUnits(entry.estimateUsd))
        throw new Error('Reconciled cost exceeds reservation')
    },
    async close() {
      await lock.close()
      await rm(`${path}.lock`)
    },
  }
}
