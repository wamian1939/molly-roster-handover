export function describeErrorForLog(error: unknown) {
  if (!(error instanceof Error)) return { errorName: "UnknownError", errorMessage: redactSensitiveLogText(String(error)) };
  return {
    errorName: error.name,
    errorMessage: redactSensitiveLogText(error.message),
    errorStack: error.stack ? redactSensitiveLogText(error.stack) : undefined,
  };
}

export function redactSensitiveLogText(value: string) {
  return value
    .replace(/\b(postgres(?:ql)?):\/\/[^@\s]+@/gi, "$1://[REDACTED]@")
    .replace(/((?:password|token|cookie|authorization|database_url|api[_-]?key|taxFileNumber|tfn|bankAccount|bsb|dateOfBirth|address|email|mobile|superannuation|visa)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1[REDACTED]");
}

