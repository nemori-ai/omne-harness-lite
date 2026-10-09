import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { readOpsRequest, maintenanceResultBody } from '../src/ops/maintenance-wire.ts'
import { responseBytes } from '../src/ops/wire.ts'
import { entryValidator } from '../src/routing/schema.ts'
import type { MaintenanceResult } from '../src/maintenance/results.ts'

const health = '{"opsVersion":"1","operation":"full-health","payload":{}}'
it.each(['full-health', 'backup-status', 'backup'])('reads only HT3 operation %s', operation => {
  const payload = operation === 'backup' ? { onlyIfDue: true } : {}
  expect(
    readOpsRequest(Buffer.from(JSON.stringify({ opsVersion: '1', operation, payload }))),
  ).toEqual({ kind: 'request', request: { operation, payload } })
})

it.each([
  '',
  '{}',
  'null',
  '[]',
  `${health} {}`,
  `\ufeff${health}`,
  health.replace('"1"', '1'),
  health.replace('"1"', '"2"'),
  health.replace('opsVersion', 'protocolVersion'),
  health.replace('{', '{"extra":null,'),
  health.replace('{', '{"opsVersion":"1",'),
  health.replace('{', '{"\\u006fperation":"backup",'),
  '{"opsVersion":"1","operation":"backup","payload":{}}',
  '{"opsVersion":"1","operation":"backup","payload":{"onlyIfDue":1}}',
  '{"opsVersion":"1","operation":"backup","payload":{"onlyIfDue":true,"onlyIfDue":false}}',
  '{"opsVersion":"1","operation":"backup","payload":{"onlyIfDue":true,"sourceLocation":"/tmp/x"}}',
  '{"opsVersion":"1","operation":"verify","payload":{}}',
  health.replace('"payload":{}', '"payload":{"account":"secret"}'),
])(
  'rejects malformed ops representation without interpreting it as employee protocol: %s',
  body => {
    expect(readOpsRequest(Buffer.from(body))).toEqual({ kind: 'invalid-input' })
  },
)

it('keeps JSON limits above representation failure in the decision order', () => {
  expect(readOpsRequest(Buffer.from(`{"extra":${'['.repeat(65)}0${']'.repeat(65)}}`))).toEqual({
    kind: 'exceeds-limit',
  })
  expect(
    readOpsRequest(Buffer.from(`{"a":1,"a":2,"extra":${'['.repeat(65)}0${']'.repeat(65)}}`)),
  ).toEqual({ kind: 'exceeds-limit' })
  expect(readOpsRequest(Buffer.from([0xff]))).toEqual({ kind: 'invalid-input' })
})

const normative = readFileSync(
  join(import.meta.dirname, 'fixtures/maintenance-wire-examples.md'),
  'utf8',
)
const maintenanceSection = normative.slice(normative.indexOf('## 8.'))
const replies = [...maintenanceSection.matchAll(/```text\n([0-9a-f\n]+)\n```/g)]
  .map(match => Buffer.from(match[1]!.replaceAll('\n', ''), 'hex'))
  .filter(bytes => bytes.toString('ascii', 0, 8) === 'HTTP/1.1')

it('matches every frozen maintenance response byte example, including metadata time formatting', () => {
  let checked = 0
  let retired = 0
  for (const bytes of replies) {
    const offset = bytes.indexOf('\r\n\r\n') + 4
    const value: unknown = JSON.parse(bytes.subarray(offset).toString('utf8'))
    if (!entryValidator('BackupResult')(value) && !entryValidator('BackupStatusResult')(value)) {
      expect(JSON.stringify(value)).toContain('omne-center-backup/1')
      retired += 1
      continue
    }
    // This cast is preceded by the accepted result schemas, not a fixture-specific substitute.
    expect(responseBytes(maintenanceResultBody(value as MaintenanceResult))).toEqual(bytes)
    checked += 1
  }
  expect(retired).toBeGreaterThan(0)
  expect(checked + retired).toBeGreaterThanOrEqual(10)
})

it('serializes current maintenance examples with the durable checkpoint intact', () => {
  const example = JSON.parse(
    readFileSync(join(import.meta.dirname, '../verification/maintenance-v2.json'), 'utf8'),
  )
  expect(entryValidator('BackupResult')(example)).toBe(true)
  const bytes = responseBytes(maintenanceResultBody(example))
  expect(JSON.parse(bytes.subarray(bytes.indexOf('\r\n\r\n') + 4).toString('utf8'))).toEqual(
    example,
  )
  expect(bytes.toString()).toContain(
    '"clockCheckpoint":{"writtenAt":1790373601000,"upperBound":1790373611000}',
  )
})
