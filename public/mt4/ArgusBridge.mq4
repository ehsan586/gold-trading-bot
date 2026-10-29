//+------------------------------------------------------------------+
//|                                                  ArgusBridge.mq4 |
//|              ARGUS AI Fund — MetaTrader 4 / Alpari trade bridge   |
//|                                                                  |
//|  HOW TO INSTALL                                                   |
//|  1. Copy this file to  MT4/MQL4/Experts/  and compile (F7)        |
//|  2. Tools > Options > Expert Advisors: enable                     |
//|     "Allow WebRequest for listed URL" and add your Bridge_Url     |
//|  3. Drag the EA on the XAUUSD chart, set Bridge_Url + Token       |
//|  4. Keep AutoTrading ON — the AI desk now drives the terminal     |
//+------------------------------------------------------------------+
#property copyright "ARGUS AI"
#property strict

input string Bridge_Url      = "https://YOUR-DASHBOARD-HOST"; // آدرس داشبورد آرگوس
input string Bridge_Token    = "";        // توکنی که پنل به شما می‌دهد
input string Symbol_Name     = "XAUUSD";  // در برخی سرورهای آلپاری: GOLD
input int    Poll_Seconds    = 10;        // فاصله اتصال به مغز (ثانیه)
input int    Max_Slippage    = 30;        // لغزش مجاز (پوینت)
input int    Magic_Number    = 770311;    // شناسه معاملات هوشمند

string   Sym;
string   PendingAcks = "";
datetime LastOkPoll  = 0;

//+------------------------------------------------------------------+
int OnInit()
{
   Sym = Symbol_Name;
   if(MarketInfo(Sym, MODE_POINT) == 0)
   {
      Sym = "GOLD";                    // fallback for Alpari servers naming
      if(MarketInfo(Sym, MODE_POINT) == 0)
      {
         Alert("ArgusBridge: symbol not found. Set Symbol_Name input correctly.");
         return(INIT_FAILED);
      }
   }
   EventSetTimer(MathMax(5, Poll_Seconds));
   Print("ArgusBridge online — symbol: ", Sym);
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason) { EventKillTimer(); }
void OnTick() {}                     // everything happens on the timer

void OnTimer()
{
   PullAndExecute();
   PushState();
}

//+------------------------------------------------------------------+
//| tiny JSON scanners (payloads are produced by our own server)      |
//+------------------------------------------------------------------+
double JsonNum(string json, string key, double def = 0)
{
   string pat = "\"" + key + "\":";
   int i = StringFind(json, pat);
   if(i < 0) return(def);
   i += StringLen(pat);
   int j = i;
   while(j < StringLen(json))
   {
      string ch = StringSubstr(json, j, 1);
      if((ch < "0" || ch > "9") && ch != "." && ch != "-") break;
      j++;
   }
   return(StringToDouble(StringSubstr(json, i, j - i)));
}

string JsonStr(string json, string key, string def = "")
{
   string pat = "\"" + key + "\":\"";
   int i = StringFind(json, pat);
   if(i < 0) return(def);
   i += StringLen(pat);
   int j = StringFind(json, "\"", i);
   if(j < 0) return(def);
   return(StringSubstr(json, i, j - i));
}

//+------------------------------------------------------------------+
//| HTTP helpers                                                      |
//+------------------------------------------------------------------+
string HttpGet(string url)
{
   char   data[], result[];
   string headers = "";
   string out = "";
   int res = WebRequest("GET", url, headers, 5000, data, result, headers);
   if(res > 0) out = CharArrayToString(result);
   else Print("ArgusBridge WebRequest GET failed: ", GetLastError());
   return(out);
}

int HttpPost(string url, string body)
{
   char   data[], result[];
   string headers = "Content-Type: application/json\r\n";
   StringToCharArray(body, data, 0, StringLen(body));
   int res = WebRequest("POST", url, headers, 5000, data, result, headers);
   if(res < 0) Print("ArgusBridge WebRequest POST failed: ", GetLastError());
   return(res);
}

//+------------------------------------------------------------------+
//| pull commands from the AI desk and execute                        |
//+------------------------------------------------------------------+
void PullAndExecute()
{
   string url = Bridge_Url + "/api/mt4/pull?token=" + Bridge_Token;
   string json = HttpGet(url);
   if(StringLen(json) < 10) return;
   LastOkPoll = TimeCurrent();

   string marker = "\"commands\":[";
   int ci = StringFind(json, marker);
   if(ci < 0) return;
   string list = StringSubstr(json, ci + StringLen(marker));
   int end = StringFind(list, "]");
   if(end < 0) return;
   list = StringSubstr(list, 0, end);

   // split command objects on "},{"
   int pos = 0;
   while(pos < StringLen(list))
   {
      int s = StringFind(list, "{", pos);
      if(s < 0) break;
      int e = StringFind(list, "}", s);
      if(e < 0) break;
      string cmd = StringSubstr(list, s, e - s + 1);
      ProcessCommand(cmd);
      pos = e + 1;
   }
}

