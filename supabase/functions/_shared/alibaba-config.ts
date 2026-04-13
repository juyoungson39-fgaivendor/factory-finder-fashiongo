// Alibaba integration config — env var reader + validation.
// See docs/tasks/alibaba-integration-phase-1-impl/tech_spec.md §4.2.
//
// Fail-fast: throws at module load time if any required env var is missing or empty.
// This forces Edge Functions to 500 immediately on boot instead of leaking a broken deploy.

/** Literal `sandbox` or `production`. Controls which Alibaba endpoint family to target. */
export type AlibabaEnv = "sandbox" | "production";

export interface AlibabaConfig {
  readonly CLIENT_ID: string;
  readonly CLIENT_SECRET: string;
  readonly REDIRECT_URI: string;
  readonly OAUTH_AUTHORIZE_URL: string;
  readonly OAUTH_TOKEN_URL: string;
  readonly API_BASE_URL: string;
  readonly STATE_SIGNING_SECRET: string;
  readonly APP_ORIGIN: string;
  readonly DEFAULT_SCOPES: string;
  readonly ENV: AlibabaEnv;
}

const REQUIRED_VARS = [
  "ALIBABA_CLIENT_ID",
  "ALIBABA_CLIENT_SECRET",
  "ALIBABA_REDIRECT_URI",
  "ALIBABA_OAUTH_AUTHORIZE_URL",
  "ALIBABA_OAUTH_TOKEN_URL",
  "ALIBABA_API_BASE_URL",
  "ALIBABA_STATE_SIGNING_SECRET",
  "ALIBABA_APP_ORIGIN",
] as const;

function read(name: string): string {
  const v = Deno.env.get(name);
  if (!v || v.trim() === "") {
    throw new Error(`[alibaba-config] Missing required env var: ${name}`);
  }
  return v;
}

function readEnvKind(): AlibabaEnv {
  const raw = (Deno.env.get("ALIBABA_ENV") ?? "sandbox").toLowerCase();
  if (raw !== "sandbox" && raw !== "production") {
    throw new Error(
      `[alibaba-config] ALIBABA_ENV must be 'sandbox' or 'production' (got '${raw}')`,
    );
  }
  return raw;
}

// Validate all required vars up front so a missing value surfaces once, clearly.
const missing = REQUIRED_VARS.filter((k) => {
  const v = Deno.env.get(k);
  return !v || v.trim() === "";
});
if (missing.length > 0) {
  throw new Error(
    `[alibaba-config] Missing required env vars: ${missing.join(", ")}. ` +
      `See docs/integrations/alibaba/phase-0-app-registration.md Step 6.`,
  );
}

export const config: AlibabaConfig = Object.freeze({
  CLIENT_ID: read("ALIBABA_CLIENT_ID"),
  CLIENT_SECRET: read("ALIBABA_CLIENT_SECRET"),
  REDIRECT_URI: read("ALIBABA_REDIRECT_URI"),
  OAUTH_AUTHORIZE_URL: read("ALIBABA_OAUTH_AUTHORIZE_URL"),
  OAUTH_TOKEN_URL: read("ALIBABA_OAUTH_TOKEN_URL"),
  API_BASE_URL: read("ALIBABA_API_BASE_URL"),
  STATE_SIGNING_SECRET: read("ALIBABA_STATE_SIGNING_SECRET"),
  APP_ORIGIN: read("ALIBABA_APP_ORIGIN"),
  DEFAULT_SCOPES: Deno.env.get("ALIBABA_DEFAULT_SCOPES") ?? "",
  ENV: readEnvKind(),
});
