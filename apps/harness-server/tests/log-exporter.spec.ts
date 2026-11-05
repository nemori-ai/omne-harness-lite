// The release log exporter (R2-D253): under `serve`, a row's `warn` reaches stdout as a `log` record;
// `debug` does not. Cordis exports up to INFO when no exporter sets a level, so without the release
// exporter the warn below is lost. The unit cases pin the level, the formatting and the guard.
import { Context, type Plugin } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { stubPlugin } from '../src/cordis.ts'
import {
  RELEASE_LOG_LEVEL,
  UNFORMATTABLE,
  exportReleaseLogs,
  releaseLogExporter,
  type LogRecord,
} from '../src/log-exporter.ts'
import { defineRow } from '../src/row.ts'
import { serveOnce } from './fixtures/serve/harness.ts'

/** A row that logs one message of each level while its body runs. */
function loggingRow(): Plugin.Object {
  const plugin: Plugin.Object = {
    name: 'logging-probe',
    apply(ctx: Context) {
      const logger = ctx.logger('logging-probe')
      logger.error('probe error %s', 'e1')
      logger.info('probe info')
      logger.warn('probe warn %d', 7)
      logger.debug('probe debug')
    },
  }
  return defineRow({
    row: 'server-entry',
    implementation: 'real',
    manifest: { provides: [], injects: [], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin,
  })
}

describe('the release log exporter under serve', () => {
  it('a row warn reaches stdout as a log record; debug does not', async () => {
    const run = await serveOnce({
      distribution: { rows: [{ id: 'server-entry', plugin: 'loggingRow', config: {} }] },
      plugins: { stubPlugin, loggingRow: loggingRow() },
      entryObjects: [],
    })
    expect(run.result.exitCode).toBe(0)
    const probe = run.of('log').filter(record => record['name'] === 'logging-probe')
    expect(probe).toEqual([
      { kind: 'log', level: 'error', name: 'logging-probe', text: 'probe error e1' },
      { kind: 'log', level: 'info', name: 'logging-probe', text: 'probe info' },
      { kind: 'log', level: 'warn', name: 'logging-probe', text: 'probe warn 7' },
    ])
  })
})

describe('releaseLogExporter', () => {
  it('exports up to WARN and no further', () => {
    expect(RELEASE_LOG_LEVEL).toBe(2)
    const records: LogRecord[] = []
    const root = new Context()
    exportReleaseLogs(root, record => records.push(record))
    const logger = root.logger('unit')
    logger.warn('w')
    logger.debug('d')
    expect(records.map(record => record.level)).toEqual(['warn'])
  })

  it('an exporter without a level, as Cordis has by default, drops the warn (the gap this closes)', () => {
    const records: string[] = []
    const root = new Context()
    root.logger.exporter({ export: message => records.push(message.type) })
    root.logger('unit').warn('w')
    expect(records).toEqual([])
  })

  it('does not throw into the caller when formatting or writing fails', () => {
    const records: LogRecord[] = []
    const exporter = releaseLogExporter(record => records.push(record))
    const circular: Record<string, unknown> = {}
    circular['self'] = circular
    const message = { sn: 1, ts: 0, name: 'unit', type: 'warn' as const, level: 2 }
    expect(() => exporter.export({ ...message, args: ['%o', circular] })).not.toThrow()
    expect(records).toEqual([{ kind: 'log', level: 'warn', name: 'unit', text: UNFORMATTABLE }])
    const throwing = releaseLogExporter(() => {
      throw new Error('stdout closed')
    })
    expect(() => throwing.export({ ...message, args: ['w'] })).not.toThrow()
  })
})
