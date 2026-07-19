export type MissionSafetyFailure =
  | "control_character"
  | "html"
  | "file_or_path"
  | "invented_repository_fact"
  | "destructive_action"
  | "shell_command"
  | "external_boundary"
  | "credential_request"
  | "prompt_injection"
  | "approval_bypass";

export type MissionSafetyResult =
  | { safe: true }
  | { safe: false; reason: MissionSafetyFailure };

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127;
  });
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

const FILE_EXTENSION_PATTERN =
  /\b[\p{L}\p{N}_-]+\.(?:md|mdx|txt|json|ya?ml|toml|env|js|jsx|ts|tsx|css|scss|html|sql|py|java|kt|go|rs|rb|php|sh|bash|zsh|xml|csv)\b/iu;
const PATH_PATTERN =
  /(?:^|\s)(?:\.\.?[/\\]|~[/\\]|[/\\][\p{L}\p{N}_.-]+|[\p{L}\p{N}_.-]+[/\\][\p{L}\p{N}_.-]+)/iu;

/** Deterministic backstop for untrusted mission prose. */
export function validateMissionTextSafety(
  values: string[],
  options: { checkPaths?: boolean } = {}
): MissionSafetyResult {
  const checkPaths = options.checkPaths ?? true;

  for (const original of values) {
    if (containsControlCharacter(original)) {
      return { safe: false, reason: "control_character" };
    }
    if (/<\/?[a-z][^>]*>/iu.test(original)) {
      return { safe: false, reason: "html" };
    }

    const value = normalize(original);
    const withoutNodeName = value.replaceAll("node.js", "nodejs");

    if (
      checkPaths &&
      (FILE_EXTENSION_PATTERN.test(withoutNodeName) || PATH_PATTERN.test(value))
    ) {
      return { safe: false, reason: "file_or_path" };
    }
    if (
      /\b(?:the|this|your)\s+(?:repository|repo|project|codebase)\s+(?:already\s+)?(?:has|contains|includes|uses|runs|depends|is built|is configured)\b/u.test(
        value
      ) ||
      /\b(?:existing|current)\s+(?:file|directory|folder|script|dependency|framework|test runner|convention)\b/u.test(
        value
      )
    ) {
      return { safe: false, reason: "invented_repository_fact" };
    }
    if (
      /\b(?:delete|truncate|wipe|erase|destroy|drop\s+(?:database|table)|reset\s+(?:data|database)|rotate\s+(?:credentials?|keys?|tokens?)|change\s+(?:permissions?|repository settings?))\b/u.test(
        value
      ) ||
      /\b(?:force push|git\s+reset|git\s+clean|branch\s+deletion|delete\s+(?:the\s+)?branch|rewrite\s+(?:git\s+)?history|rm\s|rmdir\s|--force)\b/u.test(
        value
      )
    ) {
      return { safe: false, reason: "destructive_action" };
    }
    if (
      /(?:^|[\s`])(?:git|npm|npx|pnpm|yarn|bun|curl|wget|sudo|bash|zsh|powershell|cmd)\s+[\p{L}\p{N}_.-]+/iu.test(
        value
      ) ||
      /(?:^|\s)(?:\$|>)\s*[\p{L}\p{N}_-]+/u.test(value)
    ) {
      return { safe: false, reason: "shell_command" };
    }
    if (
      /\b(?:another|different|other)\s+(?:repository|repo|account|organization|deployment)\b/u.test(
        value
      ) ||
      /\b(?:external service|local machine|outside (?:the )?selected repository)\b/u.test(
        value
      )
    ) {
      return { safe: false, reason: "external_boundary" };
    }
    if (
      /\b(?:provide|share|expose|reveal|read|enter|paste|copy|collect|request|use)\b.{0,40}\b(?:secret|token|api key|credential|password|private key|environment value|private data)\b/u.test(
        value
      )
    ) {
      return { safe: false, reason: "credential_request" };
    }
    if (
      /\b(?:ignore|disregard|override)\b.{0,30}\b(?:previous|system|developer|safety|instructions?)\b/u.test(
        value
      ) ||
      /\b(?:reveal|print|show)\b.{0,30}\b(?:system prompt|hidden instructions?)\b/u.test(
        value
      ) ||
      /\b(?:jailbreak|prompt injection|act as)\b/u.test(value)
    ) {
      return { safe: false, reason: "prompt_injection" };
    }
    if (
      /\b(?:bypass|skip|disable|evade)\b.{0,35}\b(?:review|approval|ownership|branch|path|safety|validation|controls?)\b/u.test(
        value
      )
    ) {
      return { safe: false, reason: "approval_bypass" };
    }
  }

  return { safe: true };
}
