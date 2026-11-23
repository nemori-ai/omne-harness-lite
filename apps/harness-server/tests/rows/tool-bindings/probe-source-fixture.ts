import type { Context, Plugin } from '@deepseek-ai/cordis'
import type {
  ToolEntrySource,
  ToolMessageContentBlock,
  ToolSourceCall,
  ToolSourceListing,
} from '@omne-harness/tool-contract/provider'
import {
  createMemoryToolEntrySource,
  testingSourceEntry,
} from '@omne-harness/tool-contract/testing'
import {
  toolEntrySourcesKey,
  type ToolEntrySourcesService,
} from '@omne-harness/tool-cordis-contract/cordis'
import { PROBE } from '../governance/gated-fixture.ts'

type Block = ToolMessageContentBlock

export const PROBE_PREFIX = 'probe__'
export const probeEntry = (name: string) =>
  testingSourceEntry({ name: `${PROBE_PREFIX}${name}`, category: PROBE, commands: ['run', 'stop'] })

/** A source that lists the same entries to every asker and answers a call with what it was asked. */
export function probeSource(
  listing: ToolSourceListing,
): ToolEntrySource<unknown, Block> & Readonly<{ calls: readonly ToolSourceCall<unknown>[] }> {
  return createMemoryToolEntrySource<unknown, Block>({
    prefix: PROBE_PREFIX,
    listing: () => listing,
    execute: call =>
      Promise.resolve({
        content: [
          {
            kind: 'text',
            id: 'probe.result',
            visibility: { toHuman: true, toModel: true },
            text: `${call.name} ${String(call.command)} ${JSON.stringify(call.arguments)}`,
          } as Block,
        ],
        data: { kind: 'none' },
        original: { kind: 'none' },
        attachments: [],
      }),
  })
}

/** The plugin that puts a source on the point; a test loads it on the running tree. */
export function bringing(source: ToolEntrySource<unknown, Block>): Plugin.Object {
  return {
    name: 'probe-source',
    inject: [toolEntrySourcesKey],
    apply(ctx: Context) {
      ;(ctx.get(toolEntrySourcesKey) as ToolEntrySourcesService<unknown, Block>).contribute(source)
    },
  }
}
