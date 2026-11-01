// Partial failure, two-phase rollback, whole-transaction end, environment errors and SQ-1
// (SPEC 7.6, 7.7.1, 7.7.2, 7.7.5, 7.7.6). Scenarios C04 and C22 of the SQL contract.
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SqlIdentity, CommitResultV2, RolledBackV2 } from "@omne-harness/sql-contract";
import {
  createProvider,
  makeWorkspace,
  type Built,
  type Provider,
  type Workspace,
} from "./support.ts";
import {
  buildGroupMaterials,
  domainFile,
  firstGap,
  groupRegistration,
  op,
  readRows,
  seqCommand,
} from "./group-support.ts";

function identityOf(result: CommitResultV2): SqlIdentity {
  if (result.identity === null) throw new Error("no identity");
  return result.identity;
}

let workspace: Workspace;
let built: Built;
const providers: Provider[] = [];

beforeEach(async () => {
  workspace = await makeWorkspace();
  built = await buildGroupMaterials(workspace);
});

afterEach(async () => {
  for (const provider of providers.splice(0))
    await provider.control.close({ initiator: "disposal" }).catch(() => undefined);
  await workspace.remove();
});

async function ready(config: Record<string, number> = {}): Promise<Provider> {
  const provider = await createProvider(workspace, built, { groupCollectMs: 150, ...config });
  providers.push(provider);
  const result = await provider.storage.registerCombination(groupRegistration(built));
  if (result.kind !== "registered") throw new Error(`registration is ${result.kind}`);
  return provider;
}

function rolledBack(result: CommitResultV2): RolledBackV2 {
  if (result.kind !== "rolled_back") throw new Error(`expected rolled_back, got ${result.kind}`);
  return result;
}

const probe = (result: CommitResultV2): { rows: number; receipts: number } => {
  if (result.kind !== "committed") throw new Error(`expected committed, got ${result.kind}`);
  return (result.responses[0].reply as unknown as { response: { rows: number; receipts: number } })
    .response;
};

const insert = (key: string, tag = key): ReturnType<typeof op> =>
  op(built, key, [seqCommand({ tag })]);
const failing = (key: string): ReturnType<typeof op> =>
  op(built, key, [seqCommand({ mode: "fail", tag: key })]);
const ending = (key: string): ReturnType<typeof op> =>
  op(built, key, [seqCommand({ mode: "end-tx", tag: key })]);

describe("C04: local failure inside a group (SPEC 7.7.1)", () => {
  it("commits the prefix, writes only the rollback receipt of the failed operation, and runs the suffix afterwards from durable state", async () => {
    const { storage } = await ready();
    const [a, b, c] = await Promise.all([
      storage.commit(insert("a")),
      storage.commit(failing("b")),
      storage.commit(op(built, "c", [seqCommand({ mode: "probe", file: domainFile(workspace) })])),
    ]);
    expect(a.kind).toBe("committed");
    expect(
      rolledBack(b).responses.map((entry) => `${entry.participant}:${entry.reply.kind}`),
    ).toEqual(["seq:conflict"]);
    // The suffix ran in a new outer transaction: the prefix and the rollback receipt were durable.
    expect(probe(c)).toEqual({ rows: 1, receipts: 2 });
    expect(readRows(workspace, "select tag from t_seq")).toEqual([{ tag: "a" }]);
    expect(
      readRows(workspace, "select operation_key, kind from _sql_receipt order by rowid"),
    ).toEqual([
      { operation_key: "a", kind: "committed" },
      { operation_key: "b", kind: "rolled_back" },
      { operation_key: "c", kind: "committed" },
    ]);
    expect(await storage.query(identityOf(b))).toEqual(b);
  });

  it("the first failure stops the group: a second failing operation is not started in the same transaction", async () => {
    const { storage } = await ready();
    const results = await Promise.all([
      storage.commit(failing("b1")),
      storage.commit(failing("b2")),
    ]);
    expect(results.map((result) => result.kind)).toEqual(["rolled_back", "rolled_back"]);
    expect(readRows(workspace, "select operation_key from _sql_receipt order by rowid")).toEqual([
      { operation_key: "b1" },
      { operation_key: "b2" },
    ]);
  });
});

