import { useMemo, useState } from "react";
import { mapOrderStatus, arrivalLabel } from "@/api/orderStatus";
import { useNavigate, useParams } from "react-router-dom";
import useStore from "@/lib/useStore";
import { useCartStore } from "@/lib/cartStore";
import AddToCartDialog from "@/components/common/AddToCartDialog";

const KRW = (n: number) => n.toLocaleString("ko-KR");

type OrderItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  imageUrl?: string;
  image?: string;
  optionText?: string;
};

type Order = {
  id: string;
  date: string;
  createdAt?: string;
  orderedAt?: string;
  status: string;
  total: string | number;
  productName?: string;

  items?: OrderItem[];

  payment?: {
    itemsAmount?: number;
    discountAmount?: number;
    shippingFee?: number;
    couponDiscount?: number;
    cardDiscount?: number;
    finalAmount?: number;
  };
};

export default function OrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const orders = useStore((s: any) => s.orders) as Order[];

  const order = useMemo(() => {
    return orders?.find((o) => o.id === orderId);
  }, [orders, orderId]);

  const [openPayment, setOpenPayment] = useState(true);

  const items: OrderItem[] = useMemo(() => {
    if (!order) return [];
    if (order.items && order.items.length > 0) return order.items;

    const totalNum =
      typeof order.total === "number"
        ? order.total
        : Number(String(order.total).replace(/[^\d]/g, "")) || 0;

    return [
      {
        id: `${order.id}-item-1`,
        name: order.productName ?? "상품명",
        price: totalNum,
        qty: 1,
        optionText: "옵션 정보",
      },
    ];
  }, [order]);

  const addItem = useCartStore((s) => s.addItem);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);

  const payment = useMemo(() => {
    if (!order) return null;

    const totalNum =
      typeof order.total === "number"
        ? order.total
        : Number(String(order.total).replace(/[^\d]/g, "")) || 0;

    const p = order.payment ?? {};
    return {
      itemsAmount: p.itemsAmount ?? totalNum,
      discountAmount: p.discountAmount ?? 0,
      shippingFee: p.shippingFee ?? 0,
      couponDiscount: p.couponDiscount ?? 0,
      cardDiscount: p.cardDiscount ?? 0,
      finalAmount: p.finalAmount ?? totalNum,
    };
  }, [order]);

  // ✅ 핵심: 여기서 mx-auto / max-w / px-6 / py-6 같은 "페이지 래퍼"를 없애고
  // 레이아웃(사이드바+컨텐츠 영역)이 준 공간을 그대로 사용
  // + min-h로 화면 세로를 안정적으로 채워서 사이드바랑 균형감 맞춤
  if (!order) {
    return (
      <div className="flex h-full min-h-[calc(100vh-220px)] flex-col gap-4">
        <div className="rounded-2xl border bg-white p-6">
          <div className="text-lg font-extrabold">주문을 찾을 수 없어요</div>
          <div className="mt-2 text-sm text-slate-500">
            주문번호가 잘못되었거나 데이터가 없을 수 있어요.
          </div>

          <button
            className="mt-4 w-full rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white"
            onClick={() => navigate("/mypage/order")}
          >
            주문내역으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[calc(100vh-220px)] flex-col gap-4">
      {/* 상단: 주문내역 상세 카드 */}
      <section className="rounded-2xl border bg-white p-6">
        <div className="text-base font-extrabold">주문 내역 상세</div>

        <div className="mt-3 border-t pt-3">
          <div className="text-xs text-slate-500">{order.date}</div>

          <div className="mt-1 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500">주문번호</div>
              <div className="text-sm font-extrabold">{order.id}</div>
            </div>

            <button
              type="button"
              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(order.id);
                } catch {
                  // clipboard 막힌 환경도 있어서 조용히 무시
                }
              }}
            >
              복사
            </button>
          </div>
        </div>
      </section>

      {/* 주문 상품 */}
      <section className="rounded-2xl border bg-white">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="text-sm font-extrabold">주문 상품</div>
          <div className="text-xs font-bold text-slate-500">
            {mapOrderStatus(order.status)}
            {mapOrderStatus(order.status) === "상품 준비중" && (
              <span className="ml-3 text-xs text-slate-500">{arrivalLabel(order.date ?? order.createdAt ?? order.orderedAt)}</span>
            )}
          </div>
        </div>

        <div className="border-t">
          {items.map((it) => (
            <div key={it.id} className="flex gap-4 px-6 py-4">
              {/* 썸네일 */}
              <div className="h-14 w-14 overflow-hidden rounded-xl bg-slate-100">
                {(it.imageUrl || (it as any).image) ? (
                  <img
                    src={it.imageUrl ?? (it as any).image}
                    alt={it.name}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>

              {/* 상품 정보 */}
              <div className="flex-1">
                <div className="text-[11px] font-bold text-slate-400">오늘식탁 배송</div>
                <div className="mt-1 text-sm font-extrabold">{it.name}</div>

                <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                  <span className="font-extrabold">{KRW(it.price)}원</span>
                  <span className="text-slate-300">|</span>
                  <span>{it.qty}개</span>
                </div>

                {it.optionText ? (
                  <div className="mt-1 text-[11px] text-slate-400">{it.optionText}</div>
                ) : null}
              </div>

              {/* 오른쪽 버튼 */}
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className="h-9 w-9 rounded-xl border text-xs font-bold text-slate-600 hover:bg-slate-50"
                  title="장바구니 담기"
                  onClick={() => {
                    addItem(
                      {
                        id: String(it.id),
                        title: it.name,
                        imageUrl: it.imageUrl ?? (it as any).image ?? "",
                        price: it.price,
                      },
                      it.qty
                    );
                      setSelectedProduct({ name: it.name, count: it.qty });
                    setDialogOpen(true);
                  }}
                >
                  🛒
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 pb-6">
          <button
            type="button"
            className="w-full rounded-2xl bg-slate-100 py-3 text-sm font-extrabold text-slate-700 hover:bg-slate-200"
            onClick={() => {
              // TODO: 배송조회 연동 (외부 링크 or 배송상세 페이지)
            }}
          >
            배송 조회
          </button>

          <button
            type="button"
            className="mt-3 w-full rounded-2xl border py-3 text-sm font-extrabold text-slate-800 hover:bg-slate-50"
            onClick={() => {
              let total = 0;
              items.forEach((it) => {
                addItem(
                  {
                    id: String(it.id),
                    title: it.name,
                    imageUrl: it.imageUrl ?? (it as any).image ?? "",
                    price: it.price,
                  },
                  it.qty
                );
                total += it.qty;
              });
              setSelectedProduct(items[0] ? { name: items[0].name, count: total } : null);
              setDialogOpen(true);
            }}
          >
            전체 상품 다시 담기
          </button>
        </div>
      </section>

      {/* 결제 정보 (접기/펼치기) */}
      <section className="overflow-hidden rounded-2xl border bg-white">
        <button
          type="button"
          className="flex w-full items-center justify-between px-6 py-4"
          onClick={() => setOpenPayment((v) => !v)}
        >
          <div className="text-sm font-extrabold">결제 정보</div>
          <div className="text-xs font-bold text-slate-500">
            {openPayment ? "▲" : "▼"}
          </div>
        </button>

        {openPayment && payment ? (
          <div className="border-t px-6 py-4 text-sm">
            <Row label="상품금액" value={`${KRW(payment.itemsAmount)}원`} />
            <Row
              label="상품할인금액"
              value={`${payment.discountAmount ? "-" : ""}${KRW(
                Math.abs(payment.discountAmount)
              )}원`}
            />
            <Row
              label="배송비"
              value={`${payment.shippingFee >= 0 ? "+" : "-"}${KRW(
                Math.abs(payment.shippingFee)
              )}원`}
            />
            <Row
              label="쿠폰할인"
              value={`${payment.couponDiscount ? "-" : ""}${KRW(
                Math.abs(payment.couponDiscount)
              )}원`}
            />
            <Row
              label="카드즉시할인"
              value={`${payment.cardDiscount ? "-" : ""}${KRW(
                Math.abs(payment.cardDiscount)
              )}원`}
            />

            <div className="mt-3 border-t pt-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-extrabold">총 결제금액</div>
                <div className="text-base font-black">{KRW(payment.finalAmount)}원</div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* ✅ 남는 공간 채워서(특히 컨텐츠가 짧을 때) 사이드바와 높이 균형 맞추기 */}
      <div className="flex-1" />
      <AddToCartDialog open={dialogOpen} setOpen={setDialogOpen} selectedProduct={selectedProduct} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="text-xs font-bold text-slate-500">{label}</div>
      <div className="text-xs font-extrabold text-slate-800">{value}</div>
    </div>
  );
}
