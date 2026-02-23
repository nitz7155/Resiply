import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import useStore from "@/lib/useStore";

type TabKey = "all" | "cancel" | "return";

function safeDate(v: any) {
  const d = v instanceof Date ? v : v ? new Date(v) : null;
  return d && !isNaN(d.getTime()) ? d : null;
}

function formatYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function formatHM(d: Date) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function getTimeLabel(o: any) {
  // 우선순위: timeLabel > time > date에서 파싱
  if (o?.timeLabel) return String(o.timeLabel);

  if (o?.time) {
    const t = String(o.time).trim();
    if (/^\d{2}:\d{2}$/.test(t)) return t;
  }

  const dt = safeDate(o?.createdAt ?? o?.created_at ?? o?.date ?? o?.orderedAt);
  return dt ? formatHM(dt) : "";
}

function classifyStatus(status?: string): "cancel" | "return" | null {
  if (!status) return null;
  if (status.includes("취소")) return "cancel";
  if (status.includes("반품")) return "return";
  return null;
}

const CancelReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const orders = useStore((s) => s.orders);
  const [tab, setTab] = useState<TabKey>("all");

  const cancelReturnOrders = useMemo(() => {
    return (orders ?? [])
      .map((o: any) => ({
        ...o,
        _kind: classifyStatus(o.status),
      }))
      .filter((o: any) => o._kind);
  }, [orders]);

  const filtered = useMemo(() => {
    if (tab === "cancel")
      return cancelReturnOrders.filter((o) => o._kind === "cancel");
    if (tab === "return")
      return cancelReturnOrders.filter((o) => o._kind === "return");
    return cancelReturnOrders;
  }, [cancelReturnOrders, tab]);

  // 날짜별 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();

    filtered.forEach((o: any) => {
      const dt = safeDate(o.createdAt ?? o.created_at ?? o.date ?? o.orderedAt);
      const key = dt ? formatYMD(dt) : String(o.date ?? "");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    });

    return Array.from(map.entries()).map(([dateLabel, items]) => ({
      dateLabel,
      items,
    }));
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white border border-slate-200 p-6">
        <h2 className="text-lg font-extrabold">취소 · 반품 내역</h2>
        <p className="mt-2 text-sm text-slate-500">
          취소/반품 진행 현황 및 내역을 확인할 수 있어요.
        </p>

        <div className="mt-4 flex gap-2">
          {[
            { key: "all", label: "전체" },
            { key: "cancel", label: "취소" },
            { key: "return", label: "반품" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key as TabKey)}
              className={`rounded-full px-4 py-2 text-sm font-semibold border ${
                tab === key
                  ? "bg-orange-100 text-orange-600 border-orange-200"
                  : "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <div className="py-10 text-center text-sm text-slate-500">
            취소/반품 내역이 없습니다.
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-slate-200 p-6 space-y-8">
          {grouped.map((g) => (
            <div key={g.dateLabel} className="space-y-3">
              <div className="text-lg font-extrabold text-slate-900">{g.dateLabel}</div>

              <div className="space-y-3">
                {g.items.map((o: any) => {
                  const timeLabel = getTimeLabel(o) || "-";
                  const kindLabel = o._kind === "cancel" ? "취소" : "반품";

                  // 아래 필드들은 store 데이터에 없을 수 있어서 안전하게 fallback
                  const receivedAt = o.receivedAt ?? o.acceptedAt ?? o.requestedAt; // "접수일자" 후보
                  const receivedLabel = (() => {
                    const rdt = safeDate(receivedAt);
                    return rdt ? formatYMD(rdt).replaceAll(".", ".") : receivedAt;
                  })();

                  const item = (o.items?.[0] ?? o.item) || {};
                  const productName = item.name ?? o.productName ?? "상품명";
                  const deliveryType = item.deliveryType ?? o.deliveryType ?? "판매자배송";
                  const price = item.price ?? o.price;
                  const qty = item.qty ?? item.quantity ?? o.qty ?? o.quantity;
                  const thumb = item.imageUrl ?? item.thumbnailUrl ?? o.imageUrl;

                  const KRW = (n?: number) =>
                    typeof n === "number" ? `${n.toLocaleString("ko-KR")}원` : "";

                  const orderNo = o.orderNo ?? o.orderId ?? o.id;

                  const handleCopy = async (e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                      await navigator.clipboard.writeText(String(orderNo));
                    } catch {
                      // clipboard 실패해도 UX 깨지 않게 무시
                    }
                  };

                  const handleReAddAll = (e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // TODO: 장바구니 다시담기 로직 연결 전 임시
                    // ex) useCartStore.getState().addItemsFromOrder(o)
                  };

                  return (
                    <button
                      key={o.id}
                      onClick={() => navigate(`/mypage/orders/${o.id}`)}
                      className="w-full text-left rounded-2xl border border-slate-200 bg-white p-5
                                hover:bg-slate-50 focus:outline-none"
                    >
                      {/* 상단: 상태 + 화살표 */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {/* ✅ (유지) 2번 사진 span 태그 */}
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ${
                              o._kind === "cancel"
                                ? "bg-rose-50 text-rose-600"
                                : "bg-sky-50 text-sky-600"
                            }`}
                          >
                            {kindLabel}
                          </span>

                          <div className="min-w-0">
                            <div className="truncate text-base font-extrabold text-slate-900">
                              {o.status ?? kindLabel}
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                              <span>주문번호 {orderNo}</span>

                              {/* 복사 아이콘(원하면 lucide 아이콘으로 교체 가능) */}
                              <button
                                onClick={handleCopy}
                                className="inline-flex items-center justify-center rounded-md p-1 hover:bg-slate-100"
                                aria-label="주문번호 복사"
                                type="button"
                              >
                                <span className="text-slate-400">⧉</span>
                              </button>

                              <span className="text-slate-300">|</span>
                              <span>{timeLabel}</span>
                            </div>
                          </div>
                        </div>

                        <span className="text-slate-400 text-xl leading-none">›</span>
                      </div>

                      {/* 접수일자 */}
                      {receivedAt ? (
                        <div className="mt-3 text-sm text-slate-500">
                          접수일자 {receivedLabel}
                        </div>
                      ) : null}

                      {/* 구분선 */}
                      <div className="my-4 h-px bg-slate-100" />

                      {/* 상품 요약 */}
                      <div className="flex items-start gap-4">
                        <div className="h-12 w-12 overflow-hidden rounded-xl bg-slate-100 shrink-0">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt={productName}
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-slate-400">{deliveryType}</div>
                          <div className="mt-1 text-sm font-semibold text-slate-900 line-clamp-2">
                            {productName}
                          </div>

                          <div className="mt-2 text-sm text-slate-600">
                            <span className="font-extrabold text-slate-900">
                              {KRW(price)}
                            </span>
                            {typeof qty !== "undefined" ? (
                              <span className="ml-2">{qty}개</span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* 하단 버튼 */}
                      <button
                        onClick={handleReAddAll}
                        type="button"
                        className="mt-4 w-full rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-700
                                  hover:bg-slate-200"
                      >
                        전체 상품 다시 담기
                      </button>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CancelReturnPage;
