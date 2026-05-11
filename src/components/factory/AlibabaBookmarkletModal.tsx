import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Bookmark, MousePointerClick, Sparkles, AlertTriangle } from 'lucide-react';

const SUPABASE_URL = 'https://muavrctuayyvfzgaygmu.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11YXZyY3R1YXl5dmZ6Z2F5Z211Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDkxODcsImV4cCI6MjA4OTUyNTE4N30.luuzdH9jJ1qbCp-97YN0aQuYLotFOzMqeckbCWAx_f4';

/** Bookmarklet source — runs on alibaba.com pages.
 *  Extracts supplier_id from URL or page links and POSTs to crawl-alibaba-supplier.
 */
function buildBookmarkletHref(): string {
  const RESERVED = "['www','m','login','message','seller','my','sale','sourcing','rfq','biz','carp','air','help','privacy','terms','jp','kr','de','es','fr','it','pt','ru']";
  const src = `(function(){var SUPABASE_URL=${JSON.stringify(SUPABASE_URL)};var SUPABASE_ANON_KEY=${JSON.stringify(SUPABASE_ANON_KEY)};var RES=${RESERVED};var h=location.hostname,sid=null,lbl='';var sm=h.match(/^([a-z0-9_-]+)\\.en\\.alibaba\\.com$/i);if(sm&&RES.indexOf(sm[1].toLowerCase())===-1){sid=sm[1].toLowerCase();lbl='supplier';}else if(h.indexOf('alibaba.com')!==-1){var ls=Array.prototype.slice.call(document.querySelectorAll('a[href*=".en.alibaba.com"]')).map(function(a){var m=a.href.match(/https?:\\/\\/([a-z0-9_-]+)\\.en\\.alibaba\\.com/i);return m?m[1].toLowerCase():null;}).filter(function(x){return x&&RES.indexOf(x)===-1;});if(ls.length){var c={};ls.forEach(function(x){c[x]=(c[x]||0)+1;});sid=Object.keys(c).sort(function(a,b){return c[b]-c[a];})[0];lbl='product';}}if(!sid){alert('\\u274C \\uACF5\\uAE09\\uC0AC \\uC815\\uBCF4\\uB97C \\uCC3E\\uC744 \\uC218 \\uC5C6\\uC2B5\\uB2C8\\uB2E4.\\nAlibaba \\uC0C1\\uD488/\\uAC80\\uC0C9/\\uACF5\\uAE09\\uC0AC \\uD398\\uC774\\uC9C0\\uC5D0\\uC11C \\uD074\\uB9AD\\uD574\\uC8FC\\uC138\\uC694.');return;}if(!confirm('\\u2705 \\uACF5\\uAE09\\uC0AC \\uBC1C\\uACAC: '+sid+'\\n('+lbl+' \\uD398\\uC774\\uC9C0)\\n\\n\\uB4F1\\uB85D + \\uD06C\\uB864\\uB9C1\\uC744 \\uC2DC\\uC791\\uD560\\uAE4C\\uC694?'))return;var url='https://'+sid+'.en.alibaba.com/company_profile.html';fetch(SUPABASE_URL+'/functions/v1/crawl-alibaba-supplier',{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SUPABASE_ANON_KEY},body:JSON.stringify({supplier_id:sid,alibaba_url:url,force_recrawl:true,source:'bookmarklet_'+lbl})}).then(function(r){return r.json();}).then(function(d){if(d&&d.ok){var msg='\\u2705 '+(d.name||sid)+' \\uB4F1\\uB85D \\uC644\\uB8CC!';if(d.scores){var v=Object.keys(d.scores).map(function(k){return d.scores[k];});msg+='\\nPhase 1 \\uD3C9\\uADE0: '+(v.reduce(function(a,b){return a+b;},0)/v.length).toFixed(1)+'/10';}alert(msg);}else{alert('\\u26A0\\uFE0F \\uB4F1\\uB85D \\uC2E4\\uD328: '+((d&&d.reason)||'unknown'));}}).catch(function(e){alert('\\u274C \\uB124\\uD2B8\\uC6CC\\uD06C \\uC624\\uB958: '+e.message);});})();`;
  return 'javascript:' + encodeURIComponent(src);
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AlibabaBookmarkletModal({ open, onOpenChange }: Props) {
  const href = useMemo(() => buildBookmarkletHref(), []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bookmark className="w-5 h-5" /> Alibaba 공급사 자동 등록 북마클릿
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <p className="text-muted-foreground leading-relaxed">
            Alibaba.com 어디서든 1클릭으로 공급사 등록.
            <br />
            <span className="text-xs">상품 페이지 · 검색 결과 · 공급사 페이지 모두 지원합니다.</span>
          </p>

          <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">사용법</div>
            <ol className="space-y-2 text-sm">
              <li className="flex gap-2"><span className="font-bold text-primary">1.</span> 아래 버튼을 브라우저 <strong>북마크 바</strong>로 드래그하세요.</li>
              <li className="flex gap-2"><span className="font-bold text-primary">2.</span> Alibaba 페이지에서 북마크 바의 「🔮 Alibaba 등록」 클릭.</li>
              <li className="flex gap-2"><span className="font-bold text-primary">3.</span> 자동으로 공급사 ID 추출 → 등록 + 크롤링.</li>
            </ol>
          </div>

          <div className="flex flex-col items-center gap-2 py-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <MousePointerClick className="w-3.5 h-3.5" /> 이 버튼을 북마크 바로 드래그
            </div>
            <a
              href={href}
              draggable
              onClick={(e) => {
                e.preventDefault();
                alert('이 버튼은 클릭이 아니라 북마크 바로 "드래그"해주세요.');
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold shadow-md cursor-grab active:cursor-grabbing hover:shadow-lg transition-shadow"
            >
              <Sparkles className="w-4 h-4" /> 🔮 Alibaba 등록
            </a>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <div>
              첫 클릭 시 Chrome이 <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">javascript:</code> 차단 경고를 띄울 수 있습니다.
              주소창의 차단 아이콘을 클릭해 「항상 허용」을 선택해주세요.
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
