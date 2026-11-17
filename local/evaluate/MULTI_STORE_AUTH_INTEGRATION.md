# Multi-store authentication integration

Contract version: `1.2.0`

Evaluate Molly remains the authority for account roles and Store access. Integrations must identify the authenticated account through the existing session, then apply the resolved authorization context on every request.

```ts
type AuthorizedAccount = {
  accountId: string;
  role: "ADMIN" | "STORE_EVALUATOR";
  storeIds: string[];
  canAccessAllStores: boolean;
};
```

- `ADMIN` access comes from `canAccessAllStores: true`; it does not require one relation per Store.
- `STORE_EVALUATOR` access is limited to the current `storeIds` returned from active Store assignments.
- Store assignments are loaded from the database for every protected request. An integration must not persist a Store permission snapshot in its own session.
- A request for an Employee, Evaluation, Round, or skill resource must resolve that resource's real `storeId` and check it against this context.
- Collection queries must use `WHERE storeId IN (authorizedStoreIds)` on the server. Client-side filtering is not an authorization boundary.
- Deleted, inactive, and zero-active-Store evaluator accounts are unauthorized.

Roster employee payloads now also include:

```ts
jobs: Array<{ id: string; name: string; colorToken: string }>;
```

These are read-only employee Store Job tags such as `全岗` and `带训员`. Evaluate
Molly remains their single source of truth. They are not roster calendar
`ShiftRole` values and are not employee skills; integrations must not create a
second job-definition model or automatically convert a Job into a ShiftRole.
