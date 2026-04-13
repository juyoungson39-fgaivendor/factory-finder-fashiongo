// HMAC-SHA256 signed state utility for Alibaba OAuth flow.
// See docs/tasks/alibaba-integration-phase-1-impl/tech_spec.md §3.1 + §4.3.
//
// Two-part format (NOT a three-part JWS):
//   state = base64url(JSON(payload)) + "." + base64url(HMAC-SHA256(payload_b64, SIGNING_KEY))
//
// Rationale: state only carries user-provided context for CSRF + user binding.
// Three-part JWS would add an unneeded header and a spec-heavier format.

import { config } from "./alibaba-config.ts";
import type { AlibabaPlatform } from "./alibaba-dtos.ts";

export const STATE_TTL_SECONDS = 15 * 60;

export interface StatePayload {
  /** Supabase auth.users.id of the requester */
  user_id: string;
  /** Random uuid — single-use nonce, prevents replay */
  nonce: string;
  /** Client-provided return path, already validated against APP_ORIGIN by oauth-start */
  return_to?: string;
  /** Target platform; defaults to 'alibaba_com' */
  platform?: AlibabaPlatform;
  /** Epoch seconds at sign time */
  iat: number;
}

export class InvalidStateError extends Error {
  constructor(reason: string) {
    super(`Invalid state: ${reason}`);
    this.name = "InvalidStateError";
  }
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

let signingKeyPromise: Promise<CryptoKey> | null = null;
function getSigningKey(): Promise<CryptoKey> {
  if (signingKeyPromise === null) {
    signingKeyPromise = crypto.subtle.importKey(
      "raw",
      textEncoder.encode(config.STATE_SIGNING_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  }
  return signingKeyPromise;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replaceAll("-", "+").replaceAll("_", "/") + pad;
  const binary = atob(b64);
  // Allocate an explicit ArrayBuffer (not ArrayBufferLike) so the result satisfies BufferSource.
  const buf = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes as Uint8Array<ArrayBuffer>;
}

export async function signState(payload: StatePayload): Promise<string> {
  const json = JSON.stringify(payload);
  const payloadB64 = toBase64Url(textEncoder.encode(json));
  const key = await getSigningKey();
  const sig = await crypto.subtle.sign("HMAC", key, textEncoder.encode(payloadB64));
  const sigB64 = toBase64Url(new Uint8Array(sig));
  return `${payloadB64}.${sigB64}`;
}

export async function verifyState(state: string): Promise<StatePayload> {
  if (typeof state !== "string" || state.length === 0) {
    throw new InvalidStateError("empty");
  }
  const dotIdx = state.lastIndexOf(".");
  if (dotIdx <= 0 || dotIdx === state.length - 1) {
    throw new InvalidStateError("malformed");
  }
  const payloadB64 = state.slice(0, dotIdx);
  const sigB64 = state.slice(dotIdx + 1);

  const key = await getSigningKey();
  let sigBytes: Uint8Array<ArrayBuffer>;
  try {
    sigBytes = fromBase64Url(sigB64);
  } catch {
    throw new InvalidStateError("bad_signature_encoding");
  }
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    textEncoder.encode(payloadB64),
  );
  if (!ok) throw new InvalidStateError("signature_mismatch");

  let payload: StatePayload;
  try {
    payload = JSON.parse(textDecoder.decode(fromBase64Url(payloadB64))) as StatePayload;
  } catch {
    throw new InvalidStateError("bad_payload_json");
  }

  if (
    typeof payload.user_id !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.iat !== "number"
  ) {
    throw new InvalidStateError("missing_fields");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec - payload.iat > STATE_TTL_SECONDS) {
    throw new InvalidStateError("expired");
  }
  if (payload.iat - nowSec > 60) {
    // Clock skew tolerance: reject states from more than 60s in the future.
    throw new InvalidStateError("iat_in_future");
  }

  return payload;
}
