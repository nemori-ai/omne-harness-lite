import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { z } from 'zod'
import type { MigrationPort } from '@omne-harness/sql-contract/worker'
import { requestDdl } from '../src/relational-ddl.ts'
import { RequestRecordSchema } from '../src/request-schema.ts'
import { insertRequest } from '../src/request-store.ts'
import { readRequest } from '../src/request-record.ts'
import { readAudience } from '../src/read-audience.ts'
import pool from '../src/pool-read.ts'

it.each(['unanswered', 'pending', 'accepted', 'superseded', 'invalidated'])(
  'roundtrips %s cards and their pool projection with arbitrary public identifier cells',
  state => {
    const db = new DatabaseSync(':memory:')
    const rows = z.array(
      z.array(z.union([z.string(), z.bigint(), z.null(), z.instanceof(Uint8Array)])),
    )
    const port: MigrationPort = {
      execute(sql, params) {
        const stmt = db.prepare(sql)
        stmt.setReadBigInts(true)
        stmt.setReturnArrays(true)
        const columns = stmt.columns().map(column => column.name)
        const bindings = params.map(value => (typeof value === 'boolean' ? Number(value) : value))
        if (columns.length)
          return {
            columns,
            rows: rows.parse(stmt.all(...bindings)),
            changes: 0n,
            lastInsertRowid: null,
          }
        const changed = stmt.run(...bindings)
        return {
          columns,
          rows: [],
          changes: BigInt(changed.changes),
          lastInsertRowid: BigInt(changed.lastInsertRowid),
        }
      },
    }
    try {
      for (const ddl of requestDdl) db.exec(ddl)
      const tenantRef = 'tenant\0scope',
        actor = 'actor\0reader'
      db.prepare('INSERT INTO hi_request_versions_v2(tenant_ref,revision) VALUES (?,?)').run(
        JSON.stringify(tenantRef),
        '7',
      )
      const wait = {
        owner: 'owner\0',
        waitId: '\0wait',
        incarnation: 'incar\0nation',
        destination: 'inbox\0',
      }
      for (const requestId of [
        '\0leading',
        'middle\0a',
        'middle\0b',
        'trailing\0',
        '"\\',
        '\ufeffBOM',
      ]) {
        const ref = { tenantRef, requestId },
          cardRef = { request: ref, cardId: 'card\0id' }
        const record = RequestRecordSchema.parse({
          ref,
          revision: '1',
          origin: {
            kind: 'independent',
            originRef: 'origin\0',
            wait,
            positionRef: 'position\0',
            adoptionRef: 'adoption\0',
          },
          displayContext: '\0'.repeat(8192),
          cards: [
            {
              ref: cardRef,
              revision: '1',
              question: {
                kind: 'question',
                cardId: cardRef.cardId,
                title: 'title',
                description: 'description',
                options: [{ id: 'option\0id', label: 'label', description: 'description' }],
              },
              ...(state === 'unanswered'
                ? { kind: 'pending' }
                : state === 'invalidated'
                  ? { kind: 'invalidated', reason: 'cancelled', terminalEvidenceRef: 'terminal\0' }
                  : {
                      kind: 'decided',
                      decision: {
                        ref: {
                          card: cardRef,
                          decisionId: `decision\0${requestId}`,
                          submission: {
                            tenantRef,
                            actorRef: 'submitter\0',
                            operationId: `operation\0${requestId}`,
                          },
                        },
                        reply: { kind: 'selection', optionId: 'option\0id' },
                        basisRef: 'basis\0',
                        commitReceipt: 'commit\0',
                      },
                      delivery:
                        state === 'pending'
                          ? { kind: 'pending' }
                          : { kind: state, receiptRef: 'receipt\0' },
                    }),
            },
          ],
        })
        insertRequest(
          port,
          record,
          readAudience({
            tenantRef: record.ref.tenantRef,
            waitRef: wait,
            preparationRef: 'prepared\0',
            registrationDigest: 'a'.repeat(64),
            readers: [actor],
          }),
        )
        expect(readRequest(port, record.ref, actor)).toEqual(record)
        expect(readRequest(port, record.ref, 'actor\0other')).toBeUndefined()
        const result = pool.read(
          {
            tenantRef,
            actorRef: actor,
            position: { after: '0', offset: 0 },
            filter: { states: ['pending', 'decided', 'invalidated'] },
            limit: 20,
          },
          port,
        )
        expect(result).toMatchObject({
          kind: 'read',
          output: {
            kind: 'page',
            revision: '7',
            items: expect.arrayContaining(
              record.cards.map(card => ({
                card,
                origin: record.origin,
                displayContext: record.displayContext,
              })),
            ),
            next: null,
            completeness: 'complete',
          },
        })
      }
      expect(db.prepare('SELECT count(*) AS n FROM hi_requests_v2').get()?.n).toBe(6)
      for (const value of [
        'raw',
        'null',
        '123',
        '{}',
        '[]',
        '""',
        JSON.stringify('x'.repeat(49153)),
      ]) {
        expect(() => db.prepare('UPDATE hi_requests_v2 SET display_context=?').run(value)).toThrow()
      }
    } finally {
      db.close()
    }
  },
)
