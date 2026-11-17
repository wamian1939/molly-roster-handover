# Performance Notes API Contract

Daily Quick Notes are informal continuous feedback records. They are separate from formal period evaluations.

## Formal Evaluation vs Daily Quick Note

| Area | Formal Evaluation | Daily Quick Note |
| --- | --- | --- |
| Purpose | Official period score and history | Operational memory and coaching context |
| Timing | Evaluation period based | Any time |
| Scoring | Weighted final score | Optional `scoreImpact` from `-10` to `+10` |
| Lifecycle | OPEN live submission, CLOSED historical snapshot | Create and list only in this MVP |
| History | Drives official evaluation history | Visible reference material |
| Score effect | Calculates `finalScore` | Does not change `finalScore` yet |

## Data Shape

```ts
type PerformanceNote = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeStatus?: "Active" | "Archived";
  storeId: string;
  storeName: string;
  authorId: string;
  noteDate: string;
  noteType: "Positive" | "Negative" | "Neutral" | "Coaching";
  dimensions: Array<
    | "attitude"
    | "attendance"
    | "skill"
    | "pressureHandling"
    | "teamwork"
    | "execution"
    | "serviceQuality"
    | "growthPotential"
  >;
  scoreImpact?: number | null;
  noteText: string;
  createdAt: string;
  updatedAt: string;
};
```

## Endpoints

| Repository method | Backend endpoint | Classification | Notes |
| --- | --- | --- | --- |
| `listPerformanceNotes(params?)` | `GET /api/performance-notes` | API-authoritative read | Supports `employeeId`, `storeId`, `noteType`, `dimension`, `dateFrom`, `dateTo`, `page`, `pageSize`; failures are surfaced. |
| `getPerformanceNotesForEmployee(employeeId, params?)` | `GET /api/employees/:employeeId/performance-notes` | API-authoritative read | Used by employee detail and evaluation reference surfaces; failures are surfaced. |
| `createPerformanceNote(payload)` | `POST /api/performance-notes` | Write API-only | API failures are surfaced to the page; no mock fallback. |

## Create Payload

```ts
type PerformanceNoteMutationPayload = {
  employeeId: string;
  storeId: string;
  noteDate?: string;
  noteType: "Positive" | "Negative" | "Neutral" | "Coaching";
  dimensions: PerformanceNote["dimensions"];
  scoreImpact?: number | null;
  noteText: string;
};
```

Rules:

- `noteText` is required.
- `scoreImpact` must be between `-10` and `+10` when provided.
- `dimensions` may be empty.
- Backend sets `authorId` from the development auth context.
- Creating notes for archived employees is blocked with `409`.
- Notes do not mutate formal `Evaluation` scores or statuses.

## Access Control

Performance notes follow the development access-control rules in [Development Access Control](./access-control.md).

- Admin can read and write notes for all stores.
- AreaManager and StoreManager can read/write notes only for assigned stores.
- `403 Forbidden` responses are surfaced as authorization errors and never replaced with mock data.
- Historical notes for archived employees remain visible to users with store access.
- Adding new notes to archived employees is blocked by default.

## Frontend Integration

The Evaluation Form shows a Daily Quick Notes panel as reference material:

- recent note list
- Positive / Negative counts
- total score impact
- Add Quick Note dialog

The summary is informational only and does not affect formal score previews.
