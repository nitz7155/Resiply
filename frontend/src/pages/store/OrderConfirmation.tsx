import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getOrder } from "@/api/order";
import Header from "@/components/layout/Header";
import Navigation from "@/components/layout/Navigation";
import Footer from "@/components/layout/Footer";

const KRW = (n: number) => n.toLocaleString("ko-KR");

type Order = {
  id: string;
  date: string;
  items: Array<any>;
  productAmount: number;
  shippingFee: number;
  payAmount: number;
  address?: string;
  request?: string;
  paymentMethod?: string;
};

export default function OrderConfirmation() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (!orderId) return;

    const SHIPPING_FEE = 3000;
    const FREE_SHIPPING_THRESHOLD = 30000;
    const calcShipping = (amount: number) => amount >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;

    try {
      const raw = localStorage.getItem("orders");
      const arr: Order[] = raw ? JSON.parse(raw) : [];
      const found = arr.find((o) => o.id === orderId);
      if (found) {
        setOrder(found);
        return;
      }

      // try backend fetch when local not found and orderId looks numeric
      if (/^\d+$/.test(orderId)) {
        getOrder(Number(orderId))
          .then((res) => {
            const items = (res.order_details || []).map((od: any) => ({
              id: od.product_id,
              title: od.product?.title || od.product?.name || String(od.product_id),
              imageUrl: od.product?.main_thumbnail || "",
              price: od.product?.price || 0,
              quantity: od.quantity,
            }));

            const productAmount = items.reduce((sum, it) => sum + (it.price || 0) * (it.quantity || 0), 0);
            const shippingFee = items.length ? calcShipping(productAmount) : 0;
            const payAmount = productAmount + shippingFee;

            setOrder({
              id: String(res.id),
              date: res.created_at || new Date().toISOString(),
              items,
              productAmount,
              shippingFee,
              payAmount,
              address: undefined,
              request: undefined,
              paymentMethod: undefined,
            });
          })
          .catch(() => {});
      }
    } catch (e) {
      // ignore
    }
  }, [orderId]);

  const dateStr = useMemo(() => {
    if (!order) return "";
    return new Date(order.date).toLocaleString();
  }, [order]);

  if (!order) {
    return (
      <div className="min-h-screen w-full bg-slate-50 flex flex-col">
        <div className="sticky top-0 z-50 bg-white">
          <Header />
          <Navigation />
        </div>

        <main className="flex-1">
          <div className="mx-auto w-full max-w-4xl px-4 py-24 text-center">
            <p className="text-lg text-slate-600">주문 정보를 찾을 수 없습니다.</p>
            <div className="mt-6">
              <button
                onClick={() => navigate("/")}
                className="rounded-md bg-orange-600 px-4 py-2 text-white"
              >
                쇼핑 계속하기
              </button>
            </div>
          </div>
        </main>

        <div className="mt-auto">
          <Footer />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 flex flex-col">
      <div className="sticky top-0 z-50 bg-white">
        <Header />
        <Navigation />
      </div>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-10">
          <h1 className="text-center text-3xl font-extrabold text-slate-900">결제 완료</h1>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
            <section className="lg:col-span-8">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm mb-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-slate-600">주문번호</p>
                    <p className="mt-1 font-extrabold text-slate-900">{order.id}</p>
                    <p className="mt-2 text-sm text-slate-500">{dateStr}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">결제 상태</p>
                    <p className="mt-1 font-bold text-emerald-600">결제 완료</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm mb-6">
                <h2 className="text-lg font-bold">배송 정보</h2>
                <p className="mt-3 text-sm text-slate-700">{order.address}</p>
                {order.request && <p className="mt-2 text-sm text-slate-600">요청사항: {order.request}</p>}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold">주문상품</h2>
                <ul className="mt-4 divide-y divide-slate-200">
                  {order.items.map((it: any) => (
                    <li key={it.id} className="py-4 flex items-center gap-4">
                      <img src={it.imageUrl} alt={it.title} className="h-16 w-16 rounded-md object-cover border" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-slate-900">{it.title}</p>
                          <p className="font-extrabold">{KRW(it.price * it.quantity)}원</p>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">수량: {it.quantity}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <aside className="lg:col-span-4">
              <div className="sticky top-40 lg:top-44 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-extrabold text-slate-900">결제금액</h2>

                  <div className="mt-5 space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">주문금액</span>
                      <span className="font-extrabold text-slate-900">{KRW(order.productAmount)}원</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">배송비</span>
                      <span className="font-extrabold text-slate-900">{KRW(order.shippingFee)}원</span>
                    </div>
                  </div>

                  <div className="my-5 border-t border-slate-200" />

                  <div className="flex items-end justify-between">
                    <p className="text-sm font-semibold text-slate-700">결제금액</p>
                    <p className="text-2xl font-extrabold text-slate-900">{KRW(order.payAmount)}원</p>
                  </div>
                </div>

                <button
                  onClick={() => navigate("/mypage/order")}
                  className="w-full rounded-2xl bg-[#EE792B] py-3 text-center text-sm font-extrabold text-white shadow-sm hover:bg-[#581c98]"
                >
                  주문내역 보기
                </button>
              </div>
            </aside>
          </div>
        </div>
      </main>

      <div className="mt-auto">
        <Footer />
      </div>
    </div>
  );
}
