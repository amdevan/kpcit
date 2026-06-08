import { supabase } from "@/integrations/supabase/client";

export type AuditEvent = {
  action: string;
  entity?: string | null;
  entity_id?: string | null;
  target_user_id?: string | null;
  route?: string | null;
  details?: Record<string, unknown>;
};

/**
 * Best-effort audit logging. This should never block the user flow.
 *
 * Note: Requires the `user_audit_logs` table + RLS to be present in Supabase.
 */
export async function logAuditEvent(evt: AuditEvent) {
  try {
    const actor = (await supabase.auth.getUser()).data.user?.id;
    if (!actor) return;

    await (supabase as any).from("user_audit_logs").insert({
      actor_user_id: actor,
      action: evt.action,
      entity: evt.entity ?? null,
      entity_id: evt.entity_id ?? null,
      target_user_id: evt.target_user_id ?? null,
      route: evt.route ?? null,
      details: evt.details ?? {},
    });
  } catch {
    // ignore
  }
}

