// Supabase Vault helpers for Alibaba token bundles.
// See docs/tasks/alibaba-integration-phase-1-impl/tech_spec.md §4.4.
//
// Tokens are JSON-serialised into a single Vault secret per connection,
// named `alibaba_token_<connection_id>`.
// Never log or return the raw bundle outside of an Edge Function boundary.

import { getServiceClient } from "./alibaba-supabase.ts";

export interface AlibabaTokenBundle {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in_seconds: number;
  refresh_expires_in_seconds: number | null;
  /** ISO-8601 timestamp when we received the bundle */
  issued_at: string;
  /** Space-separated scopes actually granted by the user */
  scope: string;
  /** Full raw response for forward compatibility */
  raw: Record<string, unknown>;
}

/**
 * Insert or update the Vault secret that holds a connection's tokens.
 *
 * Strategy: always try `create_secret` first. If it fails with a unique-name
 * conflict (secret already exists), look up the id and fall back to
 * `update_secret`. This collapses the TOCTOU race window of the prior
 * lookup-then-create pattern — there is no moment between the two calls where
 * a concurrent request could insert a conflicting row.
 */
export async function putTokenBundle(
  secretName: string,
  bundle: AlibabaTokenBundle,
  description?: string,
): Promise<void> {
  const supa = getServiceClient();
  const payload = JSON.stringify(bundle);
  const desc = description ?? `Alibaba OAuth token bundle (${secretName})`;

  // 1. Attempt create — happy path for brand-new connections.
  const { error: createErr } = await supa.rpc("create_secret", {
    new_secret: payload,
    new_name: secretName,
    new_description: desc,
  });

  if (createErr === null) return;

  // 2. Conflict / duplicate name → fall through to update.
  // Postgres unique-violation is SQLSTATE 23505. vault.create_secret also
  // surfaces "duplicate key" phrasing in the message.
  const isDuplicate = createErr.code === "23505" ||
    /duplicate|already exists|unique/i.test(createErr.message ?? "");

  if (!isDuplicate) {
    throw new Error(
      `[alibaba-vault] create_secret failed for '${secretName}': ${createErr.message}`,
    );
  }

  // 3. Look up the existing row's id and update in place.
  const { data: existing, error: lookupErr } = await supa
    .from("vault.decrypted_secrets")
    .select("id")
    .eq("name", secretName)
    .maybeSingle();

  if (lookupErr !== null) {
    throw new Error(
      `[alibaba-vault] duplicate-then-lookup failed for '${secretName}': ${lookupErr.message}`,
    );
  }
  if (existing?.id === undefined || existing.id === null) {
    throw new Error(
      `[alibaba-vault] create reported duplicate but lookup found no row for '${secretName}'`,
    );
  }

  const { error: updateErr } = await supa.rpc("update_secret", {
    secret_id: existing.id,
    new_secret: payload,
    new_name: secretName,
    new_description: desc,
  });
  if (updateErr !== null) {
    throw new Error(
      `[alibaba-vault] update_secret failed for '${secretName}': ${updateErr.message}`,
    );
  }
}

export async function getTokenBundle(
  secretName: string,
): Promise<AlibabaTokenBundle> {
  const supa = getServiceClient();
  const { data, error } = await supa
    .from("vault.decrypted_secrets")
    .select("decrypted_secret")
    .eq("name", secretName)
    .single();

  if (error) {
    throw new Error(
      `[alibaba-vault] getTokenBundle '${secretName}' failed: ${error.message}`,
    );
  }
  if (!data?.decrypted_secret) {
    throw new Error(`[alibaba-vault] Vault secret '${secretName}' not found`);
  }

  try {
    return JSON.parse(data.decrypted_secret) as AlibabaTokenBundle;
  } catch (err) {
    throw new Error(
      `[alibaba-vault] Vault secret '${secretName}' is not valid JSON: ${String(err)}`,
    );
  }
}

export async function deleteTokenBundle(secretName: string): Promise<void> {
  const supa = getServiceClient();
  // Vault stores secrets in vault.secrets. Delete by name (unique).
  const { error } = await supa
    .from("vault.secrets")
    .delete()
    .eq("name", secretName);
  if (error) {
    throw new Error(
      `[alibaba-vault] deleteTokenBundle '${secretName}' failed: ${error.message}`,
    );
  }
}
