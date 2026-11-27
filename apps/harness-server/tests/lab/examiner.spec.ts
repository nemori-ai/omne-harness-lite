import { describe, expect, it } from 'vitest'
import type { ExaminationSettings } from '@omne-harness/goal-local'
import { underModel } from '../../src/lab/examiner.ts'

const SET: ExaminationSettings = {
  examiner: { definition: 'examiner', model: 'openai/gpt-6.1-sol' },
  maxExaminations: 3,
  minutes: 10,
  job: 'rerun',
}

describe('the model the lab runs examinations under', () => {
  it('replaces the model of what the tenant set and nothing else', async () => {
    const read = underModel(async () => SET, 'anthropic/claude-haiku-5.5')
    expect(await read('t1')).toEqual({
      ...SET,
      examiner: { definition: 'examiner', model: 'anthropic/claude-haiku-5.5' },
    })
  })

  it('a setting that cannot be read stays unread: no model is made up for it', async () => {
    expect(await underModel(async () => null, 'anthropic/claude-haiku-5.5')('t1')).toBeNull()
  })
})
