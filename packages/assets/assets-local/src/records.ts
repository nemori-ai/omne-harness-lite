import { z } from 'zod'
import { defineSettings } from '@omne-harness/settings'
import type { DomainRef } from '@omne-harness/sql-contract'
import type { ReadPort } from '@omne-harness/sql-contract/worker'
import {
  assetSchema,
  domainSchema,
  holdingSchema,
  revisionSchema,
  versionSchema,
  type Holding,
  type Version,
} from './schema.ts'
import { canonical, digest, equal, scopeRef, withinBudget } from './encoding.ts'

export const domainRecordSchema = z.strictObject({ domain: domainSchema, revision: revisionSchema })
export function readDomain(port: ReadPort) {
  const row = port.execute('SELECT record FROM al_domain WHERE id = 1 LIMIT 1', []).rows[0]
  return row ? decode(domainRecordSchema, row[0]) : null
}
export function decode<T>(schema: z.ZodType<T>, value: unknown): T {
  if (typeof value !== 'string' || Buffer.byteLength(value) > 1024 * 1024)
    throw new TypeError('Invalid assets record')
  const raw: unknown = JSON.parse(value)
  if (!withinBudget(raw)) throw new TypeError('Assets record exceeds budget')
  return schema.parse(raw)
}
export function belongs(port: ReadPort, domain: DomainRef): boolean {
  const record = readDomain(port)
  return record !== null && equal(record.domain, domain) && scopeRef(domain) !== null
}
export function assetKey(domain: DomainRef, assetRef: string): string {
  return canonical([domain, assetRef])
}
export function readAsset(port: ReadPort, domain: DomainRef, assetRef: string) {
  const row = port.execute('SELECT record FROM al_assets WHERE asset_key = ? LIMIT 1', [
    assetKey(domain, assetRef),
  ]).rows[0]
  if (!row) return null
  const asset = decode(assetSchema, row[0])
  if (!equal(asset.domain, domain) || asset.assetRef !== assetRef)
    throw new TypeError('Misbound asset record')
  return asset
}
export function readVersion(
  port: ReadPort,
  domain: DomainRef,
  assetRef: string,
  version: string,
): Version | null {
  const row = port.execute('SELECT record FROM al_versions WHERE version_key = ? LIMIT 1', [
    canonical([domain, assetRef, version]),
  ]).rows[0]
  if (!row) return null
  const result = decode(versionSchema, row[0])
  if (!equal(result.domain, domain) || result.assetRef !== assetRef || result.version !== version)
    throw new TypeError('Misbound version record')
  validateDeclaration(result)
  return result
}
export function validateDeclaration(version: Pick<Version, 'declaration'>) {
  if (version.declaration.kind === 'none') return
  const { definition, definitionRef } = version.declaration
  if (
    defineSettings(definition).kind !== 'defined' ||
    definitionRef.digest !== digest(definition) ||
    definitionRef.providerId !== definition.providerId ||
    definitionRef.definitionId !== definition.definitionId ||
    definitionRef.version !== definition.version
  )
    throw new TypeError('Invalid asset declaration')
}
export function readHolding(port: ReadPort, domain: DomainRef, holdingRef: string): Holding | null {
  const row = port.execute(
    'SELECT record FROM al_holdings WHERE scope_key = ? AND holding_ref = ? LIMIT 1',
    [canonical(domain), holdingRef],
  ).rows[0]
  if (!row) return null
  const holding = decode(holdingSchema, row[0])
  if (
    !equal(holding.domain, domain) ||
    holding.holdingRef !== holdingRef ||
    holding.scopeRef !== scopeRef(domain)
  )
    throw new TypeError('Misbound holding record')
  return holding
}
export function selectedVersion(port: ReadPort, holding: Holding) {
  const asset = readAsset(port, holding.domain, holding.assetRef)
  if (!asset || asset.category !== holding.category || asset.name !== holding.name) return null
  const version = readVersion(
    port,
    holding.domain,
    holding.assetRef,
    holding.selection.kind === 'pinned' ? holding.selection.version : asset.latestVersion,
  )
  if (!version || version.category !== holding.category || version.name !== holding.name)
    return null
  return {
    version,
    ownerRevision: Math.max(
      holding.ownerRevision,
      holding.selection.kind === 'follow' ? asset.ownerRevision : version.ownerRevision,
    ),
  }
}
