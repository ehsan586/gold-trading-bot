import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";

const vazir = Vazirmatn({
  subsets: ["arabic", "latin"],
  variable: "--font-vazir",
  display: "swap",
});

export const metadata: Metadata = {
  title: "آرگوس | صندوق ترید خودگردان طلا با هوش مصنوعی",
  description:
    "سامانه چندعامله ترید هوشمند طلا — تحلیل تکنیکال، انتخاب استراتژی، پایش اخبار آمریکا/ایندونزی/جهان، مدیریت ریسک و اهرم، و یادگیری مداوم",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={vazir.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
