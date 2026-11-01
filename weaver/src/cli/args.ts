import { WeaverError } from "../contracts/errors.ts";
import {
  COMMANDS,
  FLAG_SPECS,
  GLOBAL_FLAG_NAMES,
  commandKey,
  commandFlags,
  findCommand,
  matchNamespace,
  scopeHelp,
  type CommandSpec,
  type RequirementCondition,
} from "./commands.ts";

export type OptionValue = string | boolean;

export type ParsedArgs = {
  readonly words: readonly string[];
  readonly options: Readonly<Record<string, OptionValue>>;
  readonly unknownFlags: readonly string[];
};

export type CommandInvocation = {
  readonly kind: "command";
  readonly parsed: ParsedArgs;
  readonly spec: CommandSpec;
  readonly positionals: readonly string[];
};

export type HelpInvocation = {
  readonly kind: "help";
  readonly parsed: ParsedArgs;
  readonly scope: readonly string[];
};

export type Invocation = CommandInvocation | HelpInvocation;

const globalFlags = new Set<string>(GLOBAL_FLAG_NAMES);

function isOptionToken(value: string): boolean {
  return value.startsWith("--") || value === "-h";
}

function booleanValue(raw: string | undefined): boolean {
  if (raw === undefined) return true;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new WeaverError(
    "INVALID_INPUT",
    `布尔参数只接受 true 或 false，收到 ${raw}`,
  );
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const words: string[] = [],
    options: Record<string, OptionValue> = {},
    unknownFlags: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--") {
      words.push(...argv.slice(index + 1));
      break;
    }
    if (arg.startsWith("-") && !arg.startsWith("--")) {
      unknownFlags.push(arg);
      continue;
    }
    if (!arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    const equals = arg.indexOf("="),
      name = arg.slice(2, equals < 0 ? undefined : equals),
      inline = equals < 0 ? undefined : arg.slice(equals + 1),
      spec = FLAG_SPECS.get(name);
    if (!spec) {
      unknownFlags.push(arg);
      continue;
    }
    if (spec.value === "none") {
      const next = argv[index + 1];
      if (inline === undefined && (next === "true" || next === "false")) {
        options[name] = booleanValue(next);
        index += 1;
      } else options[name] = booleanValue(inline);
      continue;
    }
    if (inline !== undefined) {
      options[name] = inline;
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !isOptionToken(next)) {
      options[name] = next;
      index += 1;
    } else {
      options[name] = "";
    }
  }
  return { words, options, unknownFlags };
}

export function textOption(
  parsed: ParsedArgs,
  name: string,
): string | undefined {
  const value = parsed.options[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function booleanOption(parsed: ParsedArgs, name: string): boolean {
  return parsed.options[name] === true;
}

function editDistance(left: string, right: string): number {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution =
        (previous[rightIndex - 1] ?? 0) +
        (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        substitution,
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}

function closest(
  value: string,
  candidates: readonly string[],
): string | undefined {
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      distance: editDistance(value, candidate),
    }))
    .sort((left, right) => left.distance - right.distance);
  const first = ranked[0];
  return first && first.distance <= 2 ? first.candidate : undefined;
}

function optionName(raw: string): string {
  const equals = raw.indexOf("=");
  return raw.startsWith("--")
    ? raw.slice(2, equals < 0 ? undefined : equals)
    : raw;
}

function rootCommandNames(): string[] {
  const seen = new Set<string>();
  for (const command of COMMANDS) seen.add(command.path[0] || "");
  seen.delete("");
  return [...seen];
}

function namespaceForHelp(
  words: readonly string[],
): readonly string[] | undefined {
  return findCommand(words)?.path || matchNamespace(words);
}

