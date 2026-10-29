"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  LineStyle,
  SeriesMarker,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import { CandlestickChart, RefreshCcw } from "lucide-react";

interface ApiCandle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChartPayload {
  ok: boolean;
  symbol?: string;
  candles: ApiCandle[];
  series?: {
    ema20: (number | null)[];
    ema50: (number | null)[];
    rsi14: (number | null)[];
    macd: (number | null)[];
    macdHist: (number | null)[];
    bbUpper: (number | null)[];
    bbLower: (number | null)[];
    bbMid: (number | null)[];
  };
  markers?: { time: number; position: "belowBar" | "aboveBar"; color: string; shape: "arrowUp" | "arrowDown" | "circle"; text: string }[];
  openTrade?: { id: number; side: string; stopLoss: number | null; takeProfit: number | null; entryPrice: number } | null;
}

type OverlayKey = "ema" | "bb";

const chartOptions = {
  layout: {
    background: { type: ColorType.Solid, color: "transparent" },
    textColor: "rgba(232,236,243,0.55)",
    fontSize: 10,
    fontFamily: "Inter, system-ui, sans-serif",
    attributionLogo: false,
  },
  grid: {
    vertLines: { color: "rgba(255,255,255,0.045)" },
    horzLines: { color: "rgba(255,255,255,0.045)" },
  },
  crosshair: {
    mode: CrosshairMode.Normal,
    vertLine: { color: "rgba(247,179,43,0.35)", labelBackgroundColor: "#2a3140" },
    horzLine: { color: "rgba(247,179,43,0.35)", labelBackgroundColor: "#2a3140" },
  },
  rightPriceScale: { borderColor: "rgba(255,255,255,0.09)" },
  timeScale: {
    borderColor: "rgba(255,255,255,0.09)",
    timeVisible: true,
    secondsVisible: false,
    rightOffset: 6,
    barSpacing: 8,
  },
} as const;

const toT = (ts: number): UTCTimestamp => ts as UTCTimestamp;

