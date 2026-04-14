/**
 * batch-embed-products.ts
 *
 * sourceable_products 테이블의 embedding IS NULL 상품에 대해
 * generate-embedding Edge Function을 호출하여 임베딩을 일괄 생성한다.
 *
 * 실행:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=xxx \
 *   npx tsx scripts/batch-embed-products.ts
 */

import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PAGE_SIZE = 50;
const DELAY_MS = 200; // rate-limit 고려

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "❌  환경변수 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 를 설정하세요."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const EMBED_FN_URL = `${SUPABASE_URL}/functions/v1/generate-embedding`;

// ─────────────────────────────────────────────────────────────
// Types — sourceable_products 실제 컬럼 기준
// ─────────────────────────────────────────────────────────────
interface ProductRow {
  id: string;
  item_name: string | null;
  item_name_en: string | null;
  category: string | null;
  fg_category: string | null;
  vendor_name: string | null;
  notes: string | null;
  image_url: string | null;
}

interface FailedItem {
  id: string;
  name: string;
  error: string;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function buildText(row: ProductRow): string {
  return [
    row.item_name,
    row.item_name_en,
    row.category,
    row.fg_category,
    row.vendor_name,
    row.notes,
  ]
    .filter(Boolean)
    .join(" ");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGenerateEmbedding(row: ProductRow): Promise<void> {
  const text = buildText(row);
  if (!text && !row.image_url) {
    throw new Error("텍스트와 이미지 URL 모두 없음");
  }

  const body: Record<string, unknown> = {
    table: "sourceable_products",
    id: row.id,
    text: text || undefined,
  };
  if (row.image_url) body.image_url = row.image_url;

  const res = await fetch(EMBED_FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText}`);
  }

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error ?? "generate-embedding 실패");
  }
}

// ─────────────────────────────────────────────────────────────
// Count total rows to process
// ─────────────────────────────────────────────────────────────
async function countTotal(): Promise<number> {
  const { count, error } = await supabase
    .from("sourceable_products")
    .select("id", { count: "exact", head: true })
    .is("embedding", null);

  if (error) throw new Error(`카운트 조회 실패: ${error.message}`);
  return count ?? 0;
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log("🔍  embedding IS NULL 상품 수 조회 중...");
  const total = await countTotal();

  if (total === 0) {
    console.log("✅  처리할 상품이 없습니다. (embedding이 모두 생성되어 있음)");
    return;
  }

  console.log(`📦  총 ${total}건 처리 시작 (${PAGE_SIZE}건씩 페이지네이션)\n`);

  let processed = 0;
  let succeeded = 0;
  const failed: FailedItem[] = [];
  let page = 0;

  while (true) {
    // 50개씩 페이지네이션 조회
    const { data: rows, error: fetchErr } = await supabase
      .from("sourceable_products")
      .select(
        "id, item_name, item_name_en, category, fg_category, vendor_name, notes, image_url"
      )
      .is("embedding", null)
      .order("created_at", { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (fetchErr) {
      console.error("❌  DB 조회 실패:", fetchErr.message);
      break;
    }
    if (!rows || rows.length === 0) break;

    for (const row of rows as ProductRow[]) {
      processed++;
      const displayName =
        row.item_name || row.item_name_en || `(id: ${row.id.slice(0, 8)})`;

      process.stdout.write(
        `[${processed}/${total}] Processing: ${displayName.slice(0, 50)}... `
      );

      try {
        await callGenerateEmbedding(row);
        console.log("✓");
        succeeded++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`✗  ${message}`);
        failed.push({ id: row.id, name: displayName, error: message });
      }

      await sleep(DELAY_MS);
    }

    // 페이지를 앞에서부터 다시 조회하지 않도록:
    // embedding이 업데이트된 row는 다음 조회에서 빠지므로
    // offset 대신 항상 page=0 으로 재조회 (처리된 row가 제외됨)
    // → 단순히 rows.length < PAGE_SIZE 이면 마지막 페이지
    if (rows.length < PAGE_SIZE) break;
    // page는 고정 0 — IS NULL 필터로 처리된 row가 자동 제외됨
  }

  // ── 요약 출력 ──────────────────────────────────────────────
  console.log("\n" + "─".repeat(50));
  console.log(`✅  완료`);
  console.log(`   총 처리: ${processed}건`);
  console.log(`   성공:    ${succeeded}건`);
  console.log(`   실패:    ${failed.length}건`);

  if (failed.length > 0) {
    console.log("\n❌  실패 목록:");
    failed.forEach(({ id, name, error }) => {
      console.log(`   - [${id.slice(0, 8)}] ${name.slice(0, 40)}: ${error}`);
    });
  }
}

main().catch((err) => {
  console.error("💥  예기치 못한 오류:", err);
  process.exit(1);
});
