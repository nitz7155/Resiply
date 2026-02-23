import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ClipboardList } from "lucide-react";
import { useNavigate } from "react-router-dom";
import useStore from "@/lib/useStore";
import { useAuth } from "@/lib/AuthContext";
import { listOrders } from "@/api/order";
import { mapOrderStatus, arrivalLabel } from "@/api/orderStatus";
import { Search } from "lucide-react";

type PeriodKey = "3m" | "6m" | "1y" | "all";

function toDate(d: any) {
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

function ymd(dt: Date) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function hhmm(v: any) {
  const dt = toDate(v);
  if (!dt) return "";
  const h = String(dt.getHours()).padStart(2, "0");
  const m = String(dt.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function withinPeriod(orderDate: Date, period: PeriodKey) {
  if (period === "all") return true;
  const now = new Date();
  const months =
    period === "3m" ? 3 : period === "6m" ? 6 : period === "1y" ? 12 : 999;

  const from = new Date(now);
  from.setMonth(from.getMonth() - months);
  return orderDate >= from;
}

// ✅ 배송완료 판정(데이터가 조금 달라도 최대한 커버)
function isDelivered(order: any) {
  const s = String(order.status ?? "").replace(/\s/g, "");
  return s === "배송완료" || s.toLowerCase() === "delivered";
}

const OrderPage: React.FC = () => {
  const navigate = useNavigate();
  const orders = useStore((s) => s.orders) ?? [];

  const [period, setPeriod] = useState<PeriodKey>("3m");
  const [query, setQuery] = useState("");

  // ✅ 커스텀 기간 드롭다운 상태
  const [isPeriodOpen, setIsPeriodOpen] = useState(false);
  const [isPeriodMounted, setIsPeriodMounted] = useState(false); // ✅ 닫힘 애니메이션용
  const periodRef = useRef<HTMLDivElement | null>(null);

  const periodOptions = useMemo(
    () =>
      [
        { value: "3m", label: "3개월" },
        { value: "6m", label: "6개월" },
        { value: "1y", label: "1년" },
        { value: "all", label: "전체" },
      ] as const,
    []
  );

  const currentPeriodLabel =
    periodOptions.find((o) => o.value === period)?.label ?? "기간 선택";

  // ✅ 드롭다운 열고/닫을 때 Mount 제어 (닫힘 애니메이션 보이게)
  useEffect(() => {
    if (isPeriodOpen) {
      setIsPeriodMounted(true);
      return;
    }
    const t = window.setTimeout(() => setIsPeriodMounted(false), 140); // 애니메이션 시간과 맞추기
    return () => window.clearTimeout(t);
  }, [isPeriodOpen]);

  // ✅ 드롭다운 바깥 클릭하면 닫기
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!periodRef.current) return;
      if (!periodRef.current.contains(e.target as Node)) setIsPeriodOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // fetch orders for logged-in user and populate store
  const setOrders = useStore((s) => (s as any).setOrders);
  const { user } = useAuth();

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        if (!user?.id) return;
        const res = await listOrders(Number(user.id));
        console.debug("[orders api] raw response:", res);
        const mapped = (res as any[]).map((o) => {
          const created = o.created_at || o.createdAt || o.date || new Date().toISOString();
          const createdDt = toDate(created);

          return {
            id: String(o.id),
            productName:
              (o.order_details && o.order_details[0]?.product?.title) || "",
            date: created,                 // ✅ 기존 date는 created_at로 통일
            createdAt: created,            // ✅ arrivalLabel에서도 쓰게끔
            dateLabel: createdDt ? ymd(createdDt) : "",  // ✅ 필요하면 사용
            timeLabel: createdDt ? hhmm(createdDt) : "", // ✅ 핵심: 실제 시간

            total: `₩${(o.total_price ?? 0).toLocaleString()}`,
            status: o.status,
            items: (o.order_details || []).map((od: any) => ({
              id: od.id,
              product_id: od.product_id,
              name: od.product?.title || od.product?.name,
              quantity: od.quantity,
              price: od.product?.price,
              image: od.product?.main_thumbnail,
              has_review: od.has_review,
            })),
            order_details: (o.order_details || []).map((od: any) => ({
              ...od,
              has_review: od.has_review,
            })),
          };
        });
        // show mapped statuses for quick debug
        console.debug(
          "[orders api] mapped statuses:",
          (mapped as any[]).map((o) => ({ id: o.id, status: o.status }))
        );
        setOrders(mapped as any);
      } catch (err) {
        // ignore errors
      }
    };

    fetchOrders();
  }, [user?.id]);

  const grouped = useMemo(() => {
    const filtered = orders
      .map((o: any) => {
        const dt = toDate(o.createdAt ?? o.date ?? o.orderedAt);
        return { ...o, __dt: dt };
      })
      .filter((o: any) => !!o.__dt)
      .filter((o: any) => withinPeriod(o.__dt, period))
      .filter((o: any) => {
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();

        const items = (o.items ?? o.products ?? []) as any[];
        const hitName = items.some((it) =>
          String(it.name ?? it.title ?? "").toLowerCase().includes(q)
        );

        const hitOrderId = String(o.orderNumber ?? o.id ?? "")
          .toLowerCase()
          .includes(q);

        return hitName || hitOrderId;
      })
      .sort((a: any, b: any) => b.__dt.getTime() - a.__dt.getTime());

    const map = new Map<string, any[]>();
    filtered.forEach((o: any) => {
      const key = ymd(o.__dt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    });

    return Array.from(map.entries()).map(([date, list]) => ({
      date,
      orders: list,
    }));
  }, [orders, period, query]);

  const filteredCount = useMemo(
    () => grouped.reduce((acc, g) => acc + (g.orders?.length ?? 0), 0),
    [grouped]
  );

  const latestDateLabel = grouped[0]?.date ?? null;

  return (
    <div className="space-y-4">
      {/* ✅ Header */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {/* Left: icon + title + meta */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="mt-0.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2">
              <ClipboardList className="h-5 w-5 text-slate-700 dark:text-slate-200" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold whitespace-nowrap">
                  주문 내역
                </h2>
              </div>
            </div>
          </div>

          {/* Right: Filter bar */}
          <div className="w-full md:max-w-[720px]">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-2">
                {/* ✅ 기간 필터 (커스텀 드롭다운 + 애니메이션) */}
                <div ref={periodRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setIsPeriodOpen((v) => !v)}
                    className={[
                      "h-10 w-full min-w-[140px] rounded-xl border px-4 py-2 text-sm",
                      "border-slate-200 dark:border-slate-700",
                      "bg-white dark:bg-slate-950",
                      "hover:bg-slate-100 dark:hover:bg-slate-900",
                      "flex items-center justify-between gap-2",
                      "transition-colors",
                    ].join(" ")}
                    aria-haspopup="listbox"
                    aria-expanded={isPeriodOpen}
                  >
                    {/* ✅ 선택한 기간 글자 색상 변경 */}
                    <span className="font-semibold text-orange-500">
                      {currentPeriodLabel}
                    </span>

                    {/* ✅ 화살표 180도 회전 */}
                    <ChevronDown
                      className={[
                        "h-4 w-4 text-slate-500 transition-transform duration-200",
                        isPeriodOpen ? "rotate-180" : "rotate-0",
                      ].join(" ")}
                    />
                  </button>

                  {/* ✅ Mount 유지 + 열림/닫힘 애니메이션 */}
                  {isPeriodMounted && (
                    <div
                      className={[
                        "absolute left-0 z-20 mt-2 w-full overflow-hidden rounded-xl border",
                        "border-slate-200 dark:border-slate-800",
                        "bg-white dark:bg-slate-950 shadow-lg",
                        // 애니메이션
                        "origin-top transition-all duration-150 ease-out",
                        isPeriodOpen
                          ? "opacity-100 translate-y-0 scale-100"
                          : "opacity-0 -translate-y-1 scale-[0.98] pointer-events-none",
                      ].join(" ")}
                      role="listbox"
                      tabIndex={-1}
                    >
                      {periodOptions.map((opt) => {
                        const selected = opt.value === period;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => {
                              setPeriod(opt.value);
                              setIsPeriodOpen(false);
                            }}
                            className={[
                              "w-full px-3 py-2 text-left text-sm",
                              "hover:bg-slate-100 dark:hover:bg-slate-900",
                              "transition-colors",
                              selected
                                ? "font-semibold text-orange-500"
                                : "text-slate-900 dark:text-slate-100",
                            ].join(" ")}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="상품명으로 검색"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-9 py-2 text-sm outline-none focus:border-slate-300 dark:focus:border-slate-700"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ 주문내역: 바깥 테두리 1개로 통합 + 회색 선(divide-y) 제거 */}
      <section className="w-full">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {/* ✅ 기존 divide-y 제거 (3번째 사진 회색 선 제거) */}
          <div>
            {grouped.map((group, gi) => (
              <div
                key={group.date}
                className={[
                  "py-4",
                  // 그룹 사이 시각적 분리만 살짝(선이 아니라 여백으로)
                  gi === 0 ? "pt-5" : "pt-6",
                ].join(" ")}
              >
                {/* ✅ 날짜 아래 회색 선 제거: 선을 만들던 divide-y 자체를 제거했음 */}
                <div className="px-6 pt-2 pb-3 text-lg font-extrabold text-gray-900">
                  {group.date}
                </div>

                <div className="px-6 pb-2 space-y-3">
                  {group.orders.map((order: any) => {
                    const delivered = isDelivered(order);
                    const hasPendingReview = (order.order_details ?? order.items ?? []).some((od: any) => !od?.has_review);

                    return (
                      <div
                        key={order.id ?? order.orderNumber}
                        className="rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() =>
                            navigate(
                              `/mypage/orders/${order.id ?? order.orderNumber}`
                            )
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              navigate(
                                `/mypage/orders/${order.id ?? order.orderNumber}`
                              );
                            }
                          }}
                          className="w-full text-left px-5 py-4 flex items-center justify-between focus:outline-none"
                        >
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-orange-500">
                                {mapOrderStatus ? mapOrderStatus(order.status) : order.status ?? "배송중"}
                              </span>
                              <span className="w-1 h-1 rounded-full bg-[#111] opacity-20 inline-block" aria-hidden />
                              <span className="text-sm text-gray-500">
                                {mapOrderStatus(order.status) === "상품 준비중"
                                  ? arrivalLabel(order.createdAt ?? order.date ?? order.orderedAt)
                                  : (order.timeLabel || hhmm(order.createdAt ?? order.date ?? order.orderedAt) || "-")}
                              </span>
                            </div>

                            <div className="text-sm text-gray-600">
                              주문번호{" "}
                              <span className="font-semibold text-gray-900">
                                {order.orderNo ?? order.orderNumber ?? order.id}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {delivered && hasPendingReview && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();

                                  let url = `/mypage/review/new?orderId=${order.id ?? order.orderNumber}`;

                                  navigate(url);
                                }}
                                className="h-9 rounded-full border border-orange-200 bg-orange-50 px-3 text-sm font-semibold text-orange-600 hover:bg-orange-100"
                              >
                                리뷰 작성
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {grouped.length === 0 && (
              <div className="px-6 py-10 text-center text-sm text-gray-500">
                주문 내역이 없습니다.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default OrderPage;
