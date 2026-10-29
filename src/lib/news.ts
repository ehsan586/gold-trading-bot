import Parser from "rss-parser";
import { createHash } from "node:crypto";
import { desc, gte } from "drizzle-orm";
import { db } from "@/db";
import { newsItems } from "@/db/schema";
import { clamp } from "./indicators";

/* ------------------------------------------------------------------ */
/* RSS sources — Google News topic searches, no API key required       */
/* ------------------------------------------------------------------ */
const FEEDS: { category: "us" | "indonesia" | "world"; url: string }[] = [
  {
    category: "us",
    url: "https://news.google.com/rss/search?q=Federal%20Reserve%20OR%20FOMC%20OR%20US%20inflation%20OR%20US%20dollar%20OR%20Treasury%20yields%20when%3A1d&hl=en-US&gl=US&ceid=US:en",
  },
  {
    category: "indonesia",
    url: "https://news.google.com/rss/search?q=Bank%20Indonesia%20OR%20rupiah%20OR%20Indonesia%20economy%20OR%20Jakarta%20Composite%20when%3A1d&hl=en&gl=ID&ceid=ID:en",
  },
  {
    category: "world",
    url: "https://news.google.com/rss/search?q=gold%20price%20OR%20central%20bank%20OR%20geopolitical%20tension%20OR%20recession%20when%3A1d&hl=en-US&gl=US&ceid=US:en",
  },
];

/* ------------------------------------------------------------------ */
/* Lexicon — keyword directional scoring for gold (XAU/USD)            */
/* positive = bullish gold, negative = bearish gold                    */
/* ------------------------------------------------------------------ */
const BULLISH: [string, number][] = [
  ["rate cut", 0.9], ["cuts rates", 0.9], ["dovish", 0.8], ["recession", 0.85],
  ["crisis", 0.8], ["war", 0.9], ["conflict", 0.75], ["escalat", 0.8],
  ["sanction", 0.6], ["safe haven", 0.85], ["safe-haven", 0.85],
  ["bank fail", 0.85], ["default", 0.8], ["downgrade", 0.7],
  ["stimulus", 0.6], ["qe ", 0.7], ["quantitative easing", 0.7],
  ["weak dollar", 0.75], ["dollar slides", 0.7], ["dollar falls", 0.7],
  ["gold surges", 0.85], ["gold rallies", 0.85], ["record high", 0.6],
  ["inflation surges", 0.55], ["geopolitical", 0.55], ["uncertainty", 0.5],
  ["tension", 0.55], ["missile", 0.85], ["tariff", 0.5], ["debt ceiling", 0.65],
  ["yield falls", 0.6], ["yields fall", 0.6], ["yields drop", 0.6],
  ["central bank buying", 0.7], ["gold demand", 0.6],
];

const BEARISH: [string, number][] = [
  ["rate hike", -0.9], ["raises rates", -0.9], ["hawkish", -0.8],
  ["strong dollar", -0.75], ["dollar strengthens", -0.7], ["dollar rises", -0.7],
  ["dollar gains", -0.65], ["yields rise", -0.65], ["yields climb", -0.65],
  ["yield rises", -0.6], ["risk-on", -0.6], ["stocks rally", -0.5],
  ["soft landing", -0.6], ["peace", -0.6], ["ceasefire", -0.6],
  ["trade deal", -0.5], ["easing tensions", -0.6], ["de-escalat", -0.65],
  ["gold falls", -0.8], ["gold slides", -0.8], ["gold drops", -0.8],
  ["jobs beat", -0.5], ["strong jobs", -0.55], ["robust economy", -0.5],
];

const HIGH_IMPACT = [
  "fomc", "powell", "interest rate", "rate decision", "cpi", "inflation",
  "nonfarm", "payrolls", "nfp", "jobs report", "federal reserve", "fed ",
  "bank indonesia", "rate cut", "rate hike", "gdp", "pce", "default",
  "war", "attack", "missile", "emergency",
];

const MEDIUM_IMPACT = [
  "retail sales", "unemployment", "consumer confidence", "pmi", "trade",
  "treasury", "yields", "dollar", "rupiah", "oil", "central bank", "gold",
];

export interface ScoredNews {
  hash: string;
  category: string;
  source: string;
  title: string;
  url: string;
  publishedAt: number;
  sentiment: number;
  impact: "high" | "medium" | "low";
  keywords: string[];
}