void ProcessCommand(string cmd)
{
   int    id     = (int)JsonNum(cmd, "id", 0);
   string type   = JsonStr(cmd, "type", "");
   if(id == 0 || type == "") return;

   if(type == "open")
   {
      string side = JsonStr(cmd, "side", "buy");
      double lots  = JsonNum(cmd, "lots", 0);
      double sl    = JsonNum(cmd, "sl", 0);
      double tp    = JsonNum(cmd, "tp", 0);
      int    tradeId = (int)JsonNum(cmd, "tradeId", 0);

      double minLot = MarketInfo(Sym, MODE_MINLOT);
      double lotStep = MarketInfo(Sym, MODE_LOTSTEP);
      double maxLot = MarketInfo(Sym, MODE_MAXLOT);
      lots = MathFloor(lots / lotStep) * lotStep;
      lots = MathMax(minLot, MathMin(maxLot, lots));

      RefreshRates();
      int    cmdType = (side == "buy") ? OP_BUY : OP_SELL;
      double price   = (side == "buy") ? MarketInfo(Sym, MODE_ASK) : MarketInfo(Sym, MODE_BID);
      int    digits  = (int)MarketInfo(Sym, MODE_DIGITS);
      int ticket = OrderSend(Sym, cmdType, lots, NormalizeDouble(price, digits),
                             Max_Slippage, NormalizeDouble(sl, digits),
                             NormalizeDouble(tp, digits),
                             "Argus #" + IntegerToString(tradeId), Magic_Number, 0,
                             (side == "buy") ? clrLimeGreen : clrTomato);
      if(ticket > 0)
      {
         if(OrderSelect(ticket, SELECT_BY_TICKET))
            AddAck(id, true, ticket, OrderOpenPrice(), "");
         else
            AddAck(id, true, ticket, price, "");
         Print("ArgusBridge OPEN executed — ticket ", ticket);
      }
      else
         AddAck(id, false, 0, 0, "OrderSend error " + IntegerToString(GetLastError()));
   }
   else if(type == "close")
   {
      int ticket = (int)JsonNum(cmd, "ticket", 0);
      bool ok = false;
      string err = "";
      if(ticket > 0 && OrderSelect(ticket, SELECT_BY_TICKET) && OrderCloseTime() == 0)
      {
         RefreshRates();
         double price = (OrderType() == OP_BUY) ? MarketInfo(Sym, MODE_BID) : MarketInfo(Sym, MODE_ASK);
         ok = OrderClose(ticket, OrderLots(), NormalizeDouble(price, (int)MarketInfo(Sym, MODE_DIGITS)), Max_Slippage, clrOrange);
         if(!ok) err = "OrderClose error " + IntegerToString(GetLastError());
      }
      else err = "ticket not found / already closed";
      AddAck(id, ok, ticket, 0, err);
      if(ok) Print("ArgusBridge CLOSE executed — ticket ", ticket);
   }
}

void AddAck(int commandId, bool ok, int ticket, double fillPrice, string error)
{
   if(StringLen(PendingAcks) > 0) PendingAcks += ",";
   PendingAcks += "{\"commandId\":" + IntegerToString(commandId)
                + ",\"ok\":" + (ok ? "true" : "false")
                + ",\"ticket\":" + IntegerToString(ticket)
                + ",\"fillPrice\":" + DoubleToString(fillPrice, 2)
                + (StringLen(error) > 0 ? ",\"error\":\"" + error + "\"" : "")
                + "}";
}

//+------------------------------------------------------------------+
//| push account state + open positions + acks to the AI desk         |
//+------------------------------------------------------------------+
void PushState()
{
   string positions = "";
   for(int i = 0; i < OrdersTotal(); i++)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() != Sym && OrderMagicNumber() != Magic_Number) continue;
      string t = (OrderType() == OP_BUY) ? "buy" : ((OrderType() == OP_SELL) ? "sell" : "");
      if(t == "") continue;
      if(StringLen(positions) > 0) positions += ",";
      positions += "{\"ticket\":" + IntegerToString(OrderTicket())
                 + ",\"type\":\"" + t + "\""
                 + ",\"lots\":" + DoubleToString(OrderLots(), 2)
                 + ",\"openPrice\":" + DoubleToString(OrderOpenPrice(), (int)MarketInfo(Sym, MODE_DIGITS))
                 + ",\"sl\":" + DoubleToString(OrderStopLoss(), (int)MarketInfo(Sym, MODE_DIGITS))
                 + ",\"tp\":" + DoubleToString(OrderTakeProfit(), (int)MarketInfo(Sym, MODE_DIGITS))
                 + ",\"profit\":" + DoubleToString(OrderProfit() + OrderSwap() + OrderCommission(), 2)
                 + ",\"openTime\":" + IntegerToString((int)OrderOpenTime()) + "}";
   }

   string body = "{\"token\":\"" + Bridge_Token + "\""
               + ",\"balance\":" + DoubleToString(AccountBalance(), 2)
               + ",\"equity\":" + DoubleToString(AccountEquity(), 2)
               + ",\"currency\":\"" + AccountCurrency() + "\""
               + ",\"positions\":[" + positions + "]"
               + ",\"acks\":[" + PendingAcks + "]}";

   int res = HttpPost(Bridge_Url + "/api/mt4/push", body);
   if(res > 0) PendingAcks = "";   // acks delivered — clear buffer
}
//+------------------------------------------------------------------+
