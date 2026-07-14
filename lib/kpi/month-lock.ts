import type { AuditEntry } from "./types.ts";

export type MonthSnapshot = { id: string; month: string; version: number; status: "draft" | "approved" | "locked" | "superseded"; payload: Readonly<Record<string, unknown>>; auditTrail: AuditEntry[]; approvedBy?: string | null; approvedAt?: string | null; lockedBy?: string | null; lockedAt?: string | null };

export function approveSnapshot(snapshot: MonthSnapshot, actor: string, at = new Date().toISOString()): MonthSnapshot {
  if (snapshot.status !== "draft") throw new Error("Only a draft snapshot can be approved.");
  return { ...snapshot, status: "approved", approvedBy: actor, approvedAt: at, auditTrail: [...snapshot.auditTrail, { action: "approved", actor, at }] };
}

export function lockSnapshot(snapshot: MonthSnapshot, actor: string, at = new Date().toISOString()): MonthSnapshot {
  if (snapshot.status !== "approved") throw new Error("Only an approved snapshot can be locked.");
  return Object.freeze({ ...snapshot, status: "locked", lockedBy: actor, lockedAt: at, payload: Object.freeze({ ...snapshot.payload }), auditTrail: [...snapshot.auditTrail, { action: "locked", actor, at }] });
}

export function reopenSnapshot(snapshot: MonthSnapshot, actor: string, reason: string, newId: string, at = new Date().toISOString()): { previous: MonthSnapshot; next: MonthSnapshot } {
  if (snapshot.status !== "locked") throw new Error("Only a locked snapshot can be reopened.");
  if (!reason.trim()) throw new Error("A reopen reason is required.");
  const audit = { action: "reopened", actor, reason: reason.trim(), at };
  return {
    previous: { ...snapshot, status: "superseded", auditTrail: [...snapshot.auditTrail, audit] },
    next: { id: newId, month: snapshot.month, version: snapshot.version + 1, status: "draft", payload: Object.freeze({ ...snapshot.payload }), auditTrail: [...snapshot.auditTrail, audit] },
  };
}
