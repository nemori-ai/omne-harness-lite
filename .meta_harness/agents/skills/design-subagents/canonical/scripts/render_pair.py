#!/usr/bin/env python3
"""Render a shared role into staged Codex/Claude definitions; never invoke a model."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import tomllib
from pathlib import Path

import yaml


from role_source import UniqueLoader, source_text, required_string, assembly_inputs, assemble_prompt


def host_support() -> dict:
    return json.loads((Path(__file__).resolve().parents[1] / "references/model-support.json").read_text())


def effort_description(effort: str) -> str:
    return (f"Default reasoning effort: {effort}; the dispatcher may adjust it to medium, high or xhigh "
            "for the actual task size and complexity. Use the role dispatch settings to apply the chosen effort.")


def validate_target(config: dict, host: str, overlay: str, support: dict):
    model = config.get("model")
    aliases = {"inherit", "sonnet", "opus", "haiku", "fable"} if host == "claude_code" else set()
    models = {m["id"]: m for m in support[host]["models"]}
    if model is not None:
        if not isinstance(model, str) or model not in models.keys() | aliases:
            raise ValueError(f"{host}: model lacks bundled host-support evidence: {model!r}")
    if overlay and model not in models:
        raise ValueError(f"{host}: a model adaptation requires an exact supported model, not inheritance/alias")
    effort_key = "model_reasoning_effort" if host == "codex" else "effort"
    if effort_key in config:
        effort = required_string(config, effort_key, host)
        if host == "codex" and model in models and effort not in models[model]["effort_values"]:
            raise ValueError(f"codex: unsupported effort in recorded model evidence: {effort}")


def render(source: Path) -> dict[Path, str]:
    core, default_effort = assemble_prompt(source)
    codex_raw = source_text(source, "codex.toml")
    claude_raw = source_text(source, "claude.yaml")
    codex = tomllib.loads(codex_raw)
    claude = yaml.load(claude_raw, Loader=UniqueLoader)
    if not isinstance(claude, dict):
        raise ValueError("claude.yaml must be a frontmatter mapping")
    forbidden_codex = {"developer_instructions", "disallowedTools", "permissionMode", "effort", "maxTurns", "mcpServers"}
    forbidden_claude = {"developer_instructions", "model_reasoning_effort", "sandbox_mode", "mcp_servers"}
    if forbidden_codex & codex.keys():
        raise ValueError(f"codex source contains generated or Claude-only fields: {sorted(forbidden_codex & codex.keys())}")
    if forbidden_claude & claude.keys():
        raise ValueError(f"Claude source contains Codex-only fields: {sorted(forbidden_claude & claude.keys())}")
    if "skills" in codex and not isinstance(codex["skills"], dict):
        raise ValueError("Codex skills configuration is not Claude's preload array")
    if "tools" in codex and not isinstance(codex["tools"], dict):
        raise ValueError("do not copy Claude's tools allowlist into Codex configuration")
    for key in ("name", "description"):
        if required_string(codex, key, "codex") != required_string(claude, key, "claude"):
            raise ValueError(f"paired {key} differs")
    if default_effort:
        if "model_reasoning_effort" in codex or "effort" in claude:
            raise ValueError("adjustable effort belongs only in assembly.toml, not native source fields")
        if not codex["description"].endswith(effort_description(default_effort)):
            raise ValueError("description must declare the configured default and dispatcher adjustment")
        # Codex role-file effort overrides spawn settings. Omit it so dispatch can choose.
        # Claude file effort is the normal default; a session-local --agents entry can override it.
        claude["effort"] = default_effort
    name = codex["name"]
    # A deliberately narrow portable naming convention, not a full host name schema.
    if not re.fullmatch(r"[a-z]+(?:-[a-z]+)*", name):
        raise ValueError("use a portable lowercase hyphenated role name")
    for key in ("tools", "disallowedTools"):
        if key in claude:
            value = claude[key]
            if not (isinstance(value, str) or (isinstance(value, list) and all(isinstance(v, str) for v in value))):
                raise ValueError(f"claude: {key} must contain tool/skill names")
    if "skills" in claude and not (isinstance(claude["skills"], list) and all(isinstance(v, str) for v in claude["skills"])):
        raise ValueError("claude: skills must be an array of skill names")
    if "maxTurns" in claude and (type(claude["maxTurns"]) is not int or claude["maxTurns"] < 1):
        raise ValueError("claude: maxTurns must be a positive integer")
    if "background" in claude and type(claude["background"]) is not bool:
        raise ValueError("claude: background must be a boolean")
    support = host_support()
    prompts = {}
    for host, filename, config in (("codex", "codex-adaptation.md", codex), ("claude_code", "claude-adaptation.md", claude)):
        overlay = source_text(source, filename, optional=True)
        validate_target(config, host, overlay, support)
        if default_effort and host == "codex":
            validate_target({**config, "model_reasoning_effort": default_effort}, host, overlay, support)
        prompts[host] = core + ("\n\n" + overlay if overlay else "") + "\n"
    # Prepend the generated root field so TOML tables in the source keep their scope.
    codex_result = "developer_instructions = " + json.dumps(prompts["codex"], ensure_ascii=False) + "\n" + codex_raw + "\n"
    if tomllib.loads(codex_result) != {**codex, "developer_instructions": prompts["codex"]}:
        raise ValueError("TOML round trip changed the source configuration")
    claude_result = "---\n" + yaml.safe_dump(claude, allow_unicode=True, sort_keys=False).rstrip() + "\n---\n\n" + prompts["claude_code"]
    return {Path(".codex/agents") / f"{name}.toml": codex_result,
            Path(".claude/agents") / f"{name}.md": claude_result}


def dispatch_settings(source: Path, host: str, effort: str | None = None) -> dict:
    outputs = render(source)
    _, default = assembly_inputs(source)
    if not default:
        raise ValueError("this role does not declare adjustable effort")
    selected = default if effort is None else effort
    if selected not in ("medium", "high", "xhigh"):
        raise ValueError("dispatch effort must be medium, high or xhigh")
    if host == "codex":
        config = tomllib.loads(next(v for p, v in outputs.items() if p.suffix == ".toml"))
        support = host_support()
        validate_target({**config, "model_reasoning_effort": selected}, "codex", "", support)
        return {"agent_type": config["name"], "model": config.get("model"), "reasoning_effort": selected}
    if host == "claude":
        text = next(v for p, v in outputs.items() if p.suffix == ".md")
        front, body = text.split("---\n", 2)[1:]
        config = yaml.load(front, Loader=UniqueLoader)
        name = config.pop("name")
        for key in ("tools", "disallowedTools"):
            if isinstance(config.get(key), str):
                config[key] = [part.strip() for part in config[key].split(",") if part.strip()]
        config.update(effort=selected, prompt=body.lstrip("\n"))
        return {name: config}
    raise ValueError("unknown dispatch host")


def native_config(outputs: dict[Path, str], host: str) -> dict:
    if host == "codex":
        return tomllib.loads(next(v for p, v in outputs.items() if p.suffix == ".toml"))
    front, body = next(v for p, v in outputs.items() if p.suffix == ".md").split("---\n", 2)[1:]
    config = yaml.load(front, Loader=UniqueLoader)
    config["prompt"] = body.lstrip("\n")
    for key in ("tools", "disallowedTools"):
        if isinstance(config.get(key), str):
            config[key] = [part.strip() for part in config[key].split(",") if part.strip()]
    return config


def dispatch_defaults(value: dict | None, label: str) -> dict:
    if value is None:
        return {}
    if not isinstance(value, dict) or value.keys() - {"model", "effort"}:
        raise ValueError(f"{label}: only model and effort fields are allowed")
    for key in value:
        required_string(value, key, label)
    return value


def exact_model(model: str, host: str, effort: str, support: dict):
    models = {entry["id"] for entry in support[host]["models"]}
    if model not in models:
        raise ValueError(f"{host}: dispatch requires an exact supported model: {model!r}")
    if effort not in ("low", "medium", "high", "xhigh", "max", "ultra"):
        raise ValueError(f"unsupported dispatch effort: {effort!r}")
    if host == "claude_code" and effort == "ultra":
        raise ValueError("claude_code: unsupported dispatch effort: ultra")
    key = "model_reasoning_effort" if host == "codex" else "effort"
    validate_target({"model": model, key: effort}, host, "", support)


def choose_dispatch_value(key: str, fixed: str | None, layers: list[tuple[str, dict]]) -> tuple[str, str]:
    explicit = layers[0][1]
    if fixed is not None:
        if key in explicit and explicit[key] != fixed:
            raise ValueError(f"fixed {key} constraint conflicts with task override")
        return fixed, "role-source"
    for origin, values in layers:
        if key in values:
            return values[key], origin
    raise ValueError(f"dispatch requires a nonempty {key}")


def policy_model(source: Path, host: str, reference: str) -> tuple[str, str]:
    # Read the existing host configuration; the policy contains role references, not model IDs.
    if not re.fullmatch(r"[a-z]+(?:-[a-z]+)*", reference):
        raise ValueError("invalid policy model source")
    config = native_config(render(source.parent / reference), host)
    return required_string(config, "model", reference), reference


def resolve_dispatch(source: Path, host: str, work_kind: str, *, policy_version: str,
                     risks: tuple[str, ...] = (), overrides: dict | None = None,
                     pstack_defaults: dict | None = None, host_defaults: dict | None = None) -> dict:
    """Resolve one task without dispatching, writing projections or inferring runtime observations.

    The role collection owns dispatch-policy.json. Callers must supply its version and a work kind.
    Defaults are already-read host-specific values; this function never reads personal settings.
    """
    host = "claude_code" if host == "claude" else host
    if host not in ("codex", "claude_code"):
        raise ValueError(f"unknown dispatch host: {host!r}")
    overrides = dispatch_defaults(overrides, "overrides")
    pstack_defaults = dispatch_defaults(pstack_defaults, "pstack defaults")
    host_defaults = dispatch_defaults(host_defaults, "host defaults")
    policy_raw = source_text(source.parent, "dispatch-policy.json")
    policy = json.loads(policy_raw)
    if policy_version != policy["version"]:
        raise ValueError(f"dispatch policy version mismatch: expected {policy['version']}")
    outputs = render(source)
    config = native_config(outputs, host)
    role = config["name"]
    if role not in policy["roles"]:
        raise ValueError(f"unknown dispatch role: {role!r}")
    rule = policy["roles"][role]
    if not isinstance(work_kind, str) or work_kind not in rule["work"]:
        raise ValueError(f"{role}: unknown or missing work kind: {work_kind!r}")
    allowed_risks = {risk for entry in policy["roles"].values() for risk in entry.get("top_risks", [])}
    if not isinstance(risks, (tuple, list)) or any(not isinstance(risk, str) or risk not in allowed_risks for risk in risks):
        raise ValueError("unknown dispatch risk")
    tier = rule["work"][work_kind]
    if set(risks) & set(rule.get("top_risks", [])):
        tier = "top"
    role_defaults = {}
    model_reference = role
    variant = rule.get("model_variants", {}).get(work_kind, {}).get(host)
    top_reference = rule.get("top_model_sources", {}).get(host, policy["tiers"]["top"][host])
    if rule.get("adjustable_model"):
        reference = top_reference if tier == "top" else policy["tiers"][tier][host]
        role_defaults["model"], model_reference = policy_model(source, host, reference)
    elif variant:
        role_defaults["model"], model_reference = policy_model(source, host, variant)
    effort_key = "model_reasoning_effort" if host == "codex" else "effort"
    _, adjustable_effort = assembly_inputs(source)
    if adjustable_effort:
        role_defaults["effort"] = adjustable_effort
    minimum = rule.get("minimum_effort", "low")
    if tier == "top" and "top_minimum_effort" in rule:
        minimum = rule["top_minimum_effort"]
        role_defaults["effort"] = minimum
    layers = [("task-override", overrides), ("role-work", role_defaults),
              ("pstack", pstack_defaults), ("host-default", host_defaults)]
    fixed_model = (role_defaults["model"] if variant else
                   None if rule.get("adjustable_model") else config.get("model"))
    model, model_origin = choose_dispatch_value("model", fixed_model, layers)
    fixed_effort = None if adjustable_effort else config.get(effort_key)
    effort, effort_origin = choose_dispatch_value("effort", fixed_effort, layers)
    if adjustable_effort and effort not in ("medium", "high", "xhigh"):
        raise ValueError("adjustable role effort must be medium, high or xhigh")
    support = host_support()
    exact_model(model, host, effort, support)
    effort_order = ("low", "medium", "high", "xhigh", "max", "ultra")
    if effort_order.index(effort) < effort_order.index(minimum):
        raise ValueError(f"{role}: effort must be at least {minimum} for this task")
    if tier == "top" and rule.get("adjustable_model"):
        top_model, _ = policy_model(source, host, top_reference)
        if model != top_model:
            raise ValueError(f"{role}: task requires the top-tier model {top_model}")
    if host == "codex":
        native = {"agent_type": role, "model": model, "reasoning_effort": effort}
    else:
        config.pop("name")
        config.update(model=model, effort=effort)
        native = {role: config}
    revision = hashlib.sha256(json.dumps({str(p): v for p, v in outputs.items()},
                                        sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    selected_source = model_reference if model_origin in ("role-source", "role-work") else None
    model_revision = None
    if selected_source:
        filename = "codex.toml" if host == "codex" else "claude.yaml"
        model_revision = hashlib.sha256(source_text(source.parent / selected_source, filename).encode()).hexdigest()
    return {"harness": host, "role": role, "work_kind": work_kind, "risks": list(risks),
            "policy_version": policy["version"], "policy_revision": hashlib.sha256(policy_raw.encode()).hexdigest(),
            "role_source_revision": revision, "requested": {"model": model, "effort": effort},
            "selection": {"model": model_origin, "effort": effort_origin,
                          "model_source_role": selected_source, "model_source_revision": model_revision},
            "observed": {"model": "unknown", "effort": "unknown"}, "native": native,
            "diagnostics": ["Host support uses the bundled dated evidence; account execution is not verified.",
                            "Load the effective role projection or restart/resume before dispatch; file changes do not prove session loading."]}


def deliver(outputs: dict[Path, str], output: Path, check=False):
    root = output.resolve()
    targets = []
    for relative, content in outputs.items():
        target = root / relative
        if target.is_symlink() or not target.resolve().is_relative_to(root):
            raise ValueError(f"output path escapes staging root or is a symlink: {relative}")
        if target.exists():
            if not target.is_file() or target.read_text(encoding="utf-8") != content:
                raise ValueError(f"output differs; compare in a fresh staging directory: {relative}")
        elif check:
            raise ValueError(f"missing generated file: {relative}")
        targets.append((target, content))
    if check:
        return
    # Preflight both paths before any mutation. Exclusive creation never overwrites.
    for target, content in targets:
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("x", encoding="utf-8") as handle:
                handle.write(content)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--output", type=Path)
    target.add_argument("--dispatch", choices=("codex", "claude"), help="Print dispatch JSON without invoking a model")
    target.add_argument("--resolve", choices=("codex", "claude", "claude_code"), help="Resolve complete versioned task dispatch JSON")
    parser.add_argument("--effort", choices=("medium", "high", "xhigh"), help="Task effort override with --dispatch or --resolve")
    parser.add_argument("--model", help="Exact task model override with --resolve")
    parser.add_argument("--work-kind", help="Role-specific task nature with --resolve")
    parser.add_argument("--risk", action="append", default=[], help="Repeatable task risk with --resolve")
    parser.add_argument("--policy-version", help="Required adopted policy version with --resolve")
    parser.add_argument("--pstack-defaults", type=json.loads, help="Already-read host-specific model/effort JSON with --resolve")
    parser.add_argument("--host-defaults", type=json.loads, help="Already-read host model/effort JSON with --resolve")
    parser.add_argument("--check", action="store_true", help="Read-only comparison with generated outputs")
    args = parser.parse_args(argv)
    if (args.check and not args.output) or (args.effort and not (args.dispatch or args.resolve)):
        parser.error("--check requires --output; --effort requires --dispatch or --resolve")
    resolve_options = (args.model, args.work_kind, args.risk, args.policy_version,
                       args.pstack_defaults, args.host_defaults)
    if any(value is not None and value != [] for value in resolve_options) and not args.resolve:
        parser.error("task resolution options require --resolve")
    if args.resolve and (not args.work_kind or not args.policy_version):
        parser.error("--resolve requires --work-kind and --policy-version")
    try:
        if args.resolve:
            overrides = {key: value for key, value in (("model", args.model), ("effort", args.effort)) if value is not None}
            result = resolve_dispatch(args.source.resolve(), args.resolve, args.work_kind,
                                      policy_version=args.policy_version, risks=args.risk, overrides=overrides,
                                      pstack_defaults=args.pstack_defaults, host_defaults=args.host_defaults)
            print(json.dumps(result, ensure_ascii=False))
            return 0
        if args.dispatch:
            print(json.dumps(dispatch_settings(args.source.resolve(), args.dispatch, args.effort), ensure_ascii=False))
            return 0
        outputs = render(args.source.resolve())
        deliver(outputs, args.output, args.check)
    except (OSError, ValueError, yaml.YAMLError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("PASS: paired output syntax and source consistency; host loading, permissions and model behavior not tested.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
