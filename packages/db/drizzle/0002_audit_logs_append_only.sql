-- =============================================================================
-- 0002 — make `audit_logs` append-only, enforced by the database
--
-- WHY A TRIGGER INSTEAD OF APPLICATION DISCIPLINE
--
-- OWASP Top 10 A09:2021 (Security Logging and Monitoring Failures) requires log
-- records to be tamper-evident. An audit table that privileged code can UPDATE is
-- not evidence — and the code paths that would rewrite it are exactly the ones
-- hardest to review, because they are the ones that run with elevated privileges
-- during an incident.
--
-- Enforcing the rule in Postgres means the guarantee does not depend on any
-- particular call site having been read correctly. There is no code path — in
-- this application or any future one — that can express "rewrite history" without
-- first dropping this trigger.
--
-- ---------------------------------------------------------------------------
-- STATEMENT-LEVEL, NOT ROW-LEVEL
-- ---------------------------------------------------------------------------
--
-- `FOR EACH STATEMENT` is the correct granularity for append-only. A row-level
-- trigger fires once per affected row, so `DELETE FROM audit_logs` without a
-- WHERE clause would run it N times and raise N exceptions; more importantly it
-- makes the trigger body responsible for reasoning about rows it does not need to
-- inspect. Statement-level makes the rule trivially correct: this statement
-- touches audit_logs, so it is refused.
--
-- ---------------------------------------------------------------------------
-- `pg_trigger_depth()` — WHY IT IS ABSENT
-- ---------------------------------------------------------------------------
--
-- Earlier revisions of this file documented a `pg_trigger_depth() > 1` escape
-- hatch for cascading triggers. That guard is NOT here, and an earlier comment
-- claiming otherwise was simply wrong. Two reasons it should not be:
--
--   1. There is no cascading path that legitimately needs to modify this table,
--      so the hatch would guard nothing.
--   2. `pg_trigger_depth()` is trivially attacker-influenced in some setups and
--      is not a security boundary. A documented escape hatch on an append-only
--      table is a liability, because the next person to find a reason to use it
--      will be a legitimate-looking maintenance task that silently un-guards the
--      whole table.
--
-- LEGAL MAINTENANCE is still possible, deliberately and visibly: a superuser can
-- `ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_append_only`, do the work,
-- and re-enable it. That path leaves a trace in the PostgreSQL log, requires
-- superuser, and cannot be reached by the application role. A guard that the
-- application role can satisfy is not a guard.
--
-- ---------------------------------------------------------------------------
-- PROVIDER NEUTRALITY
-- ---------------------------------------------------------------------------
--
-- Plain PL/pgSQL with `CREATE OR REPLACE FUNCTION` and `CREATE TRIGGER`. No
-- extension, no superuser requirement, nothing Supabase-specific or
-- container-specific. Identical on both (ADR 0004).
--
-- `DROP TRIGGER IF EXISTS` first makes this re-runnable.
-- =============================================================================

CREATE OR REPLACE FUNCTION audit_logs_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'audit_logs is append-only: % is not permitted. See packages/db/drizzle/0002_audit_logs_append_only.sql for the maintenance procedure.',
    TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;

CREATE TRIGGER audit_logs_append_only
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH STATEMENT
EXECUTE FUNCTION audit_logs_append_only();

COMMENT ON TABLE audit_logs IS
  'Append-only audit trail. UPDATE and DELETE are refused by trigger; see migration 0002. Does NOT include credentials, tokens or cookies.';
