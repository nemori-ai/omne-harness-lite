import type { Context } from '@deepseek-ai/cordis'
import { dynamisKey, type DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { GUEST_FORMS_POINT, type GuestForm } from '@omne-harness/plugin-host-local'
import { createToolMessageResultCodec } from '@omne-harness/tool'
import { TOOL_ENTRY_SOURCES_POINT } from '@omne-harness/tool-contract/provider'
import {
  toolEntrySourcesKey,
  toolEntrySourcesPlugin,
} from '@omne-harness/tool-cordis-contract/cordis'
import { guestEntrySource } from '@omne-harness/tool-host-local'
import { defineRow } from '../../row.ts'

// The contract of the kept result is one at any limit; the tool host's codec holds the cap.
const SHAPE = Object.freeze({ resultContract: createToolMessageResultCodec(1).adoption })

/** How the code of a plugin becomes a source of tools: the form fixes the gate, the capability and that no program calls them. */
const toolsGuestForm: GuestForm = (made, context) => guestEntrySource(made, context, SHAPE)

export const TOOLS_GIVES =
  '{ tools }: each tool is { summary: one sentence, params: the JSON Schema of an object, effect: read or write, run(input, { ports }) }. run gets the parsed arguments and the ports of the call, never who calls; what it returns is the result, as JSON. The key is a prefix of lower case letters ending with __; each tool is named prefix + its name. Calling one asks the person first unless they allowed it, as any tool of a plugin.'

export const TOOLS_EXAMPLE = [
  '{"point":"tool.entry-sources","key":"weather__","module":"tools.js","export":"tools"}',
  'tools.js:',
  'export function tools() {',
  '  return {',
  '    tools: {',
  '      forecast: {',
  '        summary: "Tells the weather of a city.",',
  '        params: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },',
  '        effect: "read",',
  '        run: async input => ({ city: input.city, sky: "sunny" }),',
  '      },',
  '    },',
  '  }',
  '}',
].join('\n')

export const toolEntrySourcesRow = defineRow({
  row: 'tool-entry-sources',
  implementation: 'real',
  manifest: {
    provides: [toolEntrySourcesKey],
    injects: [dynamisKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'tool-entry-sources',
    inject: [dynamisKey],
    apply(ctx: Context) {
      ctx.plugin(toolEntrySourcesPlugin)
      ;(ctx.get(dynamisKey) as DynamisService).put([
        {
          point: GUEST_FORMS_POINT,
          key: TOOL_ENTRY_SOURCES_POINT,
          id: '',
          scope: [],
          rank: 0,
          digest: `${TOOL_ENTRY_SOURCES_POINT}@tool-entry-sources`,
          item: { form: toolsGuestForm, gives: TOOLS_GIVES, example: TOOLS_EXAMPLE },
        },
      ])
    },
  },
})
