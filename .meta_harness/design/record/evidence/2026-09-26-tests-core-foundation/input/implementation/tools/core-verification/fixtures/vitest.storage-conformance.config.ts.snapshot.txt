import { defineConfig } from 'vitest/config'

const reportFile = process.env.OMNE_CONFORMANCE_REPORT
if (reportFile === undefined) throw new Error('conformance fixture requires a report path')

export default defineConfig({
  test: {
    include: ['fixtures/storage-conformance.spec.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    reporters: ['default', 'json'],
    outputFile: {
      json: reportFile,
    },
  },
})
