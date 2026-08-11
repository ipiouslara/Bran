// @ts-nocheck: Disable strict type checks for Edge Function
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Get auth headers to verify if the caller is authorized (Admin or Project Manager)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header provided" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 2. Initialize Supabase Clients
    // - User client to verify the caller's identity
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    // - Admin client (using service role key) to perform administrative Auth operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // 3. Verify the caller is an Admin or Project Manager
    const { data: { user }, error: userError } = await supabaseClient.auth
      .getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized caller" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller's role in public.employees
    const { data: callerProfile, error: callerError } = await supabaseClient
      .from("employees")
      .select("role")
      .eq("id", user.id)
      .single();

    if (
      callerError || !callerProfile ||
      (callerProfile.role !== "Admin" &&
        callerProfile.role !== "Project Manager")
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Forbidden: Only Admins or Project Managers can create employees.",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 4. Parse request parameters
    const {
      employeeId,
      name,
      designation,
      email,
      password,
      role,
      registeringPmId,
    } = await req.json();

    if (!employeeId || !name || !email) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 5. Create user in Supabase Auth using the Admin client
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin
      .createUser({
        email: email,
        password: password,
        email_confirm: true, // Auto-confirm email so they can log in immediately
      });

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUserId = authData.user.id;

    // 6. Create employee profile in public.employees using Admin client
    const { error: dbError } = await supabaseAdmin
      .from("employees")
      .insert({
        id: newUserId,
        employee_id: employeeId,
        name: name,
        designation: designation,
        email: email,
        role: role,
      });

    if (dbError) {
      // Cleanup auth user if profile insertion failed
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return new Response(
        JSON.stringify({
          error: `Database profile insert failed: ${dbError.message}`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 7. If it is an Employee and we have a registering PM, link them
    let linkedOnly = false;
    if (role === "Employee" && registeringPmId) {
      const { error: linkError } = await supabaseAdmin
        .from("employee_pm_links")
        .insert({
          employee_id: newUserId,
          pm_id: registeringPmId,
        });
      if (!linkError) {
        linkedOnly = true;
      }
    }

    return new Response(JSON.stringify({ user: authData.user, linkedOnly }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
