import type { PrismaClient } from "@prisma/client";
import { HttpError } from "../httpError.js";
export type Sql = { query(sql: string, args?: unknown[]): Promise<any[]> };
export const pgSql = (db: PrismaClient): Sql => ({
  query: (sql, args = []) => {
    let i = 0;
    return db.$queryRawUnsafe(
      sql.replace(/\?/g, () => `$${++i}`),
      ...args,
    ) as Promise<any[]>;
  },
});
export class PayrollError extends HttpError {
  constructor(
    status: number,
    message: string,
    readonly correlationId?: string,
  ) {
    super(status, message);
  }
}
export class PayrollStore {
  private leases = new Map<string, string>();
  constructor(readonly sql: Sql) {}
  async renew() {
    for (const [id, owner] of this.leases) {
      const r = await this.sql.query(
        "UPDATE payroll_locks SET expires_at=? WHERE id=? AND owner=? AND expires_at>? RETURNING id",
        [Date.now() + 240000, id, owner, Date.now()],
      );
      if (!r.length)
        throw new PayrollError(
          409,
          "Operation lease lost; refresh and reconcile before retry",
        );
    }
  }
  async get(id: string) {
    const r = await this.sql.query(
      "SELECT body,version FROM payroll_documents WHERE id=?",
      [id],
    );
    return r[0]
      ? { ...JSON.parse(r[0].body), _version: Number(r[0].version) }
      : null;
  }
  async list(kind: string) {
    return (
      await this.sql.query(
        "SELECT body,version FROM payroll_documents WHERE kind=? ORDER BY updated_at DESC",
        [kind],
      )
    ).map((r) => ({ ...JSON.parse(r.body), _version: Number(r.version) }));
  }
  async put(id: string, kind: string, value: any) {
    await this.renew();
    const { _version, ...body } = value;
    const rows = await this.sql.query(
      "INSERT INTO payroll_documents(id,kind,body,version,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,version=payroll_documents.version+1,updated_at=excluded.updated_at WHERE payroll_documents.version=? RETURNING version",
      [id, kind, JSON.stringify(body), new Date().toISOString(), _version ?? 0],
    );
    if (!rows.length) throw new PayrollError(409, "记录已变化，请重新加载");
    value._version = Number(rows[0].version);
    return value;
  }
  async audit(actor: string, event: string, body: any) {
    await this.sql.query(
      "INSERT INTO payroll_audit(id,actor_id,event,body,created_at) VALUES(?,?,?,?,?) RETURNING id",
      [
        crypto.randomUUID(),
        actor,
        event,
        JSON.stringify(body),
        new Date().toISOString(),
      ],
    );
  }
  async lock<T>(id: string, run: () => Promise<T>) {
    const owner = crypto.randomUUID(),
      now = Date.now();
    const rows = await this.sql.query(
      "INSERT INTO payroll_locks(id,owner,expires_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE payroll_locks.expires_at<? RETURNING owner",
      [id, owner, now + 240000, now],
    );
    if (!rows.length)
      throw new PayrollError(409, "Xero 操作正在进行，请稍后刷新状态");
    this.leases.set(id, owner);
    try {
      return await run();
    } finally {
      this.leases.delete(id);
      await this.sql.query(
        "DELETE FROM payroll_locks WHERE id=? AND owner=? RETURNING id",
        [id, owner],
      );
    }
  }
}
