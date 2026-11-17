# Employee Management API Contract

Employee Management owns employee CRUD, archive, restore, and list filtering. Evaluation pages continue to access evaluation data through `evaluationRepository`.

Access control is documented in [Access Control](./access-control.md). Browser requests use the current database-backed session, and `403 Forbidden` responses are surfaced as errors instead of being replaced with mock data.

## Repository Methods

| Repository method | Backend endpoint | Frontend consumer | Classification | Failure behavior |
| --- | --- | --- | --- | --- |
| `fetchEmployees(params?)` | `GET /api/employees?storeId=:storeId&page=:page&pageSize=:pageSize&search=:search&employeeType=:employeeType&employmentType=:employmentType&status=:status` | Employee Management page | Summary-only read | Never returns sensitive HR fields. |
| `fetchEmployeesByStore(storeId, params?)` | `GET /api/stores/:storeId/employees?...` | Store-scoped employee management | API-authoritative read | Surfaces API and authorization errors. |
| `fetchEmployee(employeeId)` | `GET /api/employees/:employeeId` | Employee detail surfaces | API-authoritative read | Surfaces API and authorization errors. |
| `fetchEmployeeProfile(employeeId)` | `GET /api/employees/:employeeId/profile` | ADMIN Employee Profile/Edit | Admin-only sensitive read | Returns the full HR profile; STORE_EVALUATOR receives `403`. |
| `createEmployee(payload)` | `POST /api/employees` | Employee Management form | Write API-only | No mock fallback. |
| `updateEmployee(employeeId, payload)` | `PUT /api/employees/:employeeId` | Employee Management form | Write API-only | No mock fallback. |
| `promoteToRegular(employeeId)` | `POST /api/employees/:employeeId/promote-to-regular` | ADMIN Employee Management and Employee Detail | ADMIN-only employee transition | Changes only the current Employee type. Skills, profile, rounds, and historical snapshots retain their identities. |
| `archiveEmployee(employeeId)` | `POST /api/employees/:employeeId/archive` | Employee Management table | Write API-only | No mock fallback. |
| `restoreEmployee(employeeId)` | `POST /api/employees/:employeeId/restore` | Employee Management table | Write API-only | No mock fallback. |

Employee list rows expose the requesting account's current OPEN-round submission, if one exists. Active employees always provide `评分` or `再次评分`; archived employees remain history-only until restored.

Opening, closing, and weekly cleaning are ordinary weighted `BINARY` skills. They are represented through `SkillDefinition` and `EmployeeSkill`, not employee-level qualification fields or voting APIs. A Training-to-Regular transition preserves the employee ID and all related records; an existing OPEN round keeps its Training snapshot, while the next round uses the current Regular policy.

## Failure behavior

Employee reads and writes are API-authoritative and never fall back to mock data. Network, authentication, authorization, validation, and server failures are surfaced to the page through the normal error state; a `403` is never converted into demonstration data.

## Employee Shape

```ts
type Employee = {
  id: string;
  storeId: string;
  storeName?: string;
  displayName: string;
  employeeType: "TRAINING" | "REGULAR";
  employmentType: "Full-time" | "Part-time" | "Casual";
  employmentCommencementDate: string | null;
  tenureMonths: number | null;
  status: "Active" | "Archived";
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  evaluationCount?: number;
};
```

Legal name, contact, address, visa, banking, tax, and superannuation fields are available only through the admin-only profile endpoint. Employee lists, evaluation pages, search, Skill Board, Dashboard, and Analytics use the summary DTO and never receive those fields.

## List Response

```ts
type PaginatedEmployeeResponse = {
  items: Employee[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
```

## Archive Semantics

Archiving updates `status` to `Archived` and sets `archivedAt`. It does not delete the employee and does not delete evaluations. Completed history remains linked through the original employee ID.

Evaluation dashboards, current store evaluation lists, and current-period analytics treat `Active` employees as the operational workforce. Archived employees remain available through CLOSED-round history but cannot receive a new live submission.
