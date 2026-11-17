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
    .replace(/((?:password|token|cookie|authorization|database_url|api[_-]?key|taxFileNumber|tfn|bankAccountName|bankAccountNumber|bsbNumber|bsb|dateOfBirth|addressLine|suburb|state|postcode|emailAddress|mobileTelephoneNumber|abn|holdsWorkingHolidayVisa|superannuationCompany|superannuationAccountNumber|uniqueSuperannuationIdentifier|visaType)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1[REDACTED]")
    .replace(/("(?:taxFileNumber|tfn|bankAccountName|bankAccountNumber|bsbNumber|bsb|dateOfBirth|addressLine|suburb|state|postcode|emailAddress|mobileTelephoneNumber|abn|holdsWorkingHolidayVisa|superannuationCompany|superannuationAccountNumber|uniqueSuperannuationIdentifier|visaType)"\s*:\s*)"[^"]*"/gi, "$1\"[REDACTED]\"");
}
