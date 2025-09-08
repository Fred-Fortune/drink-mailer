"use client"

import React, { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// shadcn/ui components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Coffee as CalendarIcon, Send, Filter, CheckCircle2 } from "lucide-react";

// ---- CONFIG ----
// 將這個常數換成你部署好的 Google Apps Script Web App URL
const APPS_SCRIPT_BASE = "https://script.google.com/macros/s/AKfycbwmVzoPJVAQVDg8Ee-Rn9BUZp_pKBy3VvvYfeNtHhkEeeExEcBeSa-RvnwwoVNuuEC_/exec";

// 部門下拉選單用的『全部部門』值（不可為空字串，避免 shadcn/radix Select 報錯）
const DEPT_ALL_VALUE = "ALL";

// 後端 API 規格：
// GET  `${APPS_SCRIPT_BASE}?fn=getRecipients&dept=xxx&keyword=yyy`
// POST `${APPS_SCRIPT_BASE}`  body: { fn:'sendMail', payload: {...} }

// ---- Types ----
export type Recipient = { name: string; email: string; dept?: string; active?: boolean; note?: string };

const FormSchema = z.object({
  vendor: z.string().min(1, "必填"),
  link: z.string().url("需要有效網址"),
  deadline: z.date(),
  note: z.string().optional().nullable(),
});

export default function DrinkMailer() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  // FIX: Select 的 value 不能是空字串，改以 DEPT_ALL_VALUE 當預設值
  const [dept, setDept] = useState<string>(DEPT_ALL_VALUE);
  const [keyword, setKeyword] = useState<string>("");
  const [allDepts, setAllDepts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [bccMode, setBccMode] = useState(true);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      vendor: "",
      link: "",
      deadline: undefined,
      note: "",
    },
  });

  const deadline = watch("deadline");

  // Fetch recipients
  const fetchRecipients = async (opts?: { dept?: string; keyword?: string }) => {
    setLoading(true);
    setMessage("");
    try {
      const url = buildGetRecipientsUrl(APPS_SCRIPT_BASE, opts?.dept, opts?.keyword);
      const res = await fetch(url.toString());
      const data = await res.json();
      const list: Recipient[] = data.list || [];
      setRecipients(list);
      setAllDepts(data.allDepts || []);
      // 預設勾選 Active=true 的人
      const nextSel: Record<string, boolean> = {};
      for (const r of list) if (r.email && r.active) nextSel[r.email] = true;
      setSelected(nextSel);
    } catch (e: any) {
      setMessage(e?.message ?? "讀取名單失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecipients();
  }, []);

  const filtered = useMemo(() => recipients, [recipients]);

  const anyChecked = useMemo(() => filtered.some((r) => selected[r.email]), [filtered, selected]);

  function toggleAll(on: boolean) {
    const next = { ...selected };
    for (const r of filtered) next[r.email] = !!on;
    setSelected(next);
  }

  async function onSubmit(values: z.infer<typeof FormSchema>) {
    if (!anyChecked) {
      setMessage("請至少勾選一位收件人");
      return;
    }
    const cleanLink = (values.link || "")
      .replace(/[\u200B\uFEFF]/g, "")
      .replace(/\u3000/g, " ")
      .trim();

    setSending(true);
    setMessage("寄送中…");
    try {
      const payload = {
        vendor: values.vendor,
        link: cleanLink,
        deadline: values.deadline?.toISOString?.(),
        note: values.note || "",
        emails: Object.keys(selected).filter((k) => selected[k]),
        bccMode,
      };
      const res = await fetch(APPS_SCRIPT_BASE, {
        method: "POST",
        //headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fn: "sendmail", payload }),
      });
      const data = await res.json();
      if (data?.ok) {
        setMessage(data.message || "寄送成功");
      } else {
        throw new Error(data?.message || "寄送失敗");
      }
    } catch (e: any) {
      setMessage(e?.message ?? "寄送失敗");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* === Hero Banner === */}
      <header className="rounded-2xl bg-gradient-to-r from-slate-300 via-indigo-200 to-purple-200 p-8 text-gray-800 shadow-md">
        <div className="relative z-10 flex flex-col items-start gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/15 p-3 backdrop-blur">
              <CalendarIcon className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-wide">飲料開團通知系統</h1>
              <p className="text-sm text-gray-600">貼上開團資訊、勾選名單，一鍵寄出 🚀</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 md:mt-0">
            <Badge className="bg-white/15 text-white hover:bg-white/20">快速寄送</Badge>
            <Badge className="bg-white/15 text-white hover:bg-white/20">名單管理</Badge>
            <Badge className="bg-white/15 text-white hover:bg-white/20">BCC 保護</Badge>
          </div>
        </div>
        {/* 裝飾性光暈 */}
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-pink-300/20 blur-3xl" />
      </header>

      <Card>
        <CardHeader>
          <CardTitle>頁面操作說明</CardTitle>
          <CardDescription>歡迎使用飲料開團通知系統，請跟隨以下說明使用該系統</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <ol className="list-decimal ml-5 space-y-1">
            <li>先使用該帳號開團 帳號 : 0983176721 ； 
                密碼 : 123456。</li>
            <li>貼上開團資訊，勾選收件人，一鍵寄出。</li>
          </ol>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>飲料開團通知</CardTitle>
          <CardDescription>貼上開團資訊，勾選收件人，一鍵寄出。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 基本資訊 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vendor">店家名稱 *</Label>
              <Input id="vendor" placeholder="大茗" {...register("vendor")} />
              {errors.vendor && <p className="text-sm text-red-600">{errors.vendor.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="link">開團平台連結 *</Label>
              <Input id="link" type="url" placeholder="https://..." {...register("link")} />
              {errors.link && <p className="text-sm text-red-600">{errors.link.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>訂購截止 *</Label>
              <DateTimePicker value={deadline} onChange={(d)=>setValue("deadline", d as any, { shouldValidate: true })} />
              {errors.deadline && <p className="text-sm text-red-600">{errors.deadline.message as string}</p>}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="note">備註</Label>
              <Textarea id="note" placeholder="" {...register("note")} />
            </div>
          </div>

          <Separator />

          {/* 名單區 */}
          <div className="flex items-end gap-3 flex-wrap">
            <div className="w-56">
              <Label>部門篩選</Label>
              <Select value={dept} onValueChange={(v)=> setDept(v)}>
                <SelectTrigger>
                  {/* 若 value 為 DEPT_ALL_VALUE，仍會顯示對應的 SelectItem 文字 */}
                  <SelectValue placeholder="全部部門" />
                </SelectTrigger>
                <SelectContent>
                  {/* FIX: 不再使用空字串作為 value，避免錯誤 */}
                  <SelectItem value={DEPT_ALL_VALUE}>全部部門</SelectItem>
                  {allDepts.map((d)=> (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-64">
              <Label>關鍵字</Label>
              <Input value={keyword} onChange={(e)=> setKeyword(e.target.value)} placeholder="姓名 / Email / 部門" />
            </div>
            <Button variant="secondary" onClick={()=> fetchRecipients({ dept, keyword })}>
              <Filter className="mr-2 h-4 w-4" />套用篩選
            </Button>
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" onClick={()=> toggleAll(true)}>全選</Button>
              <Button variant="secondary" onClick={()=> toggleAll(false)}>全不選</Button>
            </div>
          </div>

          <div className="border rounded-2xl p-2 max-h-[360px] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="w-10 text-left"></th>
                  <th className="text-left">姓名</th>
                  <th className="text-left">Email</th>
                  <th className="text-left">部門</th>
                  <th className="text-left">備註</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="py-6 text-center">載入中…</td></tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.email} className="border-t">
                      <td className="py-2">
                        <Checkbox
                          checked={!!selected[r.email]}
                          onCheckedChange={(v)=> setSelected((s)=> ({ ...s, [r.email]: !!v }))}
                          aria-label={`select ${r.email}`}
                        />
                      </td>
                      <td className="py-2">{r.name}</td>
                      <td className="py-2">{r.email}</td>
                      <td className="py-2">{r.dept ? <Badge variant="secondary">{r.dept}</Badge> : "-"}</td>
                      <td className="py-2 text-muted-foreground">{r.note || ""}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Checkbox id="bcc" checked={bccMode} onCheckedChange={(v)=> setBccMode(!!v)} />
              <Label htmlFor="bcc">以 BCC 群發（建議）</Label>
            </div>
            <div className="text-sm text-muted-foreground">避免露出所有名單；取消則所有人放在 To。</div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSubmit(onSubmit)} disabled={sending || loading}>
              <Send className="mr-2 h-4 w-4" />送出並寄信
            </Button>
            {message && (
              <div className={cn("text-sm", message.includes("成功") ? "text-green-600" : message.includes("失敗") ? "text-red-600" : "text-muted-foreground")}>{message}</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* === Footer / 版權標記 === */}
  <footer className="pt-6 border-t text-center text-xs text-muted-foreground">
    © {new Date().getFullYear()} 華城 資訊中心-李承翰 · All Rights Reserved
  </footer>

    </div>
  );
}

// ---- DateTime Picker (shadcn composition) ----
function DateTimePicker({ value, onChange }: { value?: Date; onChange: (d?: Date)=>void }) {
  const [open, setOpen] = useState(false);
  const dateStr = value ? `${value.getFullYear()}/${String(value.getMonth()+1).padStart(2,"0")}/${String(value.getDate()).padStart(2,"0")} ${String(value.getHours()).padStart(2,"0")}:${String(value.getMinutes()).padStart(2,"0")}` : "選擇日期時間";
  const [date, setDate] = useState<Date | undefined>(value);
  const [time, setTime] = useState<string>(value ? `${String(value.getHours()).padStart(2,"0")}:${String(value.getMinutes()).padStart(2,"0")}` : "12:00");

  useEffect(()=>{ setDate(value); if (value) setTime(`${String(value.getHours()).padStart(2,"0")}:${String(value.getMinutes()).padStart(2,"0")}`); }, [value]);

  function commit(d?: Date, t?: string){
    const base = d ?? date;
    const tm = (t ?? time).split(":");
    if (!base || tm.length !== 2) return onChange(undefined);
    const out = new Date(base);
    out.setHours(Number(tm[0]||0), Number(tm[1]||0), 0, 0);
    onChange(out);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !value && "text-muted-foreground")}> 
          <CalendarIcon className="mr-2 h-4 w-4" /> {dateStr}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="flex flex-col gap-3">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d)=> { setDate(d); commit(d, undefined); }}
            initialFocus
          />
          <div className="flex items-center gap-2">
            <Input type="time" value={time} onChange={(e)=> { setTime(e.target.value); commit(undefined, e.target.value); }} />
            <Button size="sm" onClick={()=> setOpen(false)}>
              <CheckCircle2 className="mr-1 h-4 w-4"/> 確定
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**********************
 * Dev Test Cases
 * - 依 Hint 修正 SelectItem 不可用空字串 value。
 * - 以下測試確保建構 URL 與 DEPT_ALL_VALUE 行為正確。
 * - 另外驗證 payload 不包含已移除欄位（pickup/location）。
 **********************/
export function buildGetRecipientsUrl(base: string, dept?: string, keyword?: string) {
  const url = new URL(base);
  url.searchParams.set("fn", "getRecipients");
  if (dept && dept !== DEPT_ALL_VALUE) url.searchParams.set("dept", dept);
  if (keyword) url.searchParams.set("keyword", keyword);
  return url;
}

export function buildPayloadForTest(values: {vendor:string; link:string; deadline:Date; note?:string}, selected: Record<string, boolean>, bccMode:boolean){
  return {
    vendor: values.vendor,
    link: values.link,
    deadline: values.deadline?.toISOString?.(),
    note: values.note || "",
    emails: Object.keys(selected).filter(k=> selected[k]),
    bccMode,
  };
}

(function runDevTests(){
  try {
    // Test 1: ALL 不應帶出 dept 參數
    const u1 = buildGetRecipientsUrl(APPS_SCRIPT_BASE, DEPT_ALL_VALUE, "");
    console.assert(!u1.searchParams.has("dept"), "[Test1] ALL should not include dept param");

    // Test 2: 空或未定義不應帶出 dept 參數
    const u2 = buildGetRecipientsUrl(APPS_SCRIPT_BASE, undefined, "");
    console.assert(!u2.searchParams.has("dept"), "[Test2] undefined dept should not include param");

    // Test 3: 指定 RD 應包含 dept=RD
    const u3 = buildGetRecipientsUrl(APPS_SCRIPT_BASE, "RD", "");
    console.assert(u3.searchParams.get("dept") === "RD", "[Test3] dept=RD should be present");

    // Test 4: keyword 參數應被帶出
    const u4 = buildGetRecipientsUrl(APPS_SCRIPT_BASE, DEPT_ALL_VALUE, "abc");
    console.assert(u4.searchParams.get("keyword") === "abc", "[Test4] keyword should be present");

    // Test 5: sentinel 不可為空字串
    //console.assert(DEPT_ALL_VALUE !== "", "[Test5] DEPT_ALL_VALUE must not be empty");

    // Test 6: payload 不應包含 pickup/location
    const payload = buildPayloadForTest({vendor:"V", link:"https://x.test", deadline:new Date(), note:"N"}, {"a@b.com":true}, true);
    console.assert(!("pickup" in payload) && !("location" in payload), "[Test6] payload should not contain pickup/location");
  } catch (_) {
    // 某些 SSR/非瀏覽器環境的 URL 限制可忽略
  }
})();
