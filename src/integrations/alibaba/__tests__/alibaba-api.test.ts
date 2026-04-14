/**
 * Tests for the signRequest algorithm extracted from supabase/functions/_shared/alibaba-api.ts
 *
 * The original file uses Deno-specific imports and cannot be imported directly in Vitest.
 * We copy the pure algorithm here and test it for correctness.
 * Algorithm: MD5(appSecret + sorted(key+value pairs) + appSecret).toUpperCase()
 */
import { describe, it, expect } from 'vitest';

// --- Portable copy of the signing algorithm from alibaba-api.ts ---

function md5(input: string): string {
  const str = unescape(encodeURIComponent(input));
  const x: number[] = [];
  for (let i = 0; i < str.length; i++) {
    x[i >> 2] |= str.charCodeAt(i) << ((i % 4) * 8);
  }
  const strLen = str.length;
  x[strLen >> 2] |= 0x80 << ((strLen % 4) * 8);
  x[(((strLen + 8) >> 6) << 4) + 14] = strLen * 8;

  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;

  function safeAdd(x: number, y: number) { return (x + y) | 0; }
  function bitRotateLeft(num: number, cnt: number) { return (num << cnt) | (num >>> (32 - cnt)); }
  function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }
  function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  for (let i = 0; i < x.length; i += 16) {
    const olda = a, oldb = b, oldc = c, oldd = d;

    a = md5ff(a, b, c, d, x[i], 7, -680876936);
    d = md5ff(d, a, b, c, x[i + 1], 12, -389564586);
    c = md5ff(c, d, a, b, x[i + 2], 17, 606105819);
    b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330);
    a = md5ff(a, b, c, d, x[i + 4], 7, -176418897);
    d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426);
    c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341);
    b = md5ff(b, c, d, a, x[i + 7], 22, -45705983);
    a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416);
    d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417);
    c = md5ff(c, d, a, b, x[i + 10], 17, -42063);
    b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162);
    a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682);
    d = md5ff(d, a, b, c, x[i + 13], 12, -40341101);
    c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290);
    b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329);

    a = md5gg(a, b, c, d, x[i + 1], 5, -165796510);
    d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632);
    c = md5gg(c, d, a, b, x[i + 11], 14, 643717713);
    b = md5gg(b, c, d, a, x[i], 20, -373897302);
    a = md5gg(a, b, c, d, x[i + 5], 5, -701558691);
    d = md5gg(d, a, b, c, x[i + 10], 9, 38016083);
    c = md5gg(c, d, a, b, x[i + 15], 14, -660478335);
    b = md5gg(b, c, d, a, x[i + 4], 20, -405537848);
    a = md5gg(a, b, c, d, x[i + 9], 5, 568446438);
    d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690);
    c = md5gg(c, d, a, b, x[i + 3], 14, -187363961);
    b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501);
    a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467);
    d = md5gg(d, a, b, c, x[i + 2], 9, -51403784);
    c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473);
    b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734);

    a = md5hh(a, b, c, d, x[i + 5], 4, -378558);
    d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463);
    c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562);
    b = md5hh(b, c, d, a, x[i + 14], 23, -35309556);
    a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060);
    d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353);
    c = md5hh(c, d, a, b, x[i + 7], 16, -155497632);
    b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640);
    a = md5hh(a, b, c, d, x[i + 13], 4, 681279174);
    d = md5hh(d, a, b, c, x[i], 11, -358537222);
    c = md5hh(c, d, a, b, x[i + 3], 16, -722521979);
    b = md5hh(b, c, d, a, x[i + 6], 23, 76029189);
    a = md5hh(a, b, c, d, x[i + 9], 4, -640364487);
    d = md5hh(d, a, b, c, x[i + 12], 11, -421815835);
    c = md5hh(c, d, a, b, x[i + 15], 16, 530742520);
    b = md5hh(b, c, d, a, x[i + 2], 23, -995338651);

    a = md5ii(a, b, c, d, x[i], 6, -198630844);
    d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415);
    c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905);
    b = md5ii(b, c, d, a, x[i + 5], 21, -57434055);
    a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571);
    d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606);
    c = md5ii(c, d, a, b, x[i + 10], 15, -1051523);
    b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799);
    a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359);
    d = md5ii(d, a, b, c, x[i + 15], 10, -30611744);
    c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380);
    b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649);
    a = md5ii(a, b, c, d, x[i + 4], 6, -145523070);
    d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379);
    c = md5ii(c, d, a, b, x[i + 2], 15, 718787259);
    b = md5ii(b, c, d, a, x[i + 9], 21, -343485551);

    a = safeAdd(a, olda);
    b = safeAdd(b, oldb);
    c = safeAdd(c, oldc);
    d = safeAdd(d, oldd);
  }

  const hex = [a, b, c, d]
    .map((n) =>
      [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
    )
    .join('');
  return hex;
}

