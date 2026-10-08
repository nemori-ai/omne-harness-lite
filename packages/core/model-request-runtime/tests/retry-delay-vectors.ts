import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import type { RetryDelayInput } from '../src/index.ts'

/** Expected constants are hand-calculated S60 vectors, not calls into implementation helpers. */
export const retryDelayVectors = [
  {
    name: 'constant none',
    input: {
      policy: { kind: 'constant', base: 'PT10S', factor: 2, max: 'PT100S', jitter: 'none' },
      n: 3,
      uniformSample: 0.25,
    },
    expected: 'PT10S',
  },
  {
    name: 'constant full',
    input: {
      policy: { kind: 'constant', base: 'PT10S', factor: 2, max: 'PT100S', jitter: 'full' },
      n: 3,
      uniformSample: 0.25,
    },
    expected: 'PT2.5S',
  },
  {
    name: 'constant half',
    input: {
      policy: { kind: 'constant', base: 'PT10S', factor: 2, max: 'PT100S', jitter: 'half' },
      n: 3,
      uniformSample: 0.25,
    },
    expected: 'PT6.25S',
  },
  {
    name: 'constant decorrelated',
    input: {
      policy: { kind: 'constant', base: 'PT10S', factor: 2, max: 'PT100S', jitter: 'decorrelated' },
      n: 3,
      uniformSample: 0.25,
      previousDelay: 'PT20S',
    },
    expected: 'PT17.5S',
  },
  {
    name: 'linear none',
    input: {
      policy: { kind: 'linear', base: 'PT10S', factor: 2, max: 'PT100S', jitter: 'none' },
      n: 3,
      uniformSample: 0.25,
    },
    expected: 'PT30S',
  },
  {
    name: 'linear full',
    input: {
      policy: { kind: 'linear', base: 'PT10S', factor: 2, max: 'PT100S', jitter: 'full' },
      n: 3,
      uniformSample: 0.25,
    },
    expected: 'PT7.5S',
  },
  {
    name: 'linear half',
    input: {
      policy: { kind: 'linear', base: 'PT10S', factor: 2, max: 'PT100S', jitter: 'half' },
      n: 3,
      uniformSample: 0.25,
    },
    expected: 'PT18.75S',
  },
  {
    name: 'linear decorrelated',
    input: {
      policy: { kind: 'linear', base: 'PT10S', factor: 2, max: 'PT100S', jitter: 'decorrelated' },
      n: 3,
      uniformSample: 0.25,
      previousDelay: 'PT20S',
    },
    expected: 'PT17.5S',
  },
  {
    name: 'exponential none',
    input: {
      policy: { kind: 'exponential', base: 'PT10S', factor: 2, max: 'PT100S', jitter: 'none' },
      n: 3,
      uniformSample: 0.25,
    },
    expected: 'PT40S',
  },
  {
    name: 'exponential full',
    input: {
      policy: { kind: 'exponential', base: 'PT10S', factor: 2, max: 'PT100S', jitter: 'full' },
      n: 3,
      uniformSample: 0.25,
    },
    expected: 'PT10S',
  },
  {
    name: 'exponential half',
    input: {
      policy: { kind: 'exponential', base: 'PT10S', factor: 2, max: 'PT100S', jitter: 'half' },
      n: 3,
      uniformSample: 0.25,
    },
    expected: 'PT25S',
  },
  {
    name: 'exponential decorrelated independent of B',
    input: {
      policy: {
        kind: 'exponential',
        base: 'PT10S',
        factor: 2,
        max: 'PT100S',
        jitter: 'decorrelated',
      },
      n: 3,
      uniformSample: 0.25,
      previousDelay: 'PT20S',
    },
    expected: 'PT17.5S',
  },
  {
    name: 'full lower endpoint',
    input: {
      policy: { kind: 'exponential', base: 'PT10S', factor: 2, max: 'PT100S', jitter: 'full' },
      n: 3,
      uniformSample: 0,
    },
    expected: 'PT0S',
  },
  {
    name: 'half lower endpoint',
    input: {
      policy: { kind: 'exponential', base: 'PT10S', factor: 2, max: 'PT100S', jitter: 'half' },
      n: 3,
      uniformSample: 0,
    },
    expected: 'PT20S',
  },
  {
    name: 'full near upper endpoint',
    input: {
      policy: { kind: 'exponential', base: 'PT10S', factor: 2, max: 'PT100S', jitter: 'full' },
      n: 3,
      uniformSample: 0.999,
    },
    expected: 'PT39.96S',
  },
  {
    name: 'half near upper endpoint',
    input: {
      policy: { kind: 'exponential', base: 'PT10S', factor: 2, max: 'PT100S', jitter: 'half' },
      n: 3,
      uniformSample: 0.999,
    },
    expected: 'PT39.98S',
  },
  {
    name: 'zero none',
    input: {
      policy: { kind: 'linear', base: 'PT0S', factor: 2, max: 'PT100S', jitter: 'none' },
      n: 1,
      uniformSample: 0.7,
    },
    expected: 'PT0S',
  },
  {
    name: 'zero full',
    input: {
      policy: { kind: 'constant', base: 'PT0S', factor: 2, max: 'PT100S', jitter: 'full' },
      n: 1,
      uniformSample: 0.7,
    },
    expected: 'PT0S',
  },
  {
    name: 'zero half',
    input: {
      policy: { kind: 'exponential', base: 'PT0S', factor: 2, max: 'PT100S', jitter: 'half' },
      n: 1,
      uniformSample: 0.7,
    },
    expected: 'PT0S',
  },
  {
    name: 'cap before jitter',
    input: {
      policy: { kind: 'exponential', base: 'PT10S', factor: 2, max: 'PT25S', jitter: 'none' },
      n: 3,
      uniformSample: 0,
    },
    expected: 'PT25S',
  },
  {
    name: 'decorrelated first lower endpoint',
    input: {
      policy: {
        kind: 'exponential',
        base: 'PT10S',
        factor: 2,
        max: 'PT100S',
        jitter: 'decorrelated',
      },
      n: 1,
      uniformSample: 0,
      previousDelay: 'PT10S',
    },
    expected: 'PT10S',
  },
  {
    name: 'decorrelated first near upper endpoint',
    input: {
      policy: {
        kind: 'exponential',
        base: 'PT10S',
        factor: 2,
        max: 'PT100S',
        jitter: 'decorrelated',
      },
      n: 1,
      uniformSample: 0.999,
      previousDelay: 'PT10S',
    },
    expected: 'PT19.99S',
  },
  {
    name: 'decorrelated capped lower endpoint',
    input: {
      policy: {
        kind: 'exponential',
        base: 'PT10S',
        factor: 2,
        max: 'PT25S',
        jitter: 'decorrelated',
      },
      n: 2,
      uniformSample: 0,
      previousDelay: 'PT20S',
    },
    expected: 'PT10S',
  },
  {
    name: 'decorrelated caps hi not sampled value',
    input: {
      policy: {
        kind: 'exponential',
        base: 'PT10S',
        factor: 2,
        max: 'PT25S',
        jitter: 'decorrelated',
      },
      n: 2,
      uniformSample: 0.999,
      previousDelay: 'PT20S',
    },
    expected: 'PT24.985S',
  },
  {
    name: 'decorrelated zero max',
    input: {
      policy: {
        kind: 'exponential',
        base: 'PT10S',
        factor: 2,
        max: 'PT0S',
        jitter: 'decorrelated',
      },
      n: 1,
      uniformSample: 0.7,
      previousDelay: 'PT10S',
    },
    expected: 'PT0S',
  },
  {
    name: 'decorrelated hi floor',
    input: {
      policy: { kind: 'constant', base: 'PT10S', factor: 2, max: 'PT100S', jitter: 'decorrelated' },
      n: 2,
      uniformSample: 0.999,
      previousDelay: 'PT0S',
    },
    expected: 'PT10S',
  },
  {
    name: 'base exceeds max accepted',
    input: {
      policy: { kind: 'linear', base: 'PT100S', factor: 2, max: 'PT10S', jitter: 'half' },
      n: 3,
      uniformSample: 0.5,
    },
    expected: 'PT7.5S',
  },
  {
    name: 'decorrelated base exceeds max accepted',
    input: {
      policy: { kind: 'linear', base: 'PT100S', factor: 2, max: 'PT10S', jitter: 'decorrelated' },
      n: 1,
      uniformSample: 0.5,
      previousDelay: 'PT1M40S',
    },
    expected: 'PT10S',
  },
  {
    name: 'HMS sum',
    input: {
      policy: {
        kind: 'constant',
        base: 'PT1H02M3.400S',
        factor: 1,
        max: 'PT4000S',
        jitter: 'none',
      },
      n: 1,
      uniformSample: 0,
    },
    expected: 'PT3723.4S',
  },
  {
    name: 'decorrelated first value equality',
    input: {
      policy: { kind: 'constant', base: 'PT1M', factor: 1.5, max: 'PT2M', jitter: 'decorrelated' },
      n: 1,
      uniformSample: 0.25,
      previousDelay: 'PT00H00M060.000S',
    },
    expected: 'PT67.5S',
  },
  {
    name: 'fractional exponential',
    input: {
      policy: {
        kind: 'exponential',
        base: 'PT0.8S',
        factor: new LosslessNumber('1.125'),
        max: 'PT10S',
        jitter: 'none',
      },
      n: 5,
      uniformSample: 0.2,
    },
    expected: 'PT1.2814453125S',
  },
  {
    name: 'fractional exponential half',
    input: {
      policy: {
        kind: 'exponential',
        base: 'PT0.8S',
        factor: new LosslessNumber('1.125'),
        max: 'PT10S',
        jitter: 'half',
      },
      n: 5,
      uniformSample: 0.2,
    },
    expected: 'PT0.7688671875S',
  },
  {
    name: 'long precise full',
    input: {
      policy: {
        kind: 'constant',
        base: 'PT0.123456789012345678901234567890S',
        factor: 1,
        max: 'PT1S',
        jitter: 'full',
      },
      n: 1,
      uniformSample: new LosslessNumber('0.987654321098765432109876543210'),
    },
    expected: 'PT0.1219326311370217952261850327336229233322374638011112635269S',
  },
  {
    name: 'long precise half',
    input: {
      policy: {
        kind: 'constant',
        base: 'PT0.123456789012345678901234567890S',
        factor: 1,
        max: 'PT1S',
        jitter: 'half',
      },
      n: 1,
      uniformSample: new LosslessNumber('0.987654321098765432109876543210'),
    },
    expected: 'PT0.12269471007468373706370980031181146166611873190055563176345S',
  },
  {
    name: 'above safe integer linear',
    input: {
      policy: {
        kind: 'linear',
        base: 'PT0.000000000000000001S',
        factor: 1,
        max: 'PT1S',
        jitter: 'none',
      },
      n: new LosslessNumber('9007199254740993'),
      uniformSample: 0,
    },
    expected: 'PT0.009007199254740993S',
  },
  {
    name: 'huge count capped without expansion',
    input: {
      policy: { kind: 'exponential', base: 'PT1S', factor: 2, max: 'PT10S', jitter: 'none' },
      n: new LosslessNumber('1e1000000000000000000000000'),
      uniformSample: 0,
    },
    expected: 'PT10S',
  },
  {
    name: 'huge count factor one',
    input: {
      policy: { kind: 'exponential', base: 'PT1.5S', factor: 1, max: 'PT10S', jitter: 'none' },
      n: new LosslessNumber('1e1000000000000000000000000'),
      uniformSample: 0,
    },
    expected: 'PT1.5S',
  },
  {
    name: 'huge factor and count zero base',
    input: {
      policy: {
        kind: 'exponential',
        base: 'PT0S',
        factor: new LosslessNumber('1e1000000000000000000000000'),
        max: 'PT10S',
        jitter: 'half',
      },
      n: new LosslessNumber('1e1000000000000000000000000'),
      uniformSample: 0.5,
    },
    expected: 'PT0S',
  },
  {
    name: 'huge factor caps directly',
    input: {
      policy: {
        kind: 'exponential',
        base: 'PT0.0001S',
        factor: new LosslessNumber('1e1000000000000000000000000'),
        max: 'PT10S',
        jitter: 'none',
      },
      n: 2,
      uniformSample: 0.5,
    },
    expected: 'PT10S',
  },
  {
    name: 'huge seconds retained',
    input: {
      policy: {
        kind: 'constant',
        base: `PT${'9'.repeat(4000)}S`,
        factor: 1,
        max: `PT1${'0'.repeat(4000)}S`,
        jitter: 'none',
      },
      n: 1,
      uniformSample: 0,
    },
    expected: `PT${'9'.repeat(4000)}S`,
  },
  {
    name: 'tiny sample retains exponent precision',
    input: {
      policy: { kind: 'constant', base: 'PT1S', factor: 1, max: 'PT1S', jitter: 'full' },
      n: 1,
      uniformSample: new LosslessNumber('1e-1000'),
    },
    expected: `PT0.${'0'.repeat(999)}1S`,
  },
  {
    name: 'exact sample below one',
    input: {
      policy: { kind: 'constant', base: 'PT1S', factor: 1, max: 'PT1S', jitter: 'full' },
      n: 1,
      uniformSample: new LosslessNumber('0.999999999999999999999999999999'),
    },
    expected: 'PT0.999999999999999999999999999999S',
  },
  {
    name: 'equivalent exponent integer n',
    input: {
      policy: { kind: 'linear', base: 'PT0.1S', factor: 1, max: 'PT1S', jitter: 'none' },
      n: new LosslessNumber('30e-1'),
      uniformSample: new LosslessNumber('-0e999999'),
    },
    expected: 'PT0.3S',
  },
] satisfies readonly {
  readonly name: string
  readonly input: RetryDelayInput
  readonly expected: string
}[]
