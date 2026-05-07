import React, { useRef, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface ParsedRow {
  item_name: string;
  product_no?: string;
  style_no?: string;
  vendor_name?: string;
  factory_name?: string;
  category?: string;
  material?: string;
  color_size?: string;
  weight_kg?: number | null;
  unit_price?: number;
  unit_price_cny?: number;
  image_url?: string;
  source_url?: string;
  description?: string;
  notes?: string;
}

// Recommended column order
const TEMPLATE_HEADERS = [
  "product_no",
  "item_name",
  "factory_name",
  "category",
  "material",
  "color_size",
  "weight_kg",
  "unit_price_cny",
  "image_url",
  "source_url",
  "description",
];
const REQUIRED_HEADERS = ["item_name"];
const CSV_MIN_ROWS = 1;
const CSV_MAX_ROWS = 500;

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].replace(/^\uFEFF/, "").split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; }
      else if (char === "," && !inQuotes) { result.push(current.trim()); current = ""; }
      else { current += char; }
    }
    result.push(current.trim());
    return result;
  });
  return { headers, rows };
}

function parseWeightKg(raw: string): { value: number | null; failed: boolean } {
  const v = (raw ?? "").trim();
  if (!v) return { value: null, failed: false };
  // Strip kg / 단위 / spaces
  const cleaned = v.replace(/kg|KG|Kg|킬로그램|키로/g, "").trim();
  const num = Number(cleaned);
  if (Number.isFinite(num)) return { value: num, failed: false };
  return { value: null, failed: true };
}

