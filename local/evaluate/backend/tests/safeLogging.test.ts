import { describe, expect, it } from "vitest";
import { describeErrorForLog, redactSensitiveLogText } from "../src/safeLogging.js";

describe("PII-safe logging", () => {
  it("redacts sensitive employee profile values in key-value and JSON text", () => {
    const input = 'taxFileNumber=123456789 bankAccountNumber:987654321 bsbNumber=062000 dateOfBirth=1990-01-01 addressLine="1 Main Street" suburb=Hurstville postcode=2220 mobileTelephoneNumber=0412345678 superannuationAccountNumber=SUPER123 uniqueSuperannuationIdentifier=USI123 superannuationCompany=FUND visaType=WHV DATABASE_URL=postgresql://secret@localhost/db';
    const redacted = redactSensitiveLogText(input);

    expect(redacted).not.toMatch(/123456789|987654321|062000|1990-01-01|Hurstville|2220|0412345678|SUPER123|USI123|FUND|WHV|secret/);
    expect(redacted.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(13);
  });

  it("redacts sensitive values embedded in error messages and stacks", () => {
    const result = describeErrorForLog(new Error('{"taxFileNumber":"123456789","bankAccountNumber":"987654321"}'));
    expect(JSON.stringify(result)).not.toMatch(/123456789|987654321/);
  });
});
