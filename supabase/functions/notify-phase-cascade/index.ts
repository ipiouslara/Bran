// @ts-nocheck: Disable strict type checks for Edge Function
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PhaseShiftPayload {
  event_id?: string;
  actor_id?: string;
  project_id?: string;
  project_name?: string;
  edited_phase_id?: string;
  phase_name?: string;
  field_edited?: string;
  original_date?: string;
  new_target_date?: string;
  shifted_business_days?: number;
  affected_phases?: Array<{
    phase_id?: string;
    phase_name?: string;
    old_end?: string;
    new_end?: string;
    assigned_to?: string;
  }>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: PhaseShiftPayload = await req.json();

    const {
      event_id,
      actor_id,
      project_id,
      project_name = "Project",
      edited_phase_id,
      phase_name = "Phase",
      field_edited = "date",
      original_date = "N/A",
      new_target_date = "N/A",
      shifted_business_days = 0,
      affected_phases = []
    } = body;

    // Collect all recipient user IDs (PM owner + assigned resources)
    const recipientIds = new Set<string>();

    // 1. Fetch Project Owner (PM)
    if (project_id) {
      const { data: proj } = await supabase
        .from("projects")
        .select("owner_id")
        .eq("id", project_id)
        .maybeSingle();

      if (proj?.owner_id) {
        recipientIds.add(proj.owner_id);
      }
    }

    // 2. Fetch Assigned Resource for edited phase
    if (edited_phase_id) {
      const { data: ph } = await supabase
        .from("phases")
        .select("assigned_to")
        .eq("id", edited_phase_id)
        .maybeSingle();

      if (ph?.assigned_to) {
        recipientIds.add(ph.assigned_to);
      }
    }

    // 3. Add Assigned Resources for cascaded phases
    affected_phases.forEach(ap => {
      if (ap.assigned_to) {
        recipientIds.add(ap.assigned_to);
      }
    });

    // Remove actor (the user triggering the shift) from receiving self-notification
    if (actor_id) {
      recipientIds.delete(actor_id);
    }

    const recipientList = Array.from(recipientIds);
    if (recipientList.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No recipients found for notification", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Format human-readable message
    const shiftDirection = shifted_business_days >= 0 ? `+${shifted_business_days}` : `${shifted_business_days}`;
    const cascadeCount = affected_phases.length;
    const message = `[${project_name}] ${phase_name} target date shifted from ${original_date} to ${new_target_date} (${shiftDirection} business days). ${cascadeCount > 0 ? `${cascadeCount} cascaded phase(s) rescheduled.` : ''}`;

    const metadata = {
      project_id,
      project_name,
      edited_phase_id,
      phase_name,
      field_edited,
      original_date,
      new_target_date,
      shifted_business_days,
      affected_phases_count: cascadeCount
    };

    // Prepare DB inserts
    const notificationInserts = recipientList.map(recipientId => ({
      recipient_id: recipientId,
      phase_id: edited_phase_id || null,
      event_id: event_id || null,
      type: "date_changed",
      message: message,
      metadata: metadata,
      is_read: false
    }));

    const { error: insertErr } = await supabase
      .from("notifications")
      .insert(notificationInserts);

    if (insertErr) {
      // Fallback without event_id & metadata if table columns haven't been added yet
      console.warn("Retrying notification insert with basic schema fallback:", insertErr.message);
      const fallbackInserts = recipientList.map(recipientId => ({
        recipient_id: recipientId,
        phase_id: edited_phase_id || null,
        type: "date_changed",
        message: message,
        is_read: false
      }));

      await supabase.from("notifications").insert(fallbackInserts);
    }

    console.log(`Dispatched ${recipientList.length} notifications for event ${event_id || 'N/A'}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Dispatched ${recipientList.length} notifications`, 
        count: recipientList.length,
        event_id 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    console.error("Error in notify-phase-cascade Edge Function:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage || "Internal server error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
