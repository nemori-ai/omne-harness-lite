import { writeFileSync } from 'node:fs'
import { createCloseProtocol } from '../src/close-protocol.ts'

const reportPath = process.argv[2]
if (reportPath === undefined) throw new Error('report path missing')

const protocol = createCloseProtocol({
  steps: [{ name: 'backend', when: 'always', run() {} }],
  drainTimeoutMs: 60_000,
  clock: { delay: () => new Promise(() => {}) },
})
protocol.admit('work')
process.stdout.write('started\n')
const report = await protocol.close()
writeFileSync(reportPath, JSON.stringify(report))
