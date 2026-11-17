import { judgeLoopExtensions, type LoopExtensionDeclaration } from '@omne-harness/agent-contract'
import {
  readBodyText,
  type JsonValue,
  type PackageLayout,
  type PackageReader,
  type PackageRejection,
} from '@omne-harness/assets'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'

export const DECLARATION_PATH = 'extension.json'
export const MODEL_CALL_NEED = 'model'
export const LOOP_EXTENSION_PACKAGE_LIMITS = Object.freeze({
  files: 64,
  fileBytes: 1024 * 1024,
  totalBytes: 4 * 1024 * 1024,
})

const BODY_LIMITS = {
  maxBytes: 64 * 1024,
  maxDepth: 16,
  maxItems: 256,
  maxMembers: 64,
  maxStringLength: 16 * 1024,
  maxNumberLength: 32,
}

const invalid = (reason: string): Outcome<never, PackageRejection> =>
  fail({ kind: 'invalid-package', reason })

async function declarationText(pkg: PackageReader, digest: string | undefined) {
  if (digest === undefined) return invalid('declaration-missing')
  const opened = await pkg.open(DECLARATION_PATH, digest)
  if ('failure' in opened)
    return fail<PackageRejection>({ kind: 'source-failed', failure: opened.failure })
  return succeed(new TextDecoder().decode(opened.ok))
}

function commandRefusal(
  declaration: LoopExtensionDeclaration,
  paths: ReadonlyMap<string, string>,
): string | null {
  const { implementation } = declaration
  if (implementation.kind !== 'command') return null
  if (!paths.has(implementation.entry) || implementation.entry === DECLARATION_PATH)
    return 'entry-missing'
  return declaration.needs?.some(need => need.name === MODEL_CALL_NEED) === true
    ? 'command-needs-model'
    : null
}

// The body of a version is the declaration as the Agent contract judged it: readers never parse the package again.
async function inspect(pkg: PackageReader): Promise<Outcome<JsonValue, PackageRejection>> {
  const manifest = await pkg.manifest()
  if ('failure' in manifest) return fail({ kind: 'source-failed', failure: manifest.failure })
  const digests = new Map(manifest.ok.entries.map(entry => [entry.path, entry.digest]))
  const text = await declarationText(pkg, digests.get(DECLARATION_PATH))
  if ('failure' in text) return text
  let parsed: unknown
  try {
    parsed = JSON.parse(text.ok)
  } catch {
    return invalid('declaration-not-json')
  }
  const judged = await judgeLoopExtensions([parsed])
  if (judged.kind === 'refused') return invalid(`declaration-refused: ${judged.reason}`)
  const declaration = judged.value[0]
  if (declaration === undefined) return invalid('declaration-missing')
  const refusal = commandRefusal(declaration, digests)
  if (refusal !== null) return invalid(refusal)
  const body = readBodyText(JSON.stringify({ declaration }), BODY_LIMITS)
  return body.kind === 'ok' ? succeed(body.value) : invalid('declaration-too-large')
}

export const loopExtensionLayout: PackageLayout = Object.freeze({
  namespace: 'loop-extensions',
  limits: LOOP_EXTENSION_PACKAGE_LIMITS,
  inspect,
})
