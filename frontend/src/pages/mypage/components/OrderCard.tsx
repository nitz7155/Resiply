import React, { useMemo, useState } from "react";
import { mapOrderStatus, arrivalLabel } from "@/api/orderStatus";

const KRW = (n: number) => n.toLocaleString("ko-KR");

function formatDateTime(d: any) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return "";
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${m}.${day} (${["일", "월", "화", "수", "목", "금", "토"][dt.getDay()]}) ${hh}:${mm}`;
}

type Props = {
  order: any;
};

const OrderCard: React.FC<Props> = ({ order }) => {
  const items = (order.items ?? order.products ?? []) as any[];
  const status = mapOrderStatus(order.status ?? order.deliveryStatus ?? (order.isDelivered ? "배송완료" : "배송완료"));

  const orderedAt = order.orderedAt ?? order.createdAt ?? order.date;
  const orderNo = order.orderNumber ?? order.id ?? "-";

  const [expanded, setExpanded] = useState(false);

  const visibleItems = useMemo(() => {
    if (expanded) return items;
    return items.slice(0, 3);
  }, [expanded, items]);

  const remaining = Math.max(0, items.length - 3);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4">
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold text-primary">{status}</span>
            <span className="w-1 h-1 rounded-full bg-[#111] opacity-20 inline-block" aria-hidden></span>
            <span className="text-xs text-slate-500">{formatDateTime(orderedAt)}</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            주문번호 <span className="font-semibold text-slate-700 dark:text-slate-200">{orderNo}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {status === "상품 준비중" && (
            <div className="text-xs text-slate-500">{arrivalLabel(orderedAt)}</div>
          )}

          {/* Right arrow / action */}
          <button
            className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900"
            onClick={() => alert("주문 상세")}
            aria-label="주문 상세"
          >
            ›
          </button>
        </div>
      </div>

      {/* Items */}
      <div className="mt-4 space-y-3">
        {visibleItems.map((it: any, idx: number) => (
          <div key={`${it.id ?? idx}`} className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shrink-0">
              {it.image ? (
                <img
                  src={it.image}
                  alt={it.name ?? "상품 이미지"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-xs text-slate-400">
                  이미지
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-xs text-slate-500">
                {it.badge ?? it.deliveryType ?? "샛별배송"}
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                {it.name ?? it.title ?? "상품명"}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {KRW(it.price ?? it.amount ?? 0)}원
                </div>
                <div className="text-sm text-slate-500">
                  {it.qty ?? it.quantity ?? 1}개
                </div>
              </div>
            </div>

            <button
              className="h-10 w-10 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900"
              onClick={() => alert("장바구니 담기 (mock)")}
              aria-label="장바구니 담기"
              title="장바구니 담기"
            >
              🛒
            </button>
          </div>
        ))}
      </div>

      {/* Expand */}
      {items.length > 3 && (
        <div className="mt-4">
          <button
            className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded
              ? "접기"
              : `총 ${items.length}건 주문 펼쳐보기${remaining > 0 ? ` (+${remaining})` : ""}`}
          </button>
        </div>
      )}
    </div>
  );
};

export default OrderCard;