export function resolveInvocation(parsed: ParsedArgs): Invocation {
  if (booleanOption(parsed, "json") && booleanOption(parsed, "human"))
    throw new WeaverError("INVALID_INPUT", "--json 与 --human 互斥", null, [
      "选择机器输出用 --json，终端摘要用 --human",
    ]);

  const trailingNamespaceHelp =
    parsed.words.length > 1 &&
    parsed.words.at(-1) === "help" &&
    !findCommand(parsed.words.slice(0, -1)) &&
    matchNamespace(parsed.words.slice(0, -1))?.length ===
      parsed.words.length - 1;
  const wantsHelp =
    booleanOption(parsed, "help") ||
    parsed.words.length === 0 ||
    parsed.words[0] === "help" ||
    trailingNamespaceHelp;
  if (wantsHelp) {
    const helpWords =
      parsed.words[0] === "help"
        ? parsed.words.slice(1)
        : trailingNamespaceHelp
          ? parsed.words.slice(0, -1)
          : parsed.words;
    if (!helpWords.length) return { kind: "help", parsed, scope: [] };
    const scope = namespaceForHelp(helpWords);
    if (!scope)
      throw new WeaverError(
        "INVALID_INPUT",
        `未知帮助作用域 ${helpWords.join(" ")}`,
        null,
        ["运行 weaver --help 查看命令分组"],
      );
    return { kind: "help", parsed, scope };
  }

  if (parsed.unknownFlags.length) {
    const raw = parsed.unknownFlags[0] || "",
      name = optionName(raw),
      knownNames = [...FLAG_SPECS.keys()],
      suggestion = closest(name, knownNames);
    throw new WeaverError(
      "INVALID_INPUT",
      `未知参数 ${parsed.unknownFlags.join(", ")}`,
      { flags: parsed.unknownFlags },
      [
        suggestion ? `是否想使用 --${suggestion}？` : "",
        "运行 weaver --help 查看命令分组",
      ].filter(Boolean),
    );
  }

  const spec = findCommand(parsed.words);
  if (!spec) {
    const namespace = matchNamespace(parsed.words);
    if (namespace && parsed.words.length === namespace.length)
      return { kind: "help", parsed, scope: namespace };
    if (namespace)
      throw new WeaverError(
        "INVALID_INPUT",
        `未知子命令 ${parsed.words.slice(namespace.length).join(" ")}`,
        {
          namespace: namespace.join(" "),
          unexpected: parsed.words.slice(namespace.length),
        },
        [`运行 weaver ${namespace.join(" ")} --help 查看可用子命令`],
      );
    const first = parsed.words[0] || "",
      suggestion = closest(first, rootCommandNames());
    throw new WeaverError(
      "INVALID_INPUT",
      `未知命令 ${first}`,
      { command: first },
      [
        suggestion ? `是否想运行 weaver ${suggestion} --help？` : "",
        "运行 weaver --help 查看命令分组",
      ].filter(Boolean),
    );
  }

  const allowed = new Set<string>([...globalFlags, ...commandFlags(spec)]),
    unsupported = Object.keys(parsed.options).filter(
      (name) => !allowed.has(name),
    );
  if (unsupported.length)
    throw new WeaverError(
      "INVALID_INPUT",
      `命令 ${commandKey(spec)} 不支持参数 ${unsupported.map((name) => `--${name}`).join(", ")}`,
      { command: commandKey(spec), flags: unsupported },
      [`查看可用参数: weaver ${commandKey(spec)} --help`],
    );

  for (const flag of commandFlags(spec)) {
    const flagSpec = FLAG_SPECS.get(flag);
    const value = parsed.options[flag];
    if (
      flagSpec?.choices?.length &&
      typeof value === "string" &&
      value.length > 0 &&
      !flagSpec.choices.includes(value)
    )
      throw new WeaverError(
        "INVALID_INPUT",
        `--${flag} 只接受 ${flagSpec.choices.join("|")}`,
        { flag, value, choices: flagSpec.choices },
        [`查看命令帮助: weaver ${commandKey(spec)} --help`],
      );
  }

  for (const pair of spec.exclusiveFlags || []) {
    if (
      pair.every(
        (flag) =>
          parsed.options[flag] !== undefined && parsed.options[flag] !== false,
      )
    )
      throw new WeaverError(
        "INVALID_INPUT",
        `${pair.map((flag) => `--${flag}`).join(" 与 ")} 不能同时启用`,
        { flags: pair },
        [`只保留一个参数，或运行 weaver ${commandKey(spec)} --help`],
      );
  }

  if (booleanOption(parsed, "progress") && !booleanOption(parsed, "wait"))
    throw new WeaverError(
      "INVALID_INPUT",
      "--progress 需要与 --wait 一起使用",
      null,
      [`添加 --wait，或删除 --progress`],
    );

  return {
    kind: "command",
    parsed,
    spec,
    positionals: parsed.words.slice(spec.path.length),
  };
}

function conditionMatches(
  parsed: ParsedArgs,
  condition: RequirementCondition,
): boolean {
  const value = parsed.options[condition.name];
  if (condition.absent) return value === undefined || value === false;
  if (condition.present)
    return typeof value === "string" ? value.length > 0 : value !== undefined;
  if (condition.equals)
    return typeof value === "string" && condition.equals.includes(value);
  return false;
}

function requirementMatches(
  parsed: ParsedArgs,
  conditions: readonly RequirementCondition[] | undefined,
): boolean {
  return (
    !conditions?.length ||
    conditions.every((condition) => conditionMatches(parsed, condition))
  );
}

export function validateCommandInvocation(invocation: CommandInvocation): void {
  const { spec, parsed, positionals } = invocation,
    maximum = spec.positionals?.length || 0,
    missing: string[] = [];
  if (positionals.length > maximum)
    throw new WeaverError(
      "INVALID_INPUT",
      `命令 ${commandKey(spec)} 收到多余位置参数 ${positionals.slice(maximum).join(" ")}`,
      { unexpected: positionals.slice(maximum) },
      [`查看命令用法: weaver ${commandKey(spec)} --help`],
    );

  for (const [index, positional] of (spec.positionals || []).entries())
    if (positional.required && !positionals[index])
      missing.push(`<${positional.name}>`);

  for (const name of commandFlags(spec)) {
    const flagSpec = FLAG_SPECS.get(name);
    if (
      flagSpec?.value === "text" &&
      name in parsed.options &&
      textOption(parsed, name) === undefined
    )
      missing.push(`--${name}`);
  }

  for (const requirement of spec.requirements || []) {
    if (requirement.kind === "flag") {
      if (
        requirementMatches(parsed, requirement.conditions) &&
        textOption(parsed, requirement.name) === undefined
      )
        missing.push(`--${requirement.name}`);
      continue;
    }
    const present = requirement.choices.some((choice) =>
      choice.kind === "flag"
        ? textOption(parsed, choice.name) !== undefined
        : !!positionals[
            spec.positionals?.findIndex(
              (positional) => positional.name === choice.name,
            ) ?? -1
          ],
    );
    if (!present) missing.push(requirement.label);
  }

  if (missing.length)
    throw new WeaverError(
      "INVALID_INPUT",
      `缺少必填参数或参数值: ${[...new Set(missing)].join(", ")}`,
      { command: commandKey(spec), missing: [...new Set(missing)] },
      [
        `用法: weaver ${spec.synopsis}`,
        `查看帮助: weaver ${commandKey(spec)} --help`,
      ],
    );
}

export function resolveHelp(parsed: ParsedArgs, scope: readonly string[]) {
  return scope.length ? scopeHelp(scope) : undefined;
}
