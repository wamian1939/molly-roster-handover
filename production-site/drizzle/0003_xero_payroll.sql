CREATE TABLE payroll_documents (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX payroll_documents_kind_updated ON payroll_documents(kind,updated_at);
--> statement-breakpoint
CREATE TABLE payroll_locks(id TEXT PRIMARY KEY,owner TEXT NOT NULL,expires_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE payroll_audit(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,event TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX payroll_audit_created ON payroll_audit(created_at);
--> statement-breakpoint
