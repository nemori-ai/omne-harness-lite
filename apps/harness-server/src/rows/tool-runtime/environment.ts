// Tool 运行时组的执行环境输入（B 段，L-TOOL 事实清单 §3「应用提供真实 store、custody/content、source/资格、
// Session 重签回调、无许可需求来源、当前 EE 授权/命名/精确原获取清理和配置」）。只有一种落点：宿主机
// （`host_machine`），由 `execution-host` 行的宿主提供者兑现；本发行不声称隔离。
// - `requirement`：经执行域的 schema-provider 校验 environment 声明并取值（与 `tool-host` 的 loader 同一路径，
//   R2-D80）；声明不允许宿主机落点答 denied；provider 不在（`tool-environments` 行未装）答 unavailable。
// - `binding`：origin 由调用与准备操作铸出并记进本运行的 origin 表；scope 就是固定请求的 requesterScope；
//   保留终端的账本绑在同一 scope 上。
// - `guard`：设施请求的主体经核验是本租户的会话工作主体、origin 是本运行铸的、路径与 cwd 在文件根内。命令内容不过滤：
//   Shell 是发行授予的能力，授权规则在 `authorization` 行，本发行不声称沙盒。
// - `naming`：路径解析到文件根内的宿主对象，取宿主对象令牌；越出文件根答 denied。
// - `facts`：落点必须是宿主机；系统、版本、架构取本进程所在主机，设施取落点的需求。
// - `cleanup.settle`：冷获取的原清理不在本波（与 L-TOOL C06 同一做法），答 pending，责任保留。
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { release as osRelease } from "node:os";
import {
  originRef,
  type FacilityGuard,
  type FacilityKey,
  type IsolationClaim,
  type OriginRef,
} from "@omne-harness/execution-environment-contract";
import { hostObjectToken } from "@omne-harness/execution-environment-host-local";
import { tenantCodec } from "@omne-harness/legal-identity";
import { fail, succeed } from "@omne-harness/operation-result";
import type { SchemaProvider } from "@omne-harness/schema-provider";
import { canonicalDigest } from "@omne-harness/tool";
import { describedAdoption } from "@omne-harness/tool-contract/provider";
import {
  createEnvironmentResourceLedger,
  createEnvironmentStateStore,
  createRetainedTerminalLedger,
  type EnvironmentStateStore,
} from "@omne-harness/tool-host-local";
import type { LocalToolRuntimeInput } from "@omne-harness/tool-host-local/cordis";
import { environmentNeedSchemaRef } from "@omne-harness/execution-environment-contract";
import { readEnvironmentNeed } from "../tool-host/release-author.ts";
import type { ReleaseToolIdentity } from "./access.ts";
import { lateGuarded, lateStore, type ToolRuntimeHolder } from "./holder.ts";

type EnvironmentInput = LocalToolRuntimeInput["environment"];
type Preparation = Parameters<EnvironmentInput["plan"]["ledger"]>[0];

/** 本发行的环境适配采用（固定在准备记录里）。 */
export const RELEASE_ENVIRONMENT_ADOPTION = describedAdoption({
  owner: "@omne-harness/harness-server",
  name: "host-machine-environment",
  revision: "1",
});

export type ReleaseEnvironmentOptions = Readonly<{
  /** 宿主文件根：与 `execution-host` 行的 `filesRoot` 相同（运维者层）。 */
  filesRoot: string;
  commitAttempts: number;
  /** 执行域的 schema-provider；`tool-environments` 行装载时交来，缺席时需求答 unavailable。 */
  schemaProvider: () => SchemaProvider | null;
}>;

const unavailable = (dependency: string, diagnostic: string) =>
  fail({ kind: "unavailable" as const, dependency, diagnostic });

/** 路径在文件根之内（含文件根本身）。相对路径按文件根解析。 */
export function withinRoot(root: string, path: string): boolean {
  const tail = relative(root, resolve(root, path));
  return (
    tail === "" ||
    (!isAbsolute(tail) && tail !== ".." && !tail.startsWith("..\\") && !tail.startsWith("../"))
  );
}

function textField(request: object, name: string): unknown {
  return Reflect.get(request, name);
}

export type ReleaseEnvironment = Readonly<{
  input: EnvironmentInput;
  /** origin → 原调用；只在本运行内，重启后旧 origin 一律不授权。 */
  origins: ReadonlyMap<OriginRef, string>;
}>;

