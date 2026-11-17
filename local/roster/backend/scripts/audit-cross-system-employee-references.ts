import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const rosterUrl = process.env.DATABASE_URL;
const evaluateUrl = process.env.EVALUATE_DATABASE_URL;
if (!rosterUrl || !evaluateUrl) throw new Error("DATABASE_URL and EVALUATE_DATABASE_URL are required.");

function assertLocalDatabase(value: string, name: string, port: string) {
  const url = new URL(value);
  if (!["localhost", "127.0.0.1"].includes(url.hostname)
    || url.port !== port || url.pathname !== `/${name}`
    || (url.searchParams.get("schema") ?? "public") !== "public") {
    throw new Error(`Audit is restricted to the local ${name}.public development database.`);
  }
}

assertLocalDatabase(rosterUrl, "molly_roster", "5433");
assertLocalDatabase(evaluateUrl, "evaluate_molly", "5432");

const roster = new PrismaClient({ datasourceUrl: rosterUrl });
// This client uses only a fixed read-only SQL query; it does not own Evaluate's schema.
const evaluate = new PrismaClient({ datasourceUrl: evaluateUrl });
try {
  const [employees, assignments, availability, publications] = await Promise.all([
    evaluate.$queryRaw<Array<{ id: string; storeId: string; status: string }>>`
      SELECT id, "storeId", status::text AS status FROM employees
    `,
    roster.shiftAssignment.findMany({ select: {
      employeeId: true,
      shift: { select: { storeId: true, rosterPeriod: { select: { status: true } } } },
    } }),
    roster.employeeAvailability.findMany({ select: { employeeId: true, storeId: true } }),
    roster.rosterPublication.findMany({ select: { snapshot: true } }),
  ]);

  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  let malformedPublicationSnapshots = 0;
  const publicationEmployeeIds: string[] = [];
  for (const publication of publications) {
    const snapshot = publication.snapshot;
    if (!isRecord(snapshot) || !Array.isArray(snapshot.shifts)) {
      malformedPublicationSnapshots++;
      continue;
    }
    for (const shift of snapshot.shifts) {
      if (!isRecord(shift) || !Array.isArray(shift.assignments)) {
        malformedPublicationSnapshots++;
        continue;
      }
      for (const assignment of shift.assignments) {
        if (!isRecord(assignment) || typeof assignment.employeeId !== "string" || !assignment.employeeId) {
          malformedPublicationSnapshots++;
          continue;
        }
        publicationEmployeeIds.push(assignment.employeeId);
      }
    }
  }
  const referenceIds = new Set([...assignments.map((row) => row.employeeId), ...availability.map((row) => row.employeeId), ...publicationEmployeeIds]);
  const drafts = assignments.filter((row) => row.shift.rosterPeriod.status === "DRAFT");
  const published = assignments.filter((row) => row.shift.rosterPeriod.status === "PUBLISHED");
  console.log(JSON.stringify({
    scope: "read-only local development cross-database snapshot; counts only; no employee names or HR values",
    canonicalEmployees: employees.length,
    rosterReferencedEmployeeIds: referenceIds.size,
    referencedIdsMissingFromEvaluate: [...referenceIds].filter((id) => !byId.has(id)).length,
    draftAssignments: drafts.length,
    draftAssignmentsMissingEmployee: drafts.filter((row) => !byId.has(row.employeeId)).length,
    draftAssignmentsWithInactiveEmployee: drafts.filter((row) => byId.has(row.employeeId) && byId.get(row.employeeId)?.status !== "Active").length,
    draftAssignmentsWrongCurrentStore: drafts.filter((row) => byId.has(row.employeeId) && byId.get(row.employeeId)?.storeId !== row.shift.storeId).length,
    publishedAssignments: published.length,
    publishedAssignmentsWithHistoricalStoreOrStatusChange: published.filter((row) => {
      const employee = byId.get(row.employeeId);
      return employee && (employee.storeId !== row.shift.storeId || employee.status !== "Active");
    }).length,
    availabilityRows: availability.length,
    availabilityEmployeeIdsMissingFromEvaluate: new Set(availability.filter((row) => !byId.has(row.employeeId)).map((row) => row.employeeId)).size,
    availabilityRowsOutsideCurrentEmployeeStore: availability.filter((row) => byId.has(row.employeeId) && byId.get(row.employeeId)?.storeId !== row.storeId).length,
    publicationRevisions: publications.length,
    publicationSnapshotAssignments: publicationEmployeeIds.length,
    publicationSnapshotIdsMissingFromEvaluate: new Set(publicationEmployeeIds.filter((id) => !byId.has(id))).size,
    malformedPublicationSnapshotEntries: malformedPublicationSnapshots,
    note: "Published assignments and past availability are historical; current-store differences there are review signals, not automatic data repairs. These separate databases do not share a transaction.",
  }, null, 2));
} finally {
  await Promise.all([roster.$disconnect(), evaluate.$disconnect()]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
