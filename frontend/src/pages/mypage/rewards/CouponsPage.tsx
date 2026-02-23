import { useMemo, useState } from "react";

type CouponStatus = "available" | "used" | "expired";

type Coupon = {
  id: string;
  title: string;
  discountLabel: string; // "10%" / "3,000원" 등
  minOrderLabel?: string; // "3만원 이상 구매 시"
  expiry: string; // "2026-02-01"
  status: CouponStatus;
  description?: string;
};

function ymdToKorean(ymd: string) {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${y}.${m}.${d}`;
}

const badgeStyle: Record<CouponStatus, string> = {
  available:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-100 dark:border-emerald-900",
  used:
    "bg-slate-50 text-slate-600 dark:bg-slate-950 dark:text-slate-300 border border-slate-200 dark:border-slate-800",
  expired:
    "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200 border border-rose-100 dark:border-rose-900",
};

const statusLabel: Record<CouponStatus, string> = {
  available: "사용 가능",
  used: "사용 완료",
  expired: "기간 만료",
};

// TODO: Connect to backend API to fetch user coupons
const mockCoupons: Coupon[] = [];

type TabKey = "available" | "used" | "expired";

const tabItems: { key: TabKey; label: string }[] = [
  { key: "available", label: "사용 가능" },
  { key: "used", label: "사용 완료" },
  { key: "expired", label: "기간 만료" },
];

export default function CouponsPage() {
  const [tab, setTab] = useState<TabKey>("available");

  // TODO: Replace with API call to fetch user coupons
  const coupons = useMemo(() => mockCoupons, []);

  const counts = useMemo(() => {
    const c = { available: 0, used: 0, expired: 0 };
    for (const item of coupons) c[item.status] += 1;
    return c;
  }, [coupons]);

  const filtered = useMemo(
    () => coupons.filter((c) => c.status === tab),
    [coupons, tab]
  );

  return (
    <div className="w-full">
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xl font-extrabold text-slate-900 dark:text-white">
              쿠폰
            </div>
            <div className="mt-1 text-sm text-slate-500">
              보유 쿠폰을 확인하고 주문 시 적용할 수 있어요.
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-5 flex gap-2">
          {tabItems.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={[
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
                  active
                    ? "bg-primary/10 text-primary"
                    : "bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800",
                ].join(" ")}
              >
                {t.label}
                <span className="ml-2 text-xs opacity-70">
                  {t.key === "available"
                    ? counts.available
                    : t.key === "used"
                    ? counts.used
                    : counts.expired}
                </span>
              </button>
            );
          })}
        </div>

        {/* List */}
        <div className="mt-5 space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-6 text-sm text-slate-500">
              해당 상태의 쿠폰이 없어요.
            </div>
          ) : (
            filtered.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${badgeStyle[c.status]}`}
                      >
                        {statusLabel[c.status]}
                      </span>
                      <div className="truncate text-base font-extrabold text-slate-900 dark:text-white">
                        {c.title}
                      </div>
                    </div>

                    <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                      <span className="font-extrabold">{c.discountLabel}</span>
                      {c.minOrderLabel ? (
                        <span className="ml-2 text-slate-500">
                          · {c.minOrderLabel}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 text-xs text-slate-500">
                      유효기간: {ymdToKorean(c.expiry)}
                      {c.description ? (
                        <span className="ml-2 text-slate-400">
                          · {c.description}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="shrink-0">
                    <button
                      type="button"
                      disabled={c.status !== "available"}
                      className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 disabled:opacity-50 disabled:hover:bg-slate-50 disabled:cursor-not-allowed"
                      onClick={() => {
                        // TODO: 실제 “쿠폰 적용” UX는 주문/장바구니에서 처리하는 경우가 많음
                        // 필요하면 여기서 장바구니로 이동시켜도 됨.
                      }}
                    >
                      {c.status === "available" ? "사용하기" : "사용 불가"}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-6 text-xs text-slate-400">
          * 쿠폰은 주문/장바구니 화면에서 자동 적용 또는 선택 적용 가능합니다.
        </div>
      </div>
    </div>
  );
}
