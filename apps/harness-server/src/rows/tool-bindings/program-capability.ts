import type { Context } from '@deepseek-ai/cordis'
import {
  toolBindingsKey,
  toolCatalogKey,
  toolProgramAdmissionKey,
} from '@omne-harness/tool-cordis-contract/cordis'
import { createLocalProgramCalls, type LocalProgramCalls } from '@omne-harness/tool-host-local'
import type { LocalToolBindingsService } from '@omne-harness/tool-host-local/cordis'
import { sourcedEntriesOf } from '../../entry/tool-entry-sources.ts'
import {
  createProgramFunctions,
  createProgramTargetRequests,
  type ProgramRequestPorts,
} from '../../entry/tool-program-requests.ts'
import { releaseOf } from '../../entry/tool-release.ts'
import { currentHeldTool } from '../tool-host/held-current.ts'
import { toolOperatorSettingsKey } from '../tool-host/operator-settings.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { releaseCatalogViewOf } from './catalog-view.ts'

/** How long a position waits before it asks again an admission that could not answer. */
const ADMISSION_RETRY_MS = 250

type Bindings = LocalToolBindingsService<unknown, unknown, never>

/** Every lookup is lazy: the bindings row is installed before the runtime and the admission exist. */
export function createReleaseProgramCalls(ctx: Context): LocalProgramCalls<unknown> {
  const bundle = () => toolRuntimeHolder(ctx).bundle?.value
  const ports: ProgramRequestPorts = {
    release: () => releaseOf(ctx),
    catalog: () => ctx.get(toolCatalogKey, false),
    view: () => releaseCatalogViewOf(ctx),
    held: (access, name) => currentHeldTool(ctx, access, name),
    sourced: () => sourcedEntriesOf(ctx),
    operatorSettings: tool => ctx.get(toolOperatorSettingsKey)?.read(tool),
  }
  return createLocalProgramCalls<unknown>({
    source: () => bundle()?.programSources(),
    runtime: () => bundle()?.programs(),
    children: () => bundle()?.children(),
    admission: () => ctx.get(toolProgramAdmissionKey, false),
    functions: createProgramFunctions(ports),
    prepareTarget: createProgramTargetRequests(ports),
    checkArguments: (access, request) =>
      (ctx.get(toolBindingsKey, false) as Bindings | undefined)?.programArguments(
        access,
        request,
      ) ?? Promise.resolve({ kind: 'unavailable' }),
    retryMs: ADMISSION_RETRY_MS,
  })
}
