import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { afterEach } from 'vitest'
import { instantSchema } from '@omne-harness/calendar-contract'
import {
  createCalendarSourceAdapters,
  type CalendarSourceAdapterOptions,
} from '../../src/sources/index.ts'

export const acquiredAt = instantSchema.parse('2026-11-03T00:00:00.000Z')
export const knowledgeAsOf = instantSchema.parse('2026-10-01T00:00:00.000Z')
export const usWindow = {
  start: '2025-01-01',
  end: '2030-12-31',
  knowledgeAsOf,
  authorityRef:
    'https://www.govinfo.gov/content/pkg/USCODE-2023-title5/html/USCODE-2023-title5-partIII-subpartE-chap61-subchapI-sec6103.htm',
  federalRegisterScanFloor: '2024-01-01',
}
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const dispose of cleanup.splice(0)) await dispose()
})
export async function server(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
) {
  const instance = createServer(handler)
  await new Promise<void>(resolve => instance.listen(0, '127.0.0.1', resolve))
  const address = instance.address()
  if (!address || typeof address === 'string') throw new Error('Missing listener address')
  cleanup.push(
    () =>
      new Promise<void>((resolve, reject) => {
        instance.closeAllConnections()
        instance.close(error => (error ? reject(error) : resolve()))
      }),
  )
  return `http://127.0.0.1:${address.port}`
}
export function source(sourceId: string, options: CalendarSourceAdapterOptions = {}) {
  const adapter = createCalendarSourceAdapters(options).find(item => item.sourceId === sourceId)
  if (!adapter) throw new Error(`Missing source ${sourceId}`)
  return adapter
}
export function sendJson(
  response: ServerResponse,
  value: unknown,
  modified = 'Thu, 01 Oct 2026 00:00:00 GMT',
) {
  response.writeHead(200, { 'content-type': 'application/json', 'last-modified': modified })
  response.end(JSON.stringify(value))
}
export function yearDocument(year: number, name = 'New Year') {
  return {
    year,
    region: 'CN',
    dates: [{ date: `${year}-01-01`, name, name_cn: name, name_en: name, type: 'public_holiday' }],
  }
}