export default function CSVUploadDialog() {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [unknownCols, setUnknownCols] = useState<string[]>([]);
  const [weightFailCount, setWeightFailCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const reset = () => {
    setPreview([]); setErrors([]); setWarnings([]); setUnknownCols([]); setWeightFailCount(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  const fillStats = useMemo(() => {
    if (preview.length === 0) return null;
    const count = (k: keyof ParsedRow) => preview.filter((r) => {
      const v = r[k];
      return v !== undefined && v !== null && v !== "" as any;
    }).length;
    const total = preview.length;
    return {
      total,
      material: count("material"),
      color_size: count("color_size"),
      weight_kg: count("weight_kg"),
    };
  }, [preview]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCSV(text);
      const errs: string[] = [];
      const warns: string[] = [];

      if (!headers.includes("item_name")) {
        errs.push("필수 컬럼 'item_name'이 없습니다.");
        setErrors(errs); setPreview([]); return;
      }

      const knownSet = new Set([...TEMPLATE_HEADERS, "style_no", "vendor_name", "unit_price", "unit_price_usd", "notes"]);
      const unknown = headers.filter((h) => h && !knownSet.has(h));
      setUnknownCols(unknown);

      const mapped: ParsedRow[] = [];
      let weightFails = 0;
      rows.forEach((row, i) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, idx) => { obj[h] = row[idx] ?? ""; });
        if (!obj.item_name?.trim()) { errs.push(`${i + 2}행: item_name이 비어있습니다.`); return; }

        const w = parseWeightKg(obj.weight_kg ?? "");
        if (w.failed) {
          weightFails += 1;
          console.warn(`[CSVUpload] row ${i + 2}: weight_kg "${obj.weight_kg}" → 숫자 변환 실패, NULL 저장`);
        }

        // factory_name 우선, 없으면 vendor_name(구 컬럼) fallback
        const factoryName = obj.factory_name?.trim() || obj.vendor_name?.trim() || undefined;

        mapped.push({
          item_name: obj.item_name.trim(),
          product_no: obj.product_no?.trim() || undefined,
          style_no: obj.style_no?.trim() || undefined,
          vendor_name: factoryName,
          factory_name: factoryName,
          category: obj.category?.trim() || undefined,
          material: obj.material?.trim() || undefined,
          color_size: obj.color_size?.trim() || undefined,
          weight_kg: w.value,
          unit_price: obj.unit_price ? Number(obj.unit_price) : undefined,
          unit_price_cny: obj.unit_price_cny ? Number(obj.unit_price_cny)
            : obj.unit_price_usd ? Number(obj.unit_price_usd)  // 구버전 컬럼 fallback
            : undefined,
          image_url: obj.image_url?.trim() || undefined,
          source_url: obj.source_url?.trim() || undefined,
          description: obj.description?.trim() || undefined,
          notes: obj.notes?.trim() || undefined,
        });
      });

      setWeightFailCount(weightFails);

      // Warnings (non-blocking)
      const total = mapped.length;
      if (total > 0) {
        const matEmpty = mapped.filter((r) => !r.material).length;
        if (matEmpty / total >= 0.9) {
          warns.push("material 컬럼이 대부분 비어있습니다. 매칭 정확도가 떨어질 수 있으니 가능하면 채워주세요.");
        }
        if (weightFails > 0) {
          warns.push(`${weightFails}건의 weight_kg 값이 숫자로 인식되지 않아 빈 값으로 저장됩니다.`);
        }
        if (unknown.length > 0) {
          warns.push(`알 수 없는 컬럼 ${unknown.length}개는 무시됩니다: ${unknown.join(", ")}`);
        }
      }

      setErrors(errs);
      setWarnings(warns);
      setPreview(mapped);
    };
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    if (preview.length < CSV_MIN_ROWS) {
      toast.error("최소 1건 이상의 상품 데이터가 필요합니다");
      return;
    }
    if (preview.length > CSV_MAX_ROWS) {
      toast.error(`한 번에 최대 ${CSV_MAX_ROWS}건까지 업로드 가능합니다. 현재 파일에 ${preview.length}건이 있습니다. 파일을 분할 후 다시 시도해주세요`);
      return;
    }
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("로그인이 필요합니다."); return; }

      // 현재 환율 fetch (업로드 시점 rate)
      const { data: rateRow } = await (supabase as any)
        .from("system_settings")
        .select("cny_to_usd_rate")
        .eq("id", 1)
        .single();
      const rate: number | null = rateRow?.cny_to_usd_rate ?? null;

      // ── factory_name 매핑: 기존 factories에서 조회 → 없으면 INSERT ──
      const uniqueFactoryNames = Array.from(
        new Set(
          preview
            .map((p) => p.factory_name?.trim())
            .filter((n): n is string => !!n)
        )
      );
      const factoryIdByName = new Map<string, string>(); // lowercase → id

      if (uniqueFactoryNames.length > 0) {
        const { data: existingFactories, error: fErr } = await supabase
          .from("factories")
          .select("id, name")
          .is("deleted_at", null);
        if (fErr) throw fErr;
        for (const f of existingFactories ?? []) {
          factoryIdByName.set((f.name ?? "").trim().toLowerCase(), f.id);
        }

        const toCreate = uniqueFactoryNames.filter(
          (n) => !factoryIdByName.has(n.toLowerCase())
        );
        if (toCreate.length > 0) {
          const insertRows = toCreate.map((name) => ({
            user_id: user.id,
            name,
            source_note: "csv_upload_auto_created",
            status: "new" as const,
          }));
          const { data: created, error: insErr } = await (supabase as any)
            .from("factories")
            .insert(insertRows)
            .select("id, name");
          if (insErr) throw insErr;
          for (const f of created ?? []) {
            factoryIdByName.set((f.name ?? "").trim().toLowerCase(), f.id);
          }
          console.log(`[CSVUpload] Created ${created?.length ?? 0} new factories:`, toCreate);
        }
      }

      const rows = preview.map((p) => {
        const cny = p.unit_price_cny ?? null;
        const usd = cny != null && rate != null
          ? Number((cny * rate).toFixed(4))
          : null;
        const factoryId = p.factory_name
          ? factoryIdByName.get(p.factory_name.trim().toLowerCase()) ?? null
          : null;
        return {
          item_name: p.item_name,
          product_no: p.product_no,
          style_no: p.style_no,
          vendor_name: p.vendor_name,
          factory_id: factoryId,
          category: p.category,
          material: p.material,
          color_size: p.color_size,
          weight_kg: p.weight_kg ?? null,
          unit_price: p.unit_price,
          unit_price_cny: cny,
          unit_price_usd: usd,
          exchange_rate_at_import: cny != null && rate != null ? rate : null,
          image_url: p.image_url,
          source_url: p.source_url,
          description: p.description,
          notes: p.notes,
          user_id: user.id,
          source: "csv_upload" as const,
          status: "active" as const,
        };
      });

      const { error } = await supabase.from("sourceable_products").insert(rows);
      if (error) throw error;

      toast.success(`${rows.length}개 상품이 추가되었습니다.`);
      qc.invalidateQueries({ queryKey: ["sourceable-products"] });
      reset();
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message ?? "업로드 실패");
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    const header = TEMPLATE_HEADERS.join(",");
    const example1 = `EXAMPLE-001,예시 원피스,JINGRU,Dress,95% Polyester 5% Spandex,Black M-XL,0.38,265.00,https://example.com/img.jpg,https://detail.1688.com/offer/123.html,슬림한 실루엣의 미디 원피스입니다.`;
    const example2 = `EXAMPLE-002,예시 셋업,JINGRU,Set,100% Polyester,Brown/Dark Gray S-L,0.55,325.00,,,`;
    const csv = `${header}\n${example1}\n${example2}\n`;
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "sourceable-products-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Upload className="h-4 w-4" /> CSV 추가
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>CSV로 상품 일괄 추가</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="text-sm" />
            <Button variant="ghost" size="sm" onClick={downloadTemplate} className="gap-1 text-xs text-muted-foreground">
              <FileSpreadsheet className="h-3.5 w-3.5" /> 샘플 템플릿 다운로드
            </Button>
          </div>

          <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
            <p>• 한 번에 최소 {CSV_MIN_ROWS}건 ~ 최대 {CSV_MAX_ROWS}건 업로드 가능</p>
            <p>• 필수: <code className="bg-muted px-1 rounded">item_name</code> (권장: <code className="bg-muted px-1 rounded">product_no</code>)</p>
            <p>• 공급가: <code className="bg-muted px-1 rounded">unit_price_cny</code> (위안화) — 업로드 시점 환율로 USD 자동 계산</p>
            <p>• 소싱공장: <code className="bg-muted px-1 rounded">factory_name</code> — 기존 공장명과 매칭, 없으면 자동 등록 (구 <code className="bg-muted px-1 rounded">vendor_name</code> 컬럼도 호환)</p>
            <p>• 선택: <code className="bg-muted px-1 rounded">material</code>, <code className="bg-muted px-1 rounded">color_size</code>, <code className="bg-muted px-1 rounded">weight_kg</code> 등 — 가능하면 채울수록 매칭 정확도 향상</p>
          </div>

          {errors.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 space-y-1">
              {errors.slice(0, 5).map((e, i) => (
                <p key={i} className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 shrink-0" /> {e}
                </p>
              ))}
              {errors.length > 5 && <p className="text-xs text-destructive">...외 {errors.length - 5}건</p>}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-md p-3 space-y-1 dark:bg-yellow-950/30 dark:border-yellow-800">
              {warnings.map((w, i) => (
                <p key={i} className="text-xs text-yellow-800 dark:text-yellow-200 flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /> {w}
                </p>
              ))}
            </div>
          )}

          {preview.length > 0 && fillStats && (
            <>
              <div className="border rounded-md p-3 text-xs space-y-1 bg-muted/20">
                <p className="font-medium">총 {fillStats.total}건</p>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {(["material", "color_size", "weight_kg"] as const).map((k) => {
                    const filled = fillStats[k];
                    const pct = Math.round((filled / fillStats.total) * 100);
                    const color = pct >= 70 ? "text-green-600" : pct >= 30 ? "text-yellow-600" : "text-destructive";
                    return (
                      <div key={k} className="flex flex-col">
                        <span className="text-muted-foreground">{k}</span>
                        <span className={`font-medium ${color}`}>{filled}/{fillStats.total} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-left">#</th>
                      <th className="p-2 text-left">상품명</th>
                      <th className="p-2 text-left">코드</th>
                      <th className="p-2 text-left">material</th>
                      <th className="p-2 text-left">color/size</th>
                      <th className="p-2 text-right">weight(kg)</th>
                      <th className="p-2 text-right">CNY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 10).map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        <td className="p-2">{r.item_name}</td>
                        <td className="p-2">{r.product_no || r.style_no || "—"}</td>
                        <td className="p-2">{r.material || "—"}</td>
                        <td className="p-2">{r.color_size || "—"}</td>
                        <td className="p-2 text-right">{r.weight_kg ?? "—"}</td>
                        <td className="p-2 text-right">{r.unit_price_cny != null ? `¥${r.unit_price_cny}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.length > 10 && <p className="text-xs text-muted-foreground">...외 {preview.length - 10}건 미리보기 생략</p>}

              <div className="flex items-center justify-between">
                {preview.length > CSV_MAX_ROWS ? (
                  <p className="text-sm flex items-center gap-1 text-destructive">
                    <AlertCircle className="h-4 w-4" /> {preview.length}건 — 최대 {CSV_MAX_ROWS}건 초과
                  </p>
                ) : (
                  <p className="text-sm flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="h-4 w-4" /> 총 {preview.length}건 (헤더 제외) 업로드 예정
                  </p>
                )}
                <Button
                  onClick={handleUpload}
                  disabled={uploading || preview.length < CSV_MIN_ROWS || preview.length > CSV_MAX_ROWS}
                  className="gap-1.5"
                >
                  {uploading ? "업로드 중..." : `${preview.length}개 상품 추가`}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
