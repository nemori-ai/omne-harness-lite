import { expect, it } from 'vitest'
import * as scrypt from '@omne-harness/scrypt'

it('publishes the bounded scrypt entry points', () => {
  expect(Object.keys(scrypt).sort()).toEqual(
    ['SCRYPT_PROFILE', 'SCRYPT_SCHEME', 'hashScrypt', 'memoryBytes', 'openScrypt', 'planAdmission'].sort(),
  )
})
