import assert from "node:assert/strict";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error(
    "Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY for local Supabase."
  );
}

const hostname = new URL(supabaseUrl).hostname;

if (hostname !== "127.0.0.1" && hostname !== "localhost") {
  throw new Error("Authorization integration tests are restricted to local Supabase.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const customer = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const runId = crypto.randomUUID();
const email = `security-${runId}@specwear.local`;
const password = `Local-only-${runId}`;
let userId = null;

try {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(createError);
  assert.ok(created.user);
  userId = created.user.id;

  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    email,
    first_name: "Початкове",
  });
  assert.ifError(profileError);

  const { data: session, error: signInError } = await customer.auth.signInWithPassword({
    email,
    password,
  });
  assert.ifError(signInError);
  assert.ok(session.session);

  const { error: normalEditError } = await customer
    .from("profiles")
    .update({ first_name: "Дозволене" })
    .eq("id", userId);
  assert.ifError(normalEditError);

  const escalation = await customer
    .from("profiles")
    .update({
      customer_type: "wholesale",
      is_wholesale_approved: true,
    })
    .eq("id", userId);
  assert.ok(escalation.error, "Expected the customer wholesale escalation PATCH to fail.");

  const { data: profile, error: readError } = await admin
    .from("profiles")
    .select("first_name, customer_type, is_wholesale_approved")
    .eq("id", userId)
    .single();
  assert.ifError(readError);
  assert.equal(profile.first_name, "Дозволене");
  assert.equal(profile.customer_type, "retail");
  assert.equal(profile.is_wholesale_approved, false);

  const { error: adminApprovalError } = await admin
    .from("profiles")
    .update({ customer_type: "wholesale", is_wholesale_approved: true })
    .eq("id", userId);
  assert.ifError(adminApprovalError);

  console.log("Local authorization integration test passed.");
} finally {
  if (userId) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    assert.ifError(deleteError);
  }
}