export function scoreText(title: string): { sentiment: number; impact: ScoredNews["impact"]; keywords: string[] } {
  const t = title.toLowerCase();
  let score = 0;
  const keywords: string[] = [];
  for (const [kw, w] of BULLISH) {
    if (t.includes(kw)) {
      score += w;
      keywords.push(kw);
    }
  }
  for (const [kw, w] of BEARISH) {
    if (t.includes(kw)) {
      score += w;
      keywords.push(kw);
    }
  }
  let impact: ScoredNews["impact"] = "low";
  for (const kw of HIGH_IMPACT) {
    if (t.includes(kw)) {
      impact = "high";
      break;
    }
  }
  if (impact === "low") {
    for (const kw of MEDIUM_IMPACT) {
      if (t.includes(kw)) {
        impact = "medium";
        break;
      }
    }
  }
  // strong sentiment on a medium topic upgrades impact
  if (impact === "medium" && Math.abs(score) >= 1.2) impact = "high";
  if (impact === "low" && Math.abs(score) >= 0.9) impact = "medium";
  return { sentiment: clamp(score / 2.2, -1, 1), impact, keywords: keywords.slice(0, 5) };
}

/* ------------------------------------------------------------------ */
/* Fetch + persist news                                                */
/* ------------------------------------------------------------------ */
const parser = new Parser({ timeout: 7000 });

export async function fetchAndStoreNews(): Promise<number> {
  let inserted = 0;
  const results = await Promise.allSettled(
    FEEDS.map(async ({ category, url }) => {
      const feed = await parser.parseURL(url);
      const items: ScoredNews[] = [];
      for (const item of (feed.items ?? []).slice(0, 12)) {
        const title = (item.title ?? "").trim();
        if (!title) continue;
        const { sentiment, impact, keywords } = scoreText(title);
        items.push({
          hash: createHash("md5").update(title).digest("hex"),
          category,
          source: feed.title?.replace(" - Google News", "") ?? "Google News",
          title,
          url: item.link ?? "",
          publishedAt: item.isoDate ? new Date(item.isoDate).getTime() : Date.now(),
          sentiment,
          impact,
          keywords,
        });
      }
      return items;
    })
  );
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const n of r.value) {
      const res = await db
        .insert(newsItems)
        .values({
          hash: n.hash,
          category: n.category,
          source: n.source,
          title: n.title,
          url: n.url,
          publishedAt: n.publishedAt,
          sentiment: n.sentiment,
          impact: n.impact,
          keywords: n.keywords,
          createdAt: Date.now(),
        })
        .onConflictDoNothing()
        .returning({ id: newsItems.id });
      inserted += res.length;
    }
  }
  return inserted;
}

export type NewsRow = typeof newsItems.$inferSelect;

export async function recentNews(hours = 12, limit = 20): Promise<NewsRow[]> {
  const since = Date.now() - hours * 3600_000;
  return db
    .select()
    .from(newsItems)
    .where(gte(newsItems.publishedAt, since))
    .orderBy(desc(newsItems.publishedAt))
    .limit(limit);
}

/** Aggregate the last 6h of news into a directional gold signal. */
export function aggregateNewsSignal(items: NewsRow[]): {
  signal: number;
  confidence: number;
  highImpactCount: number;
  bullish: number;
  bearish: number;
} {
  const now = Date.now();
  let num = 0;
  let den = 0;
  let highImpactCount = 0;
  let bullish = 0;
  let bearish = 0;
  for (const n of items) {
    const ageH = Math.max(0.1, (now - n.publishedAt) / 3600_000);
    if (ageH > 6) continue;
    const decay = Math.exp(-ageH / 4);
    const iw = n.impact === "high" ? 1 : n.impact === "medium" ? 0.6 : 0.3;
    const w = decay * iw;
    num += (n.sentiment ?? 0) * w;
    den += w;
    if (n.impact === "high") highImpactCount++;
    if ((n.sentiment ?? 0) > 0.2) bullish++;
    else if ((n.sentiment ?? 0) < -0.2) bearish++;
  }
  const signal = den > 0 ? clamp(num / den, -1, 1) : 0;
  const coverage = clamp(den / 2, 0, 1);
  return {
    signal,
    confidence: +(coverage * (0.35 + 0.65 * Math.abs(signal))).toFixed(3),
    highImpactCount,
    bullish,
    bearish,
  };
}
