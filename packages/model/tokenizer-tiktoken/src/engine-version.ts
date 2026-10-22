import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'

const ENGINE = 'js-tiktoken'

/** How many directories above the resolved entry file the engine manifest may lie. */
const MAX_MANIFEST_DEPTH = 4

function manifestVersion(text: string): string | undefined {
  const manifest: unknown = JSON.parse(text)
  if (typeof manifest !== 'object' || manifest === null) return undefined
  const name: unknown = Reflect.get(manifest, 'name')
  const version: unknown = Reflect.get(manifest, 'version')
  return name === ENGINE && typeof version === 'string' ? version : undefined
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && Reflect.get(error, 'code') === 'ENOENT'
}

/** The text of `package.json` in the directory, or `undefined` when the directory has none. */
function readManifest(directory: string): string | undefined {
  try {
    return readFileSync(join(directory, 'package.json'), 'utf8')
  } catch (error) {
    if (isMissingFile(error)) return undefined
    throw error
  }
}

/** Walks up from the resolved `js-tiktoken/lite` file to the manifest of the engine package. */
function readInstalledVersion(): Outcome<string, string> {
  let directory = dirname(createRequire(import.meta.url).resolve(`${ENGINE}/lite`))
  for (let depth = 0; depth <= MAX_MANIFEST_DEPTH; depth += 1) {
    const text = readManifest(directory)
    const version = text === undefined ? undefined : manifestVersion(text)
    if (version !== undefined) return succeed(version)
    directory = dirname(directory)
  }
  return fail(`the manifest of the installed ${ENGINE} package was not found`)
}

let installed: Outcome<string, string> | undefined

/**
 * The version of the `js-tiktoken` package that this module actually loads. The manifest is read
 * once per process, on the first tokenizer initialization. A count never reads it.
 */
export function installedEngineVersion(): Outcome<string, string> {
  installed ??= readInstalledVersion()
  return installed
}
