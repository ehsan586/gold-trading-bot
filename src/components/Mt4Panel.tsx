"use client";

import { useState } from "react";
import { DashboardState, control, fmtUsd, timeAgo } from "./hooks";
import {
  Cable,
  Copy,
  Download,
  Link2,
  Power,
  Trash2,
  Wifi,
  WifiOff,
  CircleDollarSign,
} from "lucide-react";

export default function Mt4Panel({ state, onAction }: { state: DashboardState | null; onAction: () => void }) {
  const [login, setLogin] = useState("");
  const [server, setServer] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  const accounts = state?.mt4 ?? [];

  const link = async () => {
    if (!login.trim()) return;
    setBusy(true);
    try {
      await control({ action: "mt4_link", login: login.trim(), server: server.trim() });
      setLogin("");
      setServer("");
      onAction();
    } finally {
      setBusy(false);
    }
  };

  const copy = async (id: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1600);
    } catch { /* clipboard blocked */ }
  };

  return (
    <div className="space-y-4">
      {/* link form */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="شماره حساب آلپاری (Login)"
          dir="ltr"
          className="flex-1 min-w-36 rounded-lg bg-white/[0.05] border border-white/10 px-3 py-2 text-[11.5px] text-white/85 outline-none focus:border-amber-400/40 num"
        />
        <input
          value={server}
          onChange={(e) => setServer(e.target.value)}
          placeholder="سرور (مثل Alpari-Standard1)"
          dir="ltr"
          className="flex-1 min-w-36 rounded-lg bg-white/[0.05] border border-white/10 px-3 py-2 text-[11.5px] text-white/85 outline-none focus:border-amber-400/40"
        />
        <button
          onClick={link}
          disabled={busy || !login.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-amber-400/15 border border-amber-400/30 text-amber-200 text-[11.5px] font-bold px-4 py-2 hover:bg-amber-400/25 transition cursor-pointer disabled:opacity-40"
        >
          <Link2 size={13} />
          لینک حساب
        </button>
        <a
          href="/api/mt4/download"
          download="ArgusBridge.mq4"
          className="flex items-center gap-1.5 rounded-lg bg-white/[0.05] border border-white/10 text-white/70 text-[11.5px] font-bold px-4 py-2 hover:bg-white/[0.09] transition"
        >
          <Download size={13} />
          دانلود اکسپرت ArgusBridge.mq4
        </a>
      </div>

      {/* accounts */}
      {accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.015] p-5">
          <p className="text-[12px] text-white/50 font-bold mb-2">هنوز حسابی لینک نشده</p>
          <ol className="text-[10.5px] text-white/35 leading-5 list-decimal list-inside space-y-1">
            <li>شماره حساب آلپاری را بالا وارد و «لینک حساب» را بزنید — یک توکن اختصاصی می‌گیرید</li>
            <li>اکسپرت ArgusBridge.mq4 را دانلود و در پوشه MQL4/Experts متاتریدر ۴ آلپاری کپی و کامپایل کنید</li>
            <li>در MT4 منوی Tools ← Options ← Expert Advisors: گزینه Allow WebRequest را فعال و آدرس این داشبورد را اضافه کنید</li>
            <li>اکسپرت را روی چارت XAUUSD بیندازید، Token را در تنظیماتش بچسبانید و AutoTrading را روشن کنید</li>
            <li>از این لحظه، مدیر پرتفوی آرگوس معاملات را مستقیم در ترمینال شما باز و بسته می‌کند</li>
          </ol>
        </div>
      ) : (
        accounts.map((a) => (
          <div key={a.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={a.online ? "text-emerald-300" : "text-white/30"}>
                {a.online ? <Wifi size={14} /> : <WifiOff size={14} />}
              </span>
              <span className="text-[12.5px] font-bold num text-white/90 ltr">{a.login}</span>
              {a.server && <span className="text-[10px] text-white/35 ltr">@ {a.server}</span>}
              <span className={`chip ${a.online ? "text-emerald-300 border-emerald-400/25 bg-emerald-400/10" : "text-white/35"}`}>
                {a.online ? "ترمینال آنلاین" : "آفلاین"}
              </span>
              {!a.enabled && <span className="chip text-white/40">میرور خاموش</span>}
              <span className="text-[9.5px] text-white/25 ms-auto">{a.lastSeen ? `آخرین پالس: ${timeAgo(a.lastSeen)}` : "هنوز پالسی دریافت نشده"}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-center">
              <div className="rounded-lg bg-white/[0.04] py-1.5">
                <div className="text-[9px] text-white/35">بالانس واقعی</div>
                <div className="text-[12px] font-bold num text-white/85">{a.balance != null ? fmtUsd(a.balance, 2) : "—"}</div>
              </div>
              <div className="rounded-lg bg-white/[0.04] py-1.5">
                <div className="text-[9px] text-white/35">اکوییتی واقعی</div>
                <div className="text-[12px] font-bold num text-white/85">{a.equity != null ? fmtUsd(a.equity, 2) : "—"}</div>
              </div>
              <div className="rounded-lg bg-white/[0.04] py-1.5">
                <div className="text-[9px] text-white/35">پوزیشن‌های ترمینال</div>
                <div className="text-[12px] font-bold num text-white/85">{a.positions.length}</div>
              </div>
              <div className="rounded-lg bg-white/[0.04] py-1.5">
                <div className="text-[9px] text-white/35">سود شناور ترمینال</div>
                <div className={`text-[12px] font-bold num ${(a.positions.reduce((x, p) => x + (p.profit ?? 0), 0) >= 0) ? "text-emerald-300" : "text-red-300"}`}>
                  {fmtUsd(a.positions.reduce((x, p) => x + (p.profit ?? 0), 0), 2)}
                </div>
              </div>
            </div>

            {/* token + actions */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-[9.5px] text-white/30">توکن پل:</span>
              <code className="text-[9.5px] num text-amber-200/70 bg-white/[0.04] border border-white/10 rounded px-2 py-1 ltr truncate max-w-56">
                {a.token.slice(0, 18)}…
              </code>
              <button
                onClick={() => void copy(a.id, a.token)}
                className="text-white/40 hover:text-white/80 transition cursor-pointer"
                title="کپی کامل توکن"
              >
                <Copy size={12} />
              </button>
              {copied === a.id && <span className="text-[9.5px] text-emerald-300">کپی شد</span>}
              <div className="ms-auto flex gap-1.5">
                <button
                  onClick={() => void control({ action: "mt4_toggle", accountId: a.id, enabled: !a.enabled }).then(onAction)}
                  className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] text-white/60 hover:bg-white/[0.08] cursor-pointer"
                >
                  <Power size={11} />
                  {a.enabled ? "توقف میرور" : "فعال‌سازی میرور"}
                </button>
                <button
                  onClick={() => {
                    if (confirm("اتصال این حساب کاملاً قطع شود؟")) {
                      void control({ action: "mt4_unlink", accountId: a.id }).then(onAction);
                    }
                  }}
                  className="flex items-center gap-1 rounded-md border border-red-400/20 bg-red-400/[0.06] px-2.5 py-1 text-[10px] text-red-300 hover:bg-red-400/15 cursor-pointer"
                >
                  <Trash2 size={11} />
                  قطع اتصال
                </button>
              </div>
            </div>

            {/* terminal positions */}
            {a.positions.length > 0 && (
              <div className="mt-3 rounded-lg overflow-hidden border border-white/[0.05]">
                <table className="w-full text-[10.5px]">
                  <thead>
                    <tr className="bg-white/[0.04] text-white/35">
                      <th className="py-1.5 px-2 text-right font-medium">تیکت</th>
                      <th className="py-1.5 px-2 text-right font-medium">جهت</th>
                      <th className="py-1.5 px-2 text-right font-medium">لات</th>
                      <th className="py-1.5 px-2 text-right font-medium">قیمت باز</th>
                      <th className="py-1.5 px-2 text-left font-medium">سود شناور</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.positions.map((p) => (
                      <tr key={p.ticket} className="border-t border-white/[0.04]">
                        <td className="py-1.5 px-2 num text-white/50 ltr text-right">{p.ticket}</td>
                        <td className={`py-1.5 px-2 ${p.type === "buy" ? "text-emerald-300" : "text-red-300"}`}>
                          {p.type === "buy" ? "خرید" : "فروش"}
                        </td>
                        <td className="py-1.5 px-2 num text-white/70 ltr text-right">{p.lots.toFixed(2)}</td>
                        <td className="py-1.5 px-2 num text-white/70 ltr text-right">{p.openPrice.toFixed(2)}</td>
                        <td className={`py-1.5 px-2 num text-left font-bold ${(p.profit ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                          {fmtUsd(p.profit ?? 0, 2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* recent commands */}
            {a.commands.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {a.commands.map((c) => (
                  <span
                    key={c.id}
                    className={`chip num ${
                      c.status === "done"
                        ? "text-emerald-300/70 border-emerald-400/15"
                        : c.status === "failed"
                          ? "text-red-300/80 border-red-400/25"
                          : "text-white/35"
                    }`}
                  >
                    <CircleDollarSign size={9} />
                    {c.type === "open"
                      ? `بازکردن ${String(c.payload.side ?? "")} ${String(c.payload.lots ?? "")} لات`
                      : `بستن تیکت ${String(c.payload.ticket ?? "")}`}
                    {" · "}
                    {c.status === "done" ? "اجرا شد" : c.status === "failed" ? "ناموفق" : c.status === "sent" ? "تحویل به ترمینال" : "در صف"}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))
      )}

      <div className="flex items-start gap-2 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3">
        <Cable size={14} className="text-amber-300 shrink-0 mt-0.5" />
        <p className="text-[10px] leading-5 text-amber-100/60">
          متاتریدر ۴ API تحت‌وب ندارد؛ اکسپرت ArgusBridge هر {10} ثانیه فرمان‌های مدیر پرتفوی را از این داشبورد می‌گیرد و وضعیت حساب را برمی‌گرداند.
          تا ترمینال شما آنلاین است، مغز آرگوس حتی با بسته بودن داشبورد بیدار می‌ماند. معامله با پول واقعی — ابتدا روی حساب دمو آلپاری تست کنید.
        </p>
      </div>
    </div>
  );
}
