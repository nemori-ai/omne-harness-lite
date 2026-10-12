import { expect, test } from 'vitest'
import { hostEnvironment } from '../src/cordis.ts'
import { defaultHostNativePolicy } from '../src/native-policy.ts'

// Validate the actual Cordis Config surface, not a copy of its schema.
test.each(['terminalColumns', 'terminalRows'] as const)(
  '%s accepts both geometry boundaries and rejects out-of-range values',
  field => {
    for (const value of [1, 80, 4096]) {
      expect(() =>
        hostEnvironment.describeAssembly({
          provider: 'host',
          policy: { ...defaultHostNativePolicy, [field]: value },
        }),
      ).not.toThrow()
    }
    for (const value of [0, -1, 1.5, 4097]) {
      expect(() =>
        hostEnvironment.describeAssembly({
          provider: 'host',
          policy: { ...defaultHostNativePolicy, [field]: value },
        }),
      ).toThrow()
    }
  },
)
