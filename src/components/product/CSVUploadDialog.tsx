import React, { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface ParsedRow {
  item_name: string;
  style_no?: string;
  vendor_name?: string;
  category?: string;
  unit_price?: number;
  image_url?: string;
  source_url?: string;
  notes?: string;
}

const REQUIRED_HEADERS = ["item_name"];
const OPTIONAL_HEADERS = ["style_no", "vendor_name", "category", "unit_price", "image_url", "source_url", "notes"];
const ALL_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS];
const CSV_MIN_ROWS = 1;
const CSV_MAX_ROWS = 500;

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
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

export default function CSVUploadDialog() {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const reset = () => { setPreview([]); setErrors([]); if (fileRef.current) fileRef.current.value = ""; };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCSV(text);
      const errs: string[] = [];

      if (!headers.includes("item_name")) {
        errs.push("필수 컬럼 'item_name'이 없습니다.");
        setErrors(errs);
        setPreview([]);
        return;
      }

      const mapped: ParsedRow[] = [];
      rows.forEach((row, i) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, idx) => { obj[h] = row[idx] ?? ""; });
        if (!obj.item_name?.trim()) { errs.push(`${i + 2}행: item_name이 비어있습니다.`); return; }
        mapped.push({
          item_name: obj.item_name.trim(),
          style_no: obj.style_no?.trim() || undefined,
          vendor_name: obj.vendor_name?.trim() || undefined,
          category: obj.category?.trim() || undefined,
          unit_price: obj.unit_price ? Number(obj.unit_price) : undefined,
          image_url: obj.image_url?.trim() || undefined,
          source_url: obj.source_url?.trim() || undefined,
          notes: obj.notes?.trim() || undefined,
        });
      });
      setErrors(errs);
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

      const rows = preview.map((p) => ({
        ...p,
        user_id: user.id,
        source: "csv_upload" as const,
        status: "active" as const,
      }));

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
    const csv = ALL_HEADERS.join(",") + "\n" + "샘플상품,STY-001,공장A,의류,15000,https://example.com/img.jpg,,메모";
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "sourceable_template.csv"; a.click();
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
              <FileSpreadsheet className="h-3.5 w-3.5" /> 템플릿 다운로드
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            필수: <code className="bg-muted px-1 rounded">item_name</code> &nbsp;|&nbsp; 선택: {OPTIONAL_HEADERS.join(", ")}
          </p>
          <p className="text-xs text-muted-foreground">
            한 번에 최소 {CSV_MIN_ROWS}건 ~ 최대 {CSV_MAX_ROWS}건 업로드 가능
          </p>

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

          {preview.length > 0 && (
            <>
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-left">#</th>
                      <th className="p-2 text-left">상품명</th>
                      <th className="p-2 text-left">코드</th>
                      <th className="p-2 text-left">소싱처</th>
                      <th className="p-2 text-left">카테고리</th>
                      <th className="p-2 text-right">가격</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 10).map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        <td className="p-2">{r.item_name}</td>
                        <td className="p-2">{r.style_no || "—"}</td>
                        <td className="p-2">{r.vendor_name || "—"}</td>
                        <td className="p-2">{r.category || "—"}</td>
                        <td className="p-2 text-right">{r.unit_price != null ? `₩${r.unit_price.toLocaleString()}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.length > 10 && <p className="text-xs text-muted-foreground">...외 {preview.length - 10}건 미리보기 생략</p>}

              <div className="flex items-center justify-between">
                <p className="text-sm flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-4 w-4" /> {preview.length}개 상품 준비 완료
                </p>
                <Button onClick={handleUpload} disabled={uploading} className="gap-1.5">
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
