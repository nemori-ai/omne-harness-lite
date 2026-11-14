import { describe, expect, it } from 'vitest'
import { modelRecordsConfig } from '../../../src/rows/model-records/config.ts'
import { modelRowsOperatorConfig } from '../../r9/support.ts'

const validate = (value: unknown) => modelRecordsConfig['~standard'].validate(value)

describe('the model-records row configuration', () => {
  it('accepts the operator layer of the tests, with its observation bounds', () => {
    const { records } = modelRowsOperatorConfig({ storageRoot: '/nowhere' })
    expect(validate(records)).toHaveProperty('value')
  })

  it('refuses a configuration without observation bounds (defect: the public Model stream is silently left out)', () => {
    const { observation: _bounds, ...records } = modelRowsOperatorConfig({
      storageRoot: '/nowhere',
    }).records
    expect(validate(records)).toEqual({
      issues: [{ message: 'observation: required, the public Model stream is always opened' }],
    })
  })
})
