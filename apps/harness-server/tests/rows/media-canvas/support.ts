import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Context } from '@deepseek-ai/cordis'
import { expect } from 'vitest'
import type { AdmitInput } from '@omne-harness/canvas-contract'
import { canvasKey, putKind } from '@omne-harness/canvas-cordis-contract/cordis'
import { dynamisKey } from '@omne-harness/dynamis-cordis/cordis'
import { mediaKey } from '@omne-harness/media-cordis-contract/cordis'
import { referenceText } from '@omne-harness/media-protocol'
import { fail } from '@omne-harness/operation-result'
import { mediaObjectKind, type MediaCustody } from '../../../src/rows/media-canvas/index.ts'
import { runOmne } from '../../r9/support.ts'
import { sqliteFiles, type ReleaseTree } from '../../support/release-tree.ts'
import { mediaClientOf, noisePng } from '../media-access/support.ts'
import { uploaded, type Reference } from '../media-intake/support.ts'

export type Held = Readonly<{ owner: string; work: string; position: string; purpose: string }>
export type Uploaded = Readonly<{ ref: Reference; text: string }>

export const MEDIA_ROWS_BUT_CANVAS = [
  'media-storage-sql',
  'media-image',
  'media',
  'media-storage-local',
  'media-sweep',
  'media-intake',
  'media-model-source',
  'media-tool-store',
  'media-converters',
  'media-engine-transcribe',
  'media-engine-pdf',
  'media-access',
]

/** Who holds the medium of the given key, read off every SQLite file of the tree. */
export function holdsOf(storageRoot: string, key: string): Held[] {
  const held: Held[] = []
  for (const file of sqliteFiles(storageRoot)) {
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      const table = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'md_holds'")
        .get()
      if (table === undefined) continue
      const rows = db
        .prepare('SELECT owner, work, position, purpose FROM md_holds WHERE key = ?')
        .all(key)
      held.push(...rows.map(row => ({ ...row }) as Held))
    } finally {
      db.close()
    }
  }
  return held
}

/** A picture of its own bytes, uploaded and prepared as the login of `home`, with its reference text. */
export async function picture(port: number, home: string, size: number): Promise<Uploaded> {
  const { client, tenant } = mediaClientOf(port, home)
  const ref = await uploaded(client, tenant, `canvas-${String(size)}`, noisePng(size, 4))
  expect(await client['prepare-media']({ tenant, ref })).toMatchObject({ outcome: 'succeeded' })
  return { ref, text: referenceText(ref) }
}

export async function stateOf(port: number, home: string, ref: Reference): Promise<string> {
  const { client, tenant } = mediaClientOf(port, home)
  const read = await client['describe-media']({ tenant, ref })
  return read.outcome === 'succeeded' ? read.body.state : read.outcome
}

/** A second account on its own client state, registered and logged in against the same server. */
export async function stranger(tree: ReleaseTree): Promise<string> {
  const base = dirname(tree.home)
  const home = join(base, 'gina')
  for (const command of ['register', 'login'])
    expect(
      (
        await runOmne({
          args: [command, '--login-identifier', 'gina'],
          home,
          server: `http://127.0.0.1:${String(tree.port)}`,
          cwd: base,
          credential: 'gina-pw-media-canvas-5d1a',
        })
      ).status,
    ).toBe(0)
  return home
}

export type HoldAsked = Parameters<MediaCustody['hold']>[0]
export type Fault = 'none' | 'throw' | 'unknown' | 'gate'

/** The kind as the row declares it, over media's real custody with a fault a test sets; it keeps what it is asked. */
export function faultyMediaKind() {
  const seen = {
    fault: 'none' as Fault,
    admits: [] as AdmitInput[],
    holds: [] as HoldAsked[],
    gate: Promise.withResolvers<void>(),
    entered: Promise.withResolvers<void>(),
  }
  const custodyOf = (ctx: Context): MediaCustody | undefined => {
    const real = ctx.get(mediaKey)?.custody
    if (real === undefined) return undefined
    return {
      async hold(asked) {
        seen.holds.push(asked)
        if (seen.fault === 'throw') throw new Error('custody broke')
        if (seen.fault === 'unknown') return fail({ kind: 'outcome-unknown' })
        if (seen.fault === 'gate') {
          seen.entered.resolve()
          await seen.gate.promise
        }
        return real.hold(asked)
      },
    }
  }
  const plugin = {
    name: 'media-canvas-faulty',
    inject: [dynamisKey, canvasKey],
    apply(ctx: Context) {
      const kind = mediaObjectKind(() => custodyOf(ctx))
      putKind(ctx, {
        ...kind,
        admit: async input => {
          seen.admits.push(input)
          return kind.admit!(input)
        },
      })
    },
  }
  return { seen, plugin }
}
