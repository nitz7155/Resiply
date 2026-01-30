import React, { useMemo } from "react";

type PointType = "earn" | "use";

type PointItem = {
  id: string;
  type: PointType;
  title: string;
  amount: number; // earn: +, use: - 로 표기할거라 절대값으로 저장
  date: string; // "2026-01-05"
  note?: string;
};

function ymdToKorean(ymd: string) {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${y}.${m}.${d}`;
}

const mockPointBalance = 1200;

const mockHistory: PointItem[] = [
  {
    id: "p1",
    type: "earn",
    title: "구매 적립",
    amount: 300,
    date: "2026-01-05",
    note: "주문번호 #A10293",
  },
  {
    id: "p2",
    type: "use",
    title: "적립금 사용",
    amount: 500,
    date: "2026-01-03",
    note: "주문 결제 차감",
  },
  {
    id: "p3",
    type: "earn",
    title: "이벤트 적립",
    amount: 1000,
    date: "2025-12-28",
    note: "연말 프로모션",
  },
];

export default function PointsPage() {
  const balance = useMemo(() => mockPointBalance, []);
  const history = useMemo(() => mockHistory, []);

  const earnedSum = useMemo(
    () => history.filter((h) => h.type === "earn").reduce((a, b) => a + b.amount, 0),
    [history]
  );
  const usedSum = useMemo(
    () => history.filter((h) => h.type === "use").reduce((a, b) => a + b.amount, 0),
    [history]
  );

  return (
    <div className="w-full">
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
        {/* Header */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-xl font-extrabold text-slate-900 dark:text-white">
              적립금
            </div>
            <div className="mt-1 text-sm text-slate-500">
              적립/사용 내역을 확인할 수 있어요.
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
            <div className="text-xs text-slate-500">사용 가능 적립금</div>
            <div className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">
              {balance.toLocaleString("ko-KR")}원
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <div className="text-xs text-slate-500">총 적립</div>
            <div className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">
              +{earnedSum.toLocaleString("ko-KR")}원
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <div className="text-xs text-slate-500">총 사용</div>
            <div className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">
              -{usedSum.toLocaleString("ko-KR")}원
            </div>
          </div>
        </div>

        {/* History list */}
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="px-5 py-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
            <div className="text-sm font-bold text-slate-700 dark:text-slate-200">
              적립금 내역
            </div>
          </div>

          {history.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">내역이 없어요.</div>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {history.map((h) => {
                const isEarn = h.type === "earn";
                return (
                  <li key={h.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={[
                              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold border",
                              isEarn
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-100 dark:border-emerald-900"
                                : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200 border-rose-100 dark:border-rose-900",
                            ].join(" ")}
                          >
                            {isEarn ? "적립" : "사용"}
                          </span>
                          <div className="truncate text-sm font-extrabold text-slate-900 dark:text-white">
                            {h.title}
                          </div>
                        </div>

                        <div className="mt-1 text-xs text-slate-500">
                          {ymdToKorean(h.date)}
                          {h.note ? (
                            <span className="ml-2 text-slate-400">· {h.note}</span>
                          ) : null}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div
                          className={[
                            "text-sm font-extrabold",
                            isEarn
                              ? "text-emerald-700 dark:text-emerald-200"
                              : "text-rose-700 dark:text-rose-200",
                          ].join(" ")}
                        >
                          {isEarn ? "+" : "-"}
                          {h.amount.toLocaleString("ko-KR")}원
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-6 text-xs text-slate-400">
          * 적립금은 결제 단계에서 적용 가능합니다.
        </div>
      </div>
    </div>
  );
}
