import { NextResponse } from "next/server";
import { EA_SOURCE, EA_FILENAME } from "@/lib/ea-source";

export const dynamic = "force-dynamic";

/** Download the ArgusBridge Expert Advisor for MetaTrader 4 */
export async function GET() {
  return new NextResponse(EA_SOURCE, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${EA_FILENAME}"`,
      "Cache-Control": "no-store",
    },
  });
}
