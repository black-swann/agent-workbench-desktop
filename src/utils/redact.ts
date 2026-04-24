const SENSITIVE_KEY_PATTERN =
  /(api[_-]?key|auth|authorization|bearer|cookie|credential|password|secret|session|token)/i;

const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(sk-[A-Za-z0-9_-]{12,})\b/g,
  /\b([A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,})\b/g,
];

export function redactSensitive(value: unknown): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitive(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : redactSensitive(entry),
      ]),
    );
  }
  return value;
}

export function formatRedactedPayload(payload: unknown) {
  const redacted = redactSensitive(payload);
  if (redacted === undefined) {
    return "";
  }
  if (typeof redacted === "string") {
    return redacted;
  }
  try {
    return JSON.stringify(redacted, null, 2);
  } catch {
    return String(redacted);
  }
}

function redactString(value: string) {
  return SENSITIVE_VALUE_PATTERNS.reduce(
    (next, pattern) => next.replace(pattern, "[redacted]"),
    value,
  );
}
