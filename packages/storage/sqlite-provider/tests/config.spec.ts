// Configuration rules of SQL contract SPEC 12.1. Each rule has one case that goes red when the rule
// is dropped. A violation rejects construction with config_invalid and names the field.
import { describe, expect, it } from 'vitest'
import { validateConfig, type SqliteStorageConfig } from '../src/config.ts'
import { defaultConfig } from './support.ts'

const ROOT = process.platform === 'win32' ? 'C:\\data\\storage' : '/data/storage'
const base = (): Record<string, unknown> => ({ ...defaultConfig(ROOT) })

function problemsOf(input: unknown): readonly { field: string; rule: string }[] {
  const judged = validateConfig(input)
  if (judged.kind !== 'invalid') return []
  return judged.problems
}

function fieldsOf(input: unknown): string[] {
  return problemsOf(input).map(problem => problem.field)
}

describe('config validation', () => {
  it('accepts the candidate defaults', () => {
    const judged = validateConfig(base())
    expect(judged.kind).toBe('valid')
  })

  it('rejects a value that is not an object', () => {
    for (const value of [null, undefined, 3, 'x', []]) {
      expect(validateConfig(value).kind).toBe('invalid')
    }
  })

  it('rejects a missing field and names it', () => {
    for (const field of Object.keys(base())) {
      const config = base()
      delete config[field]
      expect(fieldsOf(config), `missing ${field}`).toContain(field)
    }
  })

  it('rejects a relative storageRoot', () => {
    expect(fieldsOf({ ...base(), storageRoot: 'relative/path' })).toEqual(['storageRoot'])
    expect(fieldsOf({ ...base(), storageRoot: '' })).toEqual(['storageRoot'])
    expect(fieldsOf({ ...base(), storageRoot: 7 })).toEqual(['storageRoot'])
  })

  it('rejects a numeric field that is not a finite positive integer', () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '5', null]) {
      expect(fieldsOf({ ...base(), lockWaitMs: bad }), `lockWaitMs=${String(bad)}`).toEqual([
        'lockWaitMs',
      ])
    }
  })

  it('lets only groupCollectMs be 0', () => {
    expect(validateConfig({ ...base(), groupCollectMs: 0 }).kind).toBe('valid')
    expect(fieldsOf({ ...base(), groupCollectMs: -1 })).toEqual(['groupCollectMs'])
    for (const field of Object.keys(base()).filter(name => name !== 'storageRoot')) {
      if (field === 'groupCollectMs') continue
      expect(fieldsOf({ ...base(), [field]: 0 }), `${field}=0`).toContain(field)
    }
  })

  const relations: readonly [string, Partial<SqliteStorageConfig>, string][] = [
    ['rule 1: command bytes above request bytes', { maxCommandBytes: 5_000_000 }, 'maxCommandBytes'],
    ['rule 1: request bytes above group input bytes', { groupMaxInputBytes: 1_000_000 }, 'maxRequestBytes'],
    ['rule 1: request bytes above global in flight bytes', { globalInFlightWriteBytes: 1_000_000 }, 'maxRequestBytes'],
    ['rule 2: diagnostic above response bytes', { maxDiagnosticBytes: 70_000 }, 'maxDiagnosticBytes'],
    ['rule 2: response above operation response', { maxResponseBytes: 2_000_000 }, 'maxResponseBytes'],
    ['rule 2: operation response above group reservation', { groupMaxResponseReservationBytes: 100_000 }, 'maxOperationResponseBytes'],
    ['rule 2: group reservation above global response', { globalWriteResponseBytes: 1_000_000 }, 'groupMaxResponseReservationBytes'],
    ['rule 3: group operations above admission queue', { groupMaxOperations: 100 }, 'groupMaxOperations'],
    ['rule 3: admission queue above global limit', { globalAdmissionLimit: 32 }, 'admissionQueueLimit'],
    ['rule 4: read queue per domain above global', { readQueueGlobal: 8 }, 'readQueuePerDomain'],
    ['rule 4: query queue per domain above global', { queryQueueGlobal: 8 }, 'queryQueuePerDomain'],
    ['rule 4: control queue per domain above global', { controlQueueGlobal: 4 }, 'controlQueuePerDomain'],
    ['rule 5: reserved writer slots not below max workers', { reservedWriterSlots: 16 }, 'reservedWriterSlots'],
    ['rule 5: read workers per domain above the read share', { maxReadWorkersPerDomain: 13 }, 'maxReadWorkersPerDomain'],
    ['rule 6: read result above global read result', { globalReadResultBytes: 1_000_000 }, 'maxReadResultBytes'],
    ['rule 7: journal size limit above read pause', { journalSizeLimitBytes: 80_000_000 }, 'journalSizeLimitBytes'],
    ['rule 7: checkpoint bytes above read pause', { checkpointWalBytes: 70_000_000 }, 'checkpointWalBytes'],
    ['rule 7: read pause not below write stop', { walReadPauseBytes: 134_217_728 }, 'walReadPauseBytes'],
  ]
  for (const [title, change, field] of relations) {
    it(title, () => {
      expect(fieldsOf({ ...base(), ...change })).toContain(field)
    })
  }

  it('reports every problem and attaches a rule text to each', () => {
    const problems = problemsOf({ ...base(), lockWaitMs: 0, storageRoot: 'x' })
    expect(problems.map(problem => problem.field).sort()).toEqual(['lockWaitMs', 'storageRoot'])
    expect(problems.every(problem => problem.rule.length > 0)).toBe(true)
  })
})