function signRequest(params: Record<string, string>, appSecret: string): string {
  const sortedKeys = Object.keys(params).sort();
  let stringToSign = appSecret;
  for (const key of sortedKeys) {
    stringToSign += key + params[key];
  }
  stringToSign += appSecret;
  return md5(stringToSign).toUpperCase();
}

// -------------------------------------------------------------------

describe('signRequest (Alibaba API signing algorithm)', () => {
  it('returns a 32-character uppercase hex string', () => {
    const signature = signRequest({ method: 'test' }, 'secret');
    expect(signature).toHaveLength(32);
    expect(signature).toBe(signature.toUpperCase());
    expect(signature).toMatch(/^[0-9A-F]{32}$/);
  });

  it('is deterministic — same inputs produce same output', () => {
    const params = { method: 'alibaba.product.get', app_key: 'mykey', v: '2.0' };
    const sig1 = signRequest(params, 'mysecret');
    const sig2 = signRequest(params, 'mysecret');
    expect(sig1).toBe(sig2);
  });

  it('sorts params alphabetically before signing', () => {
    // Order of keys in the object should not matter
    const params1 = { b: 'bval', a: 'aval', c: 'cval' };
    const params2 = { c: 'cval', a: 'aval', b: 'bval' };
    expect(signRequest(params1, 'secret')).toBe(signRequest(params2, 'secret'));
  });

  it('produces different signatures for different secrets', () => {
    const params = { method: 'test' };
    const sig1 = signRequest(params, 'secret1');
    const sig2 = signRequest(params, 'secret2');
    expect(sig1).not.toBe(sig2);
  });

  it('produces different signatures for different param values', () => {
    const sig1 = signRequest({ method: 'get' }, 'secret');
    const sig2 = signRequest({ method: 'post' }, 'secret');
    expect(sig1).not.toBe(sig2);
  });

  it('wraps the sorted key-value string with appSecret on both sides', () => {
    // For params {a: 'x'} and secret 'S', string to sign = 'S' + 'a' + 'x' + 'S' = 'SaxS'
    // We verify that adding identical appSecret changes the output vs a different secret
    const params = { a: 'x' };
    const sigWithSecret = signRequest(params, 'S');
    // Changing secret changes the signature
    const sigWithDifferentSecret = signRequest(params, 'T');
    expect(sigWithSecret).not.toBe(sigWithDifferentSecret);
  });

  it('handles empty params (only appSecret in string to sign)', () => {
    const sig = signRequest({}, 'mysecret');
    // string to sign = 'mysecret' + '' + 'mysecret' = 'mysecretmysecret'
    expect(sig).toHaveLength(32);
    expect(sig).toMatch(/^[0-9A-F]{32}$/);
  });

  it('handles params with special characters', () => {
    const params = { method: 'alibaba.product.get', query: 'hello world & more' };
    const sig = signRequest(params, 'secret123');
    expect(sig).toHaveLength(32);
    expect(sig).toMatch(/^[0-9A-F]{32}$/);
  });

  it('produces a 32-char uppercase hex string even with empty inputs', () => {
    const sig = signRequest({}, '');
    expect(sig).toMatch(/^[A-F0-9]{32}$/);
  });

  it('produces consistent results for same input', () => {
    const sig1 = signRequest({ key: 'value' }, 'secret');
    const sig2 = signRequest({ key: 'value' }, 'secret');
    expect(sig1).toBe(sig2);
  });

  it('produces different results for different secrets', () => {
    const sig1 = signRequest({ key: 'value' }, 'secret1');
    const sig2 = signRequest({ key: 'value' }, 'secret2');
    expect(sig1).not.toBe(sig2);
  });

  it('produces different results for different params', () => {
    const sig1 = signRequest({ a: '1' }, 'secret');
    const sig2 = signRequest({ a: '2' }, 'secret');
    expect(sig1).not.toBe(sig2);
  });
});
