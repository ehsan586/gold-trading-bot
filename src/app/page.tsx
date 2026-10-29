"use client";

import Header from "@/components/Header";
import ControlBar from "@/components/ControlBar";
import PriceChart from "@/components/PriceChart";
import WarRoom from "@/components/WarRoom";
import ActivityFeed from "@/components/ActivityFeed";
import NewsFeed from "@/components/NewsFeed";
import StrategyBoard from "@/components/StrategyBoard";
import TradesPanel from "@/components/TradesPanel";
import LearningPanel from "@/components/LearningPanel";
import RiskPanel from "@/components/RiskPanel";
import MtfPanel from "@/components/MtfPanel";
import Mt4Panel from "@/components/Mt4Panel";
import { Panel, Chip } from "@/components/bits";
import { useDashboard } from "@/components/hooks";
import {
  CandlestickChart,
  Users,
  ScrollText,
  Trophy,
  Newspaper,
  GraduationCap,
  Briefcase,
  Radio,
  Layers,
  Cable,
} from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  const { state, connected, refresh } = useDashboard();

  return (
    <div className="px-4 pb-10">
      <Header state={state} connected={connected} />

      <main className="mx-auto max-w-[1600px] mt-4 space-y-4">
        <ControlBar state={state} onAction={() => void refresh()} />

        {/* main grid */}
        <div className="grid grid-cols-12 gap-4 items-start">
          {/* chart */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="col-span-12 xl:col-span-8"
          >
            <Panel
              title="نمودار زنده طلا — اندیکاتورها را مدیر تکنیکال رسم می‌کند"
              icon={CandlestickChart}
              pad={false}
              right={
                <>
                  <Chip tone="gold">دیتای لحظه‌ای</Chip>
                  <Chip tone="neutral">
                    <Radio size={10} />
                    زنده
                  </Chip>
                </>
              }
            >
              <PriceChart />
            </Panel>
          </motion.div>

          {/* war room */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="col-span-12 xl:col-span-4"
          >
            <Panel title="اتاق جنگ — شش کارمند هوش مصنوعی" icon={Users} accent="#7c8cff" pad>
              <WarRoom state={state} />
            </Panel>
          </motion.div>

          {/* trades */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.15 }}
            className="col-span-12 xl:col-span-8"
          >
            <Panel
              title="میز معاملات — ورود، مدیریت و خروج"
              icon={Briefcase}
              accent="#34d399"
              right={<Chip tone="good">{state?.openTrades.length ?? 0} پوزیشن باز</Chip>}
            >
              <TradesPanel state={state} onAction={() => void refresh()} />
            </Panel>
          </motion.div>

          {/* activity feed */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.2 }}
            className="col-span-12 xl:col-span-4"
          >
            <Panel title="گفت‌وگوی زنده میان عامل‌ها — اشتراک اطلاعات شرکت" icon={ScrollText} accent="#38bdf8">
              <ActivityFeed logs={state?.logs ?? []} />
            </Panel>
          </motion.div>

          {/* strategies */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.25 }}
            className="col-span-12 md:col-span-6 xl:col-span-4"
          >
            <Panel title="تالار استراتژی‌ها — نبرد استراتژی‌های برتر جهان" icon={Trophy} accent="#f7b32b">
              <StrategyBoard strategies={state?.strategies ?? []} state={state} />
            </Panel>
          </motion.div>

          {/* news */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.3 }}
            className="col-span-12 md:col-span-6 xl:col-span-4"
          >
            <Panel
              title="رادار اخبار — آمریکا، اندونزی و جهان"
              icon={Newspaper}
              accent="#38bdf8"
              right={<Chip tone="blue">{state?.news.length ?? 0} خبر فعال</Chip>}
            >
              <NewsFeed news={state?.news ?? []} />
            </Panel>
          </motion.div>

          {/* learning */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.35 }}
            className="col-span-12 md:col-span-6 xl:col-span-4"
          >
            <Panel title="مغز یادگیری — هر معامله، مدل را قوی‌تر می‌کند" icon={GraduationCap} accent="#c084fc">
              <LearningPanel state={state} />
            </Panel>
          </motion.div>

          {/* risk */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.4 }}
            className="col-span-12 md:col-span-6 xl:col-span-4"
          >
            <Panel title="برج مراقبت ریسک و اهرم" icon={CandlestickChart} accent="#fb7185">
              <RiskPanel state={state} />
            </Panel>
          </motion.div>

          {/* multi-timeframe brain */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.45 }}
            className="col-span-12 md:col-span-6 xl:col-span-4"
          >
            <Panel title="مغز چندتایم‌فریمه — سوییچ هوشمند تایم‌لاین" icon={Layers} accent="#a78bfa">
              <MtfPanel state={state} />
            </Panel>
          </motion.div>

          {/* MT4 / Alpari bridge */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.5 }}
            className="col-span-12 xl:col-span-4"
          >
            <Panel title="پل آلپاری — اتصال به متاتریدر ۴" icon={Cable} accent="#34d399">
              <Mt4Panel state={state} onAction={() => void refresh()} />
            </Panel>
          </motion.div>
        </div>

        <footer className="text-center text-[10px] text-white/25 leading-5 pt-2">
          «آرگوس» یک سامانه معاملات کاغذی (Paper Trading) برای یادگیری و پژوهش است — داده قیمتی زنده از بازار طلا، اما پول واقعی در گردش نیست.
          مسئولیت استفاده از تصمیمات سیستم در بازار واقعی با شماست. ترید با اهرم ریسک بالایی دارد.
        </footer>
      </main>
    </div>
  );
}