export function createReleaseEnvironment(
  holder: ToolRuntimeHolder,
  identity: ReleaseToolIdentity,
  options: ReleaseEnvironmentOptions,
): ReleaseEnvironment {
  const root = options.filesRoot;
  const origins = new Map<OriginRef, string>();
  const state: EnvironmentStateStore = createEnvironmentStateStore({
    store: lateStore(holder),
    guarded: lateGuarded(holder),
    mode: "production",
    commitAttempts: options.commitAttempts,
  });

  /** 本租户会话工作主体的当前资格，用于账本的授权回调。 */
  const currentAccess = async (request: Preparation) => {
    const verdict = await identity.access.guard.qualify({
      principal: request.principal,
      tenant: request.tenant,
      call: request.call,
      action: "write",
    });
    return verdict.kind === "allowed"
      ? ("authorized" as const)
      : verdict.kind === "denied"
        ? ("notAuthorized" as const)
        : ("unavailable" as const);
  };

  const ledgerViews = new Map<string, ReturnType<typeof openLedgers>>();
  function openLedgers(request: Preparation) {
    return (async () => {
      const input = {
        state,
        address: request.preparation,
        authorize: () => currentAccess(request),
      };
      const regular = await createEnvironmentResourceLedger(input);
      const retained = await createRetainedTerminalLedger({
        ...input,
        scope: request.preparation.request.requesterScope,
      });
      return { regular, retained };
    })();
  }
  const ledgers = (request: Preparation) => {
    const key = canonicalDigest([request.tenant, request.call, request.preparation.operation]);
    let found = ledgerViews.get(key);
    if (found === undefined) {
      found = openLedgers(request);
      ledgerViews.set(key, found);
      // A failed open is not kept, so a later preparation tries again.
      found.catch(() => ledgerViews.delete(key));
    }
    return found;
  };

  const guard: FacilityGuard<unknown> = {
    async authorize(facility, _operation, request) {
      try {
        const session = await identity.sessionOf(request.access.principal, request.access.tenant);
        if (session === undefined || !origins.has(request.origin)) return "notAuthorized";
        const cwd = textField(request, "cwd");
        if (cwd !== undefined && (typeof cwd !== "string" || !withinRoot(root, cwd)))
          return "notAuthorized";
        if (facility === "files") {
          const path = textField(request, "path");
          if (path !== undefined && (typeof path !== "string" || !withinRoot(root, path)))
            return "notAuthorized";
        }
        return "authorized";
      } catch {
        return "unavailable";
      }
    },
  };

  const naming: EnvironmentInput["naming"] = {
    async name(input) {
      const session = await identity.sessionOf(input.principal, input.tenant);
      if (session === undefined || !origins.has(input.origin) || !withinRoot(root, input.path))
        return fail({ kind: "denied", action: "name-host-object" });
      let path = resolve(root, input.path);
      if (input.role === "parent" || input.role === "ancestor") path = dirname(path);
      for (;;) {
        try {
          return succeed(await hostObjectToken(path));
        } catch {
          if (input.role !== "ancestor" || path === resolve(root))
            return unavailable("host-object-naming", "the exact host object could not be named");
          path = dirname(path);
          if (!withinRoot(root, path)) return fail({ kind: "denied", action: "name-host-object" });
        }
      }
    },
  };

  const plan: EnvironmentInput["plan"] = {
    async requirement(request) {
      const provider = options.schemaProvider();
      if (provider === null)
        return unavailable("tool-environments", "the environment schema provider is not installed");
      const need = await readEnvironmentNeed(request.preparation.request.availability.definition, {
        provider,
        schema: environmentNeedSchemaRef,
      });
      if ("failure" in need) return need;
      if (need.ok === null || !need.ok.layers.includes("host_machine"))
        return fail({ kind: "denied", action: "host-machine-placement" });
      return succeed({
        allowedBindings: [{ kind: "host_machine" }],
        // Validated against the contract's need schema; an unregistered key is refused at placement.
        facilities: need.ok.facilities as readonly FacilityKey[],
        isolation: need.ok.isolation as readonly IsolationClaim[],
      });
    },
    async binding(request) {
      if (!tenantCodec.encode(request.tenant).ok)
        return fail({ kind: "denied", action: "environment-binding" });
      const origin = originRef(`tool:${request.call}:${request.preparation.operation}`);
      origins.set(origin, request.call);
      const view = await ledgers(request);
      const scope = request.preparation.request.requesterScope;
      return succeed({ origin, scope, retention: { scope, ledger: view.retained } });
    },
    guard,
    ledger: async (request) => (await ledgers(request)).regular,
    async facts(placement) {
      if (placement.binding.kind !== "host_machine")
        return unavailable("execution-host", "the placement is not the host machine");
      return succeed({
        system: process.platform,
        release: osRelease(),
        architecture: process.arch,
        facilities: placement.requirement.facilities,
      });
    },
  };

  const input: EnvironmentInput = {
    adoption: RELEASE_ENVIRONMENT_ADOPTION,
    guarded: lateGuarded(holder),
    naming,
    cleanup: {
      settle: async () =>
        succeed({
          kind: "pending",
          diagnostic:
            "Cold Tool acquisition cleanup is not part of wave 2; the original stays owned.",
        }),
    },
    plan,
  };
  return Object.freeze({ input, origins });
}
