import { lstat, mkdir, open, realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { openLedger } from './budget.mjs'

/** Production verification never creates a replacement ledger or accepts an alternative path. */
export async function openProductionLedger(path, approvedPath, budget) {
  const expected = await realpath(approvedPath)
  const actual = await realpath(path)
  if (actual !== expected) throw new Error('Production ledger path differs from approved ledger')
  const stat = await lstat(expected)
  if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600)
    throw new Error('Production ledger must be an owner-only regular file')
  return openLedger(expected, budget)
}
export async function privateOutputDirectory(path) {
  const destination = resolve(path)
  try {
    await mkdir(destination, { mode: 0o700 })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
  const stat = await lstat(destination)
  if (!stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700)
    throw new Error('Output must be an owner-only real directory')
  return destination
}
export async function writePrivateEvidence(path, source) {
  const file = await open(path, 'wx', 0o600)
  try {
    await file.writeFile(source)
    await file.sync()
  } finally {
    await file.close()
  }
}
/** A reservation must be durable before the sole effect. No automatic refund after cancellation. */
export async function paidInvocation(ledger, reservation, invoke) {
  const id = await ledger.reserve(reservation)
  let receipt
  try {
    receipt = await invoke(id)
  } catch {
    await ledger.settle(id, undefined)
    throw new Error('Unreachable: unknown-cost settlement must stop')
  }
  await ledger.settle(id, receipt?.actualUsd)
  return { id, receipt }
}