export default function PriceChart() {
  const priceWrapRef = useRef<HTMLDivElement>(null);
  const rsiWrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const overlaysRef = useRef<Record<string, ISeriesApi<"Line">>>({});
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const syncGuard = useRef(false);
  const [overlays, setOverlays] = useState<Record<OverlayKey, boolean>>({ ema: true, bb: true });
  const [tf, setTf] = useState<"m1" | "m5" | "m15" | "h1">("m1");
  const [lastPayload, setLastPayload] = useState<ChartPayload | null>(null);
  const [loading, setLoading] = useState(true);

  /* ---------------- create charts once ---------------------------- */
  useEffect(() => {
    if (!priceWrapRef.current || !rsiWrapRef.current) return;

    const chart = createChart(priceWrapRef.current, {
      ...chartOptions,
      width: priceWrapRef.current.clientWidth,
      height: 380,
    });
    chartRef.current = chart;

    const candles = chart.addCandlestickSeries({
      upColor: "#2dd4a7",
      downColor: "#f87171",
      borderUpColor: "#2dd4a7",
      borderDownColor: "#f87171",
      wickUpColor: "rgba(45,212,167,0.8)",
      wickDownColor: "rgba(248,113,113,0.8)",
    });
    candleSeriesRef.current = candles;

    const mk = (color: string, style: LineStyle, width: 1 | 2) =>
      chart.addLineSeries({ color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    overlaysRef.current = {
      ema20: mk("#f7b32b", LineStyle.Solid, 2),
      ema50: mk("#7c8cff", LineStyle.Solid, 2),
      bbUpper: mk("rgba(148,163,184,0.55)", LineStyle.Dashed, 1),
      bbLower: mk("rgba(148,163,184,0.55)", LineStyle.Dashed, 1),
      bbMid: mk("rgba(148,163,184,0.35)", LineStyle.Dotted, 1),
    };

    const rsiChart = createChart(rsiWrapRef.current, {
      ...chartOptions,
      width: rsiWrapRef.current.clientWidth,
      height: 110,
      rightPriceScale: { borderColor: "rgba(255,255,255,0.09)", scaleMargins: { top: 0.1, bottom: 0.1 } },
    });
    rsiChartRef.current = rsiChart;
    const rsiSeries = rsiChart.addLineSeries({
      color: "#c084fc",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    });
    rsiSeriesRef.current = rsiSeries;
    rsiSeries.createPriceLine({ price: 70, color: "rgba(248,113,113,0.5)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" });
    rsiSeries.createPriceLine({ price: 30, color: "rgba(52,211,153,0.5)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" });
    rsiSeries.createPriceLine({ price: 50, color: "rgba(255,255,255,0.12)", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });

    // sync visible range both ways
    const sync = (src: IChartApi, dst: IChartApi) => () => {
      if (syncGuard.current) return;
      syncGuard.current = true;
      const range = src.timeScale().getVisibleLogicalRange();
      if (range) dst.timeScale().setVisibleLogicalRange(range);
      syncGuard.current = false;
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(sync(chart, rsiChart));
    rsiChart.timeScale().subscribeVisibleLogicalRangeChange(sync(rsiChart, chart));

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.floor(e.contentRect.width);
        if (e.target === priceWrapRef.current) chart.applyOptions({ width: w });
        if (e.target === rsiWrapRef.current) rsiChart.applyOptions({ width: w });
      }
    });
    ro.observe(priceWrapRef.current);
    ro.observe(rsiWrapRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      rsiChart.remove();
      chartRef.current = null;
      rsiChartRef.current = null;
    };
  }, []);

  /* ---------------- data polling ---------------------------------- */
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/chart?tf=${tf}`, { cache: "no-store" });
        const data = (await res.json()) as ChartPayload;
        if (cancelled || !data.ok || !data.candles?.length) return;
        setLastPayload(data);
        setLoading(false);

        const chart = chartRef.current;
        const candles = candleSeriesRef.current;
        const rsiSeries = rsiSeriesRef.current;
        if (!chart || !candles || !rsiSeries) return;

        const keepAtEdge = chart.timeScale().scrollPosition() < 4;

        candles.setData(
          data.candles.map((c) => ({ time: toT(c.ts), open: c.open, high: c.high, low: c.low, close: c.close }))
        );

        const s = data.series;
        if (s) {
          const line = (arr: (number | null)[]) =>
            data.candles
              .map((c, i) => (arr[i] == null ? null : { time: toT(c.ts), value: arr[i] as number }))
              .filter((v): v is { time: UTCTimestamp; value: number } => v !== null);
          overlaysRef.current.ema20.setData(line(s.ema20));
          overlaysRef.current.ema50.setData(line(s.ema50));
          overlaysRef.current.bbUpper.setData(line(s.bbUpper));
          overlaysRef.current.bbLower.setData(line(s.bbLower));
          overlaysRef.current.bbMid.setData(line(s.bbMid));
          rsiSeries.setData(line(s.rsi14));
        }

        // markers (entries / exits drawn by the AI trading desk)
        const markers: SeriesMarker<Time>[] = (data.markers ?? []).map((m) => ({
          time: toT(m.time) as Time,
          position: m.position,
          color: m.color,
          shape: m.shape,
          text: m.text,
          size: 1,
        }));
        candles.setMarkers(markers);

        // SL/TP price lines for the live position
        for (const pl of priceLinesRef.current) candles.removePriceLine(pl);
        priceLinesRef.current = [];
        const ot = data.openTrade;
        if (ot) {
          if (ot.stopLoss != null)
            priceLinesRef.current.push(
              candles.createPriceLine({ price: ot.stopLoss, color: "#f87171", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "SL" })
            );
          if (ot.takeProfit != null)
            priceLinesRef.current.push(
              candles.createPriceLine({ price: ot.takeProfit, color: "#34d399", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "TP" })
            );
          priceLinesRef.current.push(
            candles.createPriceLine({ price: ot.entryPrice, color: "#f7b32b", lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "ورود" })
          );
        }

        if (keepAtEdge) {
          chart.timeScale().scrollToRealTime();
          rsiChartRef.current?.timeScale().scrollToRealTime();
        }
      } catch {
        /* keep previous frame */
      }
    }
    void load();
    const id = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tf]);

  /* ---------------- overlay visibility ---------------------------- */
  useEffect(() => {
    const o = overlaysRef.current;
    if (o.ema20) {
      o.ema20.applyOptions({ visible: overlays.ema });
      o.ema50.applyOptions({ visible: overlays.ema });
      o.bbUpper.applyOptions({ visible: overlays.bb });
      o.bbLower.applyOptions({ visible: overlays.bb });
      o.bbMid.applyOptions({ visible: overlays.bb });
    }
  }, [overlays, lastPayload]);

  const toggle = useMemo(
    () => (key: OverlayKey) => setOverlays((p) => ({ ...p, [key]: !p[key] })),
    []
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 pt-1">
        <span className="chip text-amber-200 border-amber-400/25 bg-amber-400/10 num">XAU/USD</span>
        {(["m1", "m5", "m15", "h1"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTf(k)}
            className={`chip cursor-pointer transition num ${
              tf === k ? "text-white border-white/30 bg-white/10" : "text-white/35 hover:text-white/70"
            }`}
          >
            {k.toUpperCase()}
          </button>
        ))}
        <span className="text-white/15">|</span>
        <button
          onClick={() => toggle("ema")}
          className={`chip cursor-pointer transition ${overlays.ema ? "text-amber-200 border-amber-400/25 bg-amber-400/10" : "text-white/35"}`}
        >
          EMA 20/50
        </button>
        <button
          onClick={() => toggle("bb")}
          className={`chip cursor-pointer transition ${overlays.bb ? "text-slate-200 border-slate-400/25 bg-slate-400/10" : "text-white/35"}`}
        >
          باندهای بولینگر
        </button>
        <span className="chip text-purple-300 border-purple-400/20 bg-purple-400/10">RSI 14</span>
        <span className="ms-auto text-[11px] text-white/30 flex items-center gap-1">
          <RefreshCcw size={11} className={loading ? "animate-spin" : ""} />
          به‌روزرسانی هر ۱۰ ثانیه
        </span>
      </div>
      <div className="relative mt-2">
        {loading && (
          <div className="absolute inset-0 z-10 grid place-items-center text-white/40 text-xs gap-2">
            <CandlestickChart size={26} className="opacity-50" />
            در حال بارگذاری دیتای زنده طلا…
          </div>
        )}
        <div ref={priceWrapRef} dir="ltr" className="w-full" />
      </div>
      <div className="px-4 pb-3">
        <div className="text-[10px] text-white/30 mb-1 mt-1">RSI (14)</div>
        <div ref={rsiWrapRef} dir="ltr" className="w-full rounded-lg overflow-hidden border border-white/[0.05] bg-white/[0.015]" />
      </div>
    </div>
  );
}
