// 합성 샘플 데이터 생성기 (실제 고객 데이터가 아님). 결정적 난수를 사용하므로 항상 같은 결과가 나온다.
import { writeFileSync } from "node:fs";

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261028);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

const products = [
  ["GTXPro", 4821, 0.5], ["MG Special", 55, 0.55], ["MG Advanced", 3393, 0.5],
  ["GTX Basic", 550, 0.52], ["GTX Plus Pro", 5482, 0.48], ["GTX Plus Basic", 1096, 0.5], ["GTK 500", 26768, 0.2],
];
const agents = Array.from({ length: 24 }, (_, i) => `Agent ${String.fromCharCode(65 + i)}`);
const agentBias = Object.fromEntries(agents.map((a, i) => [a, i === 3 ? -0.25 : (rand() - 0.5) * 0.15]));
const accounts = Array.from({ length: 60 }, (_, i) => `Account ${String(i + 1).padStart(2, "0")}`);
const start = Date.parse("2025-01-01");
const end = Date.parse("2026-10-28");

const rows = [["opportunity_id", "sales_agent", "product", "account", "deal_stage", "engage_date", "close_date", "close_value"]];
for (let i = 0; i < 3000; i++) {
  const [product, price, base] = pick(products);
  const agent = pick(agents);
  const engage = start + Math.floor(rand() * (end - start));
  const r = rand();
  let stage;
  const p = Math.min(0.9, Math.max(0.05, base + agentBias[agent]));
  if (r < 0.14) stage = "Prospecting";
  else if (r < 0.3) stage = "Engaging";
  else stage = rand() < p ? "Won" : "Lost";
  let engageDate = iso(engage);
  let closeDate = "";
  let value = "";
  if (stage === "Prospecting") engageDate = "";
  else if (stage === "Won" || stage === "Lost") {
    const close = engage + Math.floor(10 + rand() * 130) * 86400000;
    if (close > end) { stage = "Engaging"; }
    else {
      closeDate = iso(close);
      value = stage === "Won" ? Math.round(price * (0.8 + rand() * 0.4)) : 0;
    }
  }
  rows.push([`OPP-${String(i + 1).padStart(5, "0")}`, agent, product, accounts[Math.floor(Math.pow(rand(), 1.6) * accounts.length)], stage, engageDate, closeDate, value]);
}
writeFileSync("public/samples/sales_pipeline.csv", rows.map((r) => r.join(",")).join("\n") + "\n");

// 범용 샘플: 주문 데이터
const regions = ["서울", "경기", "부산", "대구", "광주"];
const cats = ["가전", "식품", "의류", "도서"];
const orders = [["주문번호", "주문일", "지역", "카테고리", "수량", "단가", "매출"]];
for (let i = 0; i < 1500; i++) {
  const d = iso(Date.parse("2025-10-01") + Math.floor(rand() * 390) * 86400000);
  const qty = 1 + Math.floor(rand() * 9);
  const price = Math.round((5 + rand() * 95) * 1000);
  orders.push([`O-${i + 1}`, d, pick(regions), pick(cats), qty, price, qty * price]);
}
writeFileSync("public/samples/retail_orders.csv", orders.map((r) => r.join(",")).join("\n") + "\n");
console.log("generated", rows.length - 1, orders.length - 1);
