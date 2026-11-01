// Worker exit and generations (SPEC 7.7.2, scenario C13). A participant that calls process.exit
// ends the Worker thread in the middle of an operation.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteStorage } from "../src/index.ts";
import { WriterClient } from "../src/writer-client.ts";
import type { Worker } from "node:worker_threads";
import type {
  SqlIdentity,
  CommitResultV2,
  SqlStorage,
  StorageControl,
} from "@omne-harness/sql-contract";
import { defaultConfig, makeWorkspace, type Built, type Workspace } from "./support.ts";
import {
  buildGroupMaterials,
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
let events: string[];
let control: StorageControl | null = null;

beforeEach(async () => {
  workspace = await makeWorkspace();
  built = await buildGroupMaterials(workspace);
  events = [];
});

afterEach(async () => {
  await control?.close({ initiator: "disposal" }).catch(() => undefined);
  control = null;
  await workspace.remove();
});

async function start(): Promise<SqlStorage> {
  const created = await createSqliteStorage({
    config: { ...defaultConfig(workspace.storageRoot), groupCollectMs: 150 },
    materials: built.catalog,
    closeLeases: {
      admit(name) {
        events.push(`admit:${name.split("/").slice(-1)[0] ?? ""}`);
        return { generation: name.split("/").slice(-1)[0] };
      },
      release(lease) {
        events.push(`release:${String((lease as { generation: string }).generation)}`);
      },
    },
  });
  if (created.kind !== "created") throw new Error("rejected");
  control = created.control;
  const registered = await created.storage.registerCombination(groupRegistration(built));
  if (registered.kind !== "registered") throw new Error(`registration is ${registered.kind}`);
  return created.storage;
}

const insert = (key: string): ReturnType<typeof op> => op(built, key, [seqCommand({ tag: key })]);
const crash = (key: string): ReturnType<typeof op> =>
  op(built, key, [seqCommand({ mode: "exit" })]);
const kinds = (results: readonly CommitResultV2[]): string[] =>
  results.map((result) => result.kind);

describe("C13: a Worker that exits inside a group", () => {
  it("every identity that was not durable is unknown, earlier receipts survive, and the new Worker starts only after the old exit was observed", async () => {
    const storage = await start();
    expect((await storage.commit(insert("d"))).kind).toBe("committed");
    const results = await Promise.all([
      storage.commit(insert("a")),
      storage.commit(crash("x")),
      storage.commit(insert("c")),
    ]);
    expect(kinds(results)).toEqual(["unknown", "unknown", "unknown"]);
    for (const result of results)
      expect(result.kind === "unknown" && result.diagnostic).toContain("worker_exited");

    // A touch of the domain opens a new Worker. Its lease is admitted after the old one is released.
    expect((await storage.query(identityOf(results[0]))).kind).toBe("not_committed");
    expect((await storage.query(identityOf(results[1]))).kind).toBe("not_committed");
    expect((await storage.query(identityOf(results[2]))).kind).toBe("not_committed");
    expect((await storage.query(insert("d").identity)).kind).toBe("committed");
    expect(events).toEqual(["admit:1", "release:1", "admit:2"]);
    expect(readRows(workspace, "select tag from t_seq")).toEqual([{ tag: "d" }]);
    expect((await storage.commit(insert("again"))).kind).toBe("committed");
  });

  it("after the receipts of the prefix and of the failed operation are durable, a crash of the suffix leaves them recognizable", async () => {
    const storage = await start();
    const failing = op(built, "b", [seqCommand({ mode: "fail", tag: "b" })]);
    const results = await Promise.all([
      storage.commit(insert("a")),
      storage.commit(failing),
      storage.commit(crash("x")),
    ]);
    expect(kinds(results)).toEqual(["committed", "rolled_back", "unknown"]);
    expect(await storage.query(identityOf(results[0]))).toEqual(results[0]);
    expect(await storage.query(identityOf(results[1]))).toEqual(results[1]);
    expect((await storage.query(identityOf(results[2]))).kind).toBe("not_committed");
  });
});

describe("C13: replies of an older Worker generation", () => {
  it("a reply with another Worker generation is not accepted, the real reply of this generation is", async () => {
    const env = {
      file: `${workspace.root}/never-opened.sqlite`,
      domain: "domain-a",
      catalog: built.catalog,
      lockWaitMs: 100,
      walAutocheckpointPages: 1000,
      journalSizeLimitBytes: 67108864,
      maxResponseBytes: 65536,
      maxOperationResponseBytes: 1048576,
      maxDiagnosticBytes: 4096,
      groupMaxOperations: 8,
      groupCollectMs: 0,
      groupMaxInputBytes: 4194304,
      groupMaxResponseReservationBytes: 8388608,
      groupMaxExecutionSliceMs: 5,
      generation: 5,
    };
    const client = new WriterClient(env, () => undefined);
    const pending = client.request<{ kind: string }>({
      kind: "query",
      identity: insert("q").identity,
    });
    // The request is sent but the Worker has not answered yet. A stale envelope with the same id.
    const worker = (client as unknown as { worker: Worker }).worker;
    worker.emit("message", { id: 1, generation: 4, reply: { kind: "none" } });
    const reply = await pending;
    expect(reply.kind).toBe("internal_error");
    await client.close();
  });
});
