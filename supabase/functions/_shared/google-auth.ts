// Base64URL encode (no padding, URL-safe) — chunked for large payloads
function base64UrlEncode(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncodeStr(str: string): string {
  return base64UrlEncode(new TextEncoder().encode(str));
}

// Parse PEM private key to CryptoKey
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Strip PEM header/footer
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  // Base64 decode to DER bytes
  const binaryStr = atob(pemBody);
  const derBytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    derBytes[i] = binaryStr.charCodeAt(i);
  }

  // Import as PKCS#8
  return crypto.subtle.importKey(
    "pkcs8",
    derBytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

// Create signed JWT for Google OAuth2
async function createSignedJwt(
  email: string,
  privateKey: string,
  scope: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = base64UrlEncodeStr(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  );
  const payload = base64UrlEncodeStr(
    JSON.stringify({
      iss: email,
      scope,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );

  const unsignedToken = `${header}.${payload}`;
  const key = await importPrivateKey(privateKey);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedToken)
  );

  return `${unsignedToken}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Get GCP OAuth2 access token from a Base64-encoded service account JSON key.
 */
export async function getAccessToken(
  serviceAccountKeyBase64: string
): Promise<string> {
  // Decode service account JSON
  const keyJson = JSON.parse(atob(serviceAccountKeyBase64));
  const { client_email, private_key } = keyJson;

  if (!client_email || !private_key) {
    throw new Error(
      "Invalid service account key: missing client_email or private_key"
    );
  }

  // Create signed JWT
  const jwt = await createSignedJwt(
    client_email,
    private_key,
    "https://www.googleapis.com/auth/cloud-platform"
  );

  // Exchange JWT for access token
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OAuth2 token exchange failed (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  return data.access_token;
}