describe("C04: a statement that ends the whole transaction (SPEC 7.7.2, 7.7.5)", () => {
  it("without a staged prefix the operation is rolled_back, saved by the second short transaction", async () => {
    const { storage } = await ready();
    expect((await storage.commit(insert("d"))).kind).toBe("committed");
    const result = await storage.commit(ending("e"));
    const stored = rolledBack(result);
    const last = stored.responses[stored.responses.length - 1];
    expect(last?.reply.kind === "failed" && last.reply.category).toBe("sql_error");
    expect(await storage.query(identityOf(result))).toEqual(result);
    expect(
      readRows(workspace, "select operation_key, kind from _sql_receipt order by rowid"),
    ).toEqual([
      { operation_key: "d", kind: "committed" },
      { operation_key: "e", kind: "rolled_back" },
    ]);
  });

  it("with a staged prefix, both are unknown, nothing of them is durable, and the staged sequence is gone", async () => {
    const { storage } = await ready();
    expect((await storage.commit(insert("d"))).kind).toBe("committed");
    const [a, e] = await Promise.all([storage.commit(insert("a")), storage.commit(ending("e"))]);
    expect([a.kind, e.kind]).toEqual(["unknown", "unknown"]);
    expect(readRows(workspace, "select operation_key from _sql_receipt")).toEqual([
      { operation_key: "d" },
    ]);
    expect((await storage.query(identityOf(a))).kind).toBe("not_committed");
    expect((await storage.query(identityOf(e))).kind).toBe("not_committed");
    // SQ-1 item 5: the number that the staged operation took did not survive.
    const next = await storage.commit(insert("f"));
    expect(next.kind === "committed" && next.responses[0].reply).toEqual({
      kind: "participated",
      response: { n: "2" },
    });
  });
});

describe("C04: environment errors are unknown, not rolled_back (SPEC 7.6)", () => {
  it("a write lock wait that expires leaves every operation of the group unknown and writes no receipt", async () => {
    const { storage } = await ready({ lockWaitMs: 100 });
    const blocker = new DatabaseSync(domainFile(workspace));
    blocker.exec("begin immediate");
    try {
      const results = await Promise.all([
        storage.commit(insert("a")),
        storage.commit(insert("b")),
        storage.commit(insert("c")),
      ]);
      expect(results.map((result) => result.kind)).toEqual(["unknown", "unknown", "unknown"]);
    } finally {
      blocker.exec("rollback");
      blocker.close();
    }
    expect(readRows(workspace, "select count(*) n from _sql_receipt")).toEqual([{ n: 0 }]);
  });
});

describe("C22: sequence of an undone operation (SQ-1, SPEC 7.7.6)", () => {
  const numbers = (): number[] =>
    (readRows(workspace, "select n from t_seq") as { n: number }[]).map((row) => row.n);

  it("a number taken by an undone operation is reused by its successor: the sequence has no gap", async () => {
    const { storage } = await ready();
    const results = await Promise.all([
      storage.commit(insert("a")),
      storage.commit(failing("b")),
      storage.commit(insert("c")),
    ]);
    expect(results.map((result) => result.kind)).toEqual(["committed", "rolled_back", "committed"]);
    expect(numbers()).toEqual([1, 2]);
    expect(readRows(workspace, "select seq from sqlite_sequence where name = 't_seq'")).toEqual([
      { seq: 2 },
    ]);
    expect(firstGap(numbers())).toBeNull();
  });

  it("the check finds a gap when the material caches its sequence in module memory", async () => {
    const { storage } = await ready();
    const cached = (key: string, mode: string): ReturnType<typeof op> =>
      op(built, key, [seqCommand({ mode, tag: key })]);
    await Promise.all([
      storage.commit(cached("a", "cached")),
      storage.commit(cached("b", "cached-fail")),
      storage.commit(cached("c", "cached")),
    ]);
    expect(numbers()).toEqual([1, 3]);
    expect(firstGap(numbers())).toBe(2);
  });

  it("a participant cannot read the receipts, so no response of an undone operation reaches a successor", async () => {
    const { storage } = await ready();
    const result = rolledBack(
      await storage.commit(op(built, "r", [seqCommand({ mode: "receipts" })])),
    );
    const last = result.responses[result.responses.length - 1];
    expect(last?.reply.kind === "failed" && last.reply.category).toBe("port_violation");
  });
});
