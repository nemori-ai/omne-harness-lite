import type { Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness/kernel-basis/cordis'

definePlugin({
  name: 'legal',
  Config: {
    '~standard': {
      version: 1 as const,
      vendor: 'example',
      validate: (_value: unknown) => ({ value: 1 }),
    },
  },
  apply(_ctx: Context, config: number) {
    void config
  },
})

definePlugin({
  name: 'mismatch',
  Config: {
    '~standard': {
      version: 1 as const,
      vendor: 'example',
      // @ts-expect-error A numeric schema cannot pair with an apply that takes string.
      validate: (_value: unknown) => ({ value: 1 }),
    },
  },
  apply(_ctx: Context, _config: string) {
    void _config
  },
})

definePlugin({
  name: 'extra',
  Config: {
    '~standard': {
      version: 1 as const,
      vendor: 'example',
      validate: (_value: unknown) => ({ value: 1 }),
    },
  },
  apply(_ctx: Context, config: number) {
    void config
  },
  // @ts-expect-error provide is not a field of the plugin object.
  provide: 'clock',
})
