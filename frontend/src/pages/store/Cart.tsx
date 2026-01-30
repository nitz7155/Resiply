import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useCartStore } from "@/lib/cartStore";

import Header from "@/components/layout/Header";
import Navigation from "@/components/layout/Navigation";
import Footer from "@/components/layout/Footer";
import ChatbotButton from '@/components/ui/ChatbotButton.tsx';
import RecipeRecommend from '@/components/sections/RecipeRecommendation';

const KRW = (n: number) => n.toLocaleString("ko-KR");

export default function CartPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const items = useCartStore((s) => s.items);
  const selectedIds = useCartStore((s) => s.selectedIds);

  const toggleSelect = useCartStore((s) => s.toggleSelect);
  const selectAll = useCartStore((s) => s.selectAll);
  const clearSelection = useCartStore((s) => s.clearSelection);
  const removeItem = useCartStore((s) => s.removeItem);
  const removeSelected = useCartStore((s) => s.removeSelected);
  const inc = useCartStore((s) => s.inc);
  const dec = useCartStore((s) => s.dec);

  const selectedItems = useMemo(() => {
    const sel = new Set(selectedIds);
    return items.filter((i) => sel.has(i.id));
  }, [items, selectedIds]);

  const allChecked = items.length > 0 && selectedIds.length === items.length;

  const productAmount = useMemo(
    () => selectedItems.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [selectedItems]
  );

  const discountAmount = useMemo(() => {
    return selectedItems.reduce((sum, i) => {
      const original = i.originalPrice ?? i.price;
      const discount = Math.max(0, original - i.price);
      return sum + discount * i.quantity;
    }, 0);
  }, [selectedItems]);

  const SHIPPING_FEE = 3000;
  const FREE_SHIPPING_THRESHOLD = 30000;

  const shippingFee = useMemo(() => {
    if (selectedItems.length === 0) return 0;
    return productAmount >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  }, [selectedItems.length, productAmount]);

  const payAmount = useMemo(
    () => Math.max(0, productAmount + shippingFee),
    [productAmount, shippingFee]
  );

  const handleCTA = () => {
    if (selectedItems.length === 0) return;

    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    navigate("/checkout");
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 flex flex-col">
      <div className="sticky top-0 z-50 bg-white">
        <Header />
        <Navigation />
      </div>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-10">
          <h1 className="text-center text-3xl font-extrabold text-slate-900">
            장바구니
          </h1>

          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* LEFT */}
            <section className="lg:col-span-8">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between px-6 py-4">
                  <label className="flex items-center gap-3 text-sm font-semibold text-slate-900">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-orange-600"
                      checked={allChecked}
                      onChange={() => (allChecked ? clearSelection() : selectAll())}
                    />
                    전체선택{" "}
                    <span className="text-slate-500">
                      {selectedIds.length}/{items.length}
                    </span>
                  </label>

                  <button
                    onClick={removeSelected}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    선택삭제
                  </button>
                </div>

                <ul className="divide-y divide-slate-200">
                  {items.length === 0 ? (
                    <li className="px-6 py-14 text-center text-slate-500">
                      장바구니에 담긴 상품이 없어요.
                    </li>
                  ) : (
                    items.map((item) => {
                      const checked = selectedIds.includes(item.id);
                      return (
                        <li key={item.id} className="px-6 py-6">
                          <div className="flex items-start gap-4">
                            <input
                              type="checkbox"
                              className="mt-2 h-5 w-5 accent-orange-600"
                              checked={checked}
                              onChange={() => toggleSelect(item.id)}
                            />

                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              className="h-20 w-20 rounded-xl border border-slate-200 object-cover"
                            />

                            <div className="flex-1">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="text-sm font-bold text-slate-900">
                                    {item.title}
                                  </p>
                                  {item.subtitle && (
                                    <p className="mt-1 text-xs text-slate-500">
                                      {item.subtitle}
                                    </p>
                                  )}
                                </div>

                                <button
                                  onClick={() => removeItem(item.id)}
                                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                                  aria-label="remove"
                                >
                                  ✕
                                </button>
                              </div>

                              <div className="mt-4 flex items-center justify-between gap-4">
                                <div className="inline-flex items-center rounded-full border border-slate-200 bg-white">
                                  <button
                                    onClick={() => dec(item.id)}
                                    className="h-10 w-10 rounded-full text-lg text-slate-600 hover:bg-slate-50"
                                  >
                                    −
                                  </button>
                                  <div className="w-10 text-center text-sm font-bold text-slate-900">
                                    {item.quantity}
                                  </div>
                                  <button
                                    onClick={() => inc(item.id)}
                                    className="h-10 w-10 rounded-full text-lg text-slate-600 hover:bg-slate-50"
                                  >
                                    +
                                  </button>
                                </div>

                                <div className="text-right">
                                  <p className="text-sm font-extrabold text-slate-900">
                                    {KRW(item.price * item.quantity)}원
                                    {item.originalPrice &&
                                      item.originalPrice > item.price && (
                                        <span className="ml-2 text-xs font-semibold text-slate-400 line-through">
                                          {KRW(item.originalPrice * item.quantity)}원
                                        </span>
                                      )}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>

                <div className="border-t border-slate-200 px-6 py-5">
                  <div className="rounded-xl bg-slate-50 px-5 py-4">
                    <p className="text-sm text-slate-600">
                      상품{" "}
                      <span className="font-bold text-slate-900">
                        {KRW(productAmount)}원
                      </span>{" "}
                      + 배송비{" "}
                      <span className="font-bold text-slate-900">
                        {KRW(shippingFee)}원
                      </span>
                    </p>
                    <p className="mt-2 text-xl font-extrabold text-slate-900">
                      {KRW(payAmount)}원
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* RIGHT */}
            <aside className="lg:col-span-4">
              <div className="sticky top-40 lg:top-44 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-extrabold text-slate-900">
                    결제금액
                  </h2>

                  <div className="mt-5 space-y-3 text-sm">
                    <Row label="상품금액" value={`${KRW(productAmount)}원`} />
                    <Row
                      label="상품할인금액"
                      value={`-${KRW(discountAmount)}원`}
                      valueClassName="text-rose-600"
                      subText={!isAuthenticated ? "로그인 후 할인 금액 적용" : undefined}
                    />
                    <Row label="배송비" value={`${KRW(shippingFee)}원`} />
                  </div>

                  <div className="my-5 border-t border-slate-200" />

                  <div className="flex items-end justify-between">
                    <p className="text-sm font-semibold text-slate-700">
                      결제예정금액
                    </p>
                    <p className="text-2xl font-extrabold text-slate-900">
                      {KRW(payAmount)}원
                    </p>
                  </div>

                  <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
                    쿠폰은 주문서에서 적용할 수 있어요
                  </div>
                </div>

                <button
                  disabled={selectedItems.length === 0}
                  className="w-full rounded-2xl bg-[#EE792B] py-4 text-center text-lg font-extrabold text-white shadow-sm hover:bg-[#d96b26] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handleCTA}
                >
                  {isAuthenticated ? "주문하기" : "로그인"}
                </button>

                {!isAuthenticated ? (
                  <p className="text-center text-xs text-slate-500">
                    로그인 후 결제 및 할인 적용이 가능해요.
                  </p>
                ) : (
                  <p className="text-center text-xs text-slate-500">
                    결제 진행 시, 선택된 상품 기준으로 주문이 생성돼요.
                  </p>
                )}
              </div>
            </aside>
          </div>

          <RecipeRecommend cartItems={items} />
        </div>
      </main>

      <div className="mt-auto">
        <ChatbotButton />
        <Footer />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  subText,
  valueClassName,
}: {
  label: string;
  value: string;
  subText?: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-slate-600">{label}</span>
        <span className={`font-extrabold text-slate-900 ${valueClassName ?? ""}`}>
          {value}
        </span>
      </div>
      {subText && <p className="mt-1 text-xs text-slate-400">{subText}</p>}
    </div>
  );
}
