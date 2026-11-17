CREATE TABLE sites_epoch (id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
INSERT INTO sites_epoch(id,revision) VALUES(1,0);
--> statement-breakpoint
CREATE TABLE sites_guards (id TEXT PRIMARY KEY,valid INTEGER NOT NULL CHECK(valid = 1));
--> statement-breakpoint
CREATE TABLE sites_accounts (id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,body TEXT NOT NULL CHECK(json_valid(body)));
--> statement-breakpoint
CREATE TABLE sites_sessions (token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES sites_accounts(id),expires_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE sites_login_limits(id TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE sites_source(id TEXT PRIMARY KEY,body TEXT NOT NULL CHECK(json_valid(body)));
--> statement-breakpoint
CREATE TABLE sites_evaluate_archive(source_table TEXT NOT NULL,record_key TEXT NOT NULL,body TEXT NOT NULL CHECK(json_valid(body)),PRIMARY KEY(source_table,record_key));
--> statement-breakpoint
CREATE TABLE sites_imports(id TEXT PRIMARY KEY,content_hash TEXT NOT NULL,created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE sites_demo_sessions(token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE sites_demo_reports(account_id TEXT NOT NULL,week TEXT NOT NULL,revision INTEGER NOT NULL,updated_at TEXT NOT NULL,days TEXT NOT NULL CHECK(json_valid(days)),PRIMARY KEY(account_id,week));
