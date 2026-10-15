import { definePlugin, type StandardSchema } from '@omne-harness/kernel-basis/cordis'
import { imageBudget, open, type BudgetInput, type ImageBudget, type OpenResult } from './index.ts'

export interface ImageService {
  readonly budget: ImageBudget
  open(bytes: Uint8Array): Promise<OpenResult>
}

export const imageBudgetConfig: StandardSchema<BudgetInput> = {
  '~standard': {
    version: 1,
    vendor: 'omne-harness-image',
    validate(value: unknown) {
      if (typeof value !== 'object' || value === null) return { issues: [{ message: 'config' }] }
      const record = value as Record<string, unknown>
      const candidate = {
        formats: record.formats,
        maxWidth: record.maxWidth,
        maxHeight: record.maxHeight,
        maxDecodedBytes: record.maxDecodedBytes,
        maxConcurrentDecodes: record.maxConcurrentDecodes,
        maxInFlightBytes: record.maxInFlightBytes,
      }
      if (!Array.isArray(candidate.formats) || !candidate.formats.every(item => typeof item === 'string')) {
        return { issues: [{ message: 'formats' }] }
      }
      const numbers = [
        candidate.maxWidth,
        candidate.maxHeight,
        candidate.maxDecodedBytes,
        candidate.maxConcurrentDecodes,
        candidate.maxInFlightBytes,
      ]
      if (numbers.some(item => typeof item !== 'number')) return { issues: [{ message: 'config' }] }
      const created = imageBudget(candidate as BudgetInput)
      if (created.kind === 'rejected') return { issues: [{ message: created.reason }] }
      return { value: candidate as BudgetInput }
    },
  },
}

export const imagePlugin = definePlugin({
  name: 'image',
  Config: imageBudgetConfig,
  apply(ctx, config) {
    const created = imageBudget(config)
    if (created.kind === 'rejected') throw new Error(created.reason)
    const budget = created.budget
    const service: ImageService = {
      budget,
      open(bytes) {
        return open({ bytes, budget })
      },
    }
    ctx.provide('image', service)
  },
})
