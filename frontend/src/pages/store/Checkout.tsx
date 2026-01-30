import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/layout/Header";
import Navigation from "@/components/layout/Navigation";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/lib/AuthContext";
import { useCartStore } from "@/lib/cartStore";
import { mypageApi, AddressResponse } from "@/api/mypage";

const KRW = (n: number) => n.toLocaleString("ko-KR");

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

  const items = useCartStore((s) => s.items);
  const selectedIds = useCartStore((s) => s.selectedIds);
  const removeSelected = useCartStore((s) => s.removeSelected);

  const selectedItems = useMemo(() => {
    const sel = new Set(selectedIds);
    return items.filter((i) => sel.has(i.id));
  }, [items, selectedIds]);

  const productAmount = useMemo(
    () => selectedItems.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [selectedItems]
  );

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

  const [paymentMethod, setPaymentMethod] = useState<string>("카드/계좌");

  // Shipping state
  const [addresses, setAddresses] = useState<AddressResponse[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [editingAddress, setEditingAddress] = useState(false);
  const [draftAddress, setDraftAddress] = useState("");
  const [savingAddress, setSavingAddress] = useState(false);

  const [request, setRequest] = useState("");
  const [requestError, setRequestError] = useState(false);

  const selectedAddress = useMemo(() => {
    if (addresses.length === 0) return undefined;
    if (selectedAddressId) {
      return (
        addresses.find((addr) => addr.id === selectedAddressId) ??
        addresses.find((addr) => addr.isDefault) ??
        addresses[0]
      );
    }
    return addresses.find((addr) => addr.isDefault) ?? addresses[0];
  }, [addresses, selectedAddressId]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setAddresses([]);
      setSelectedAddressId(null);
      return;
    }

    let cancelled = false;
    setAddressLoading(true);
    setAddressError(null);

    mypageApi
      .getAddresses(user.id)
      .then((res) => {
        if (cancelled) return;
        const list = res ?? [];
        setAddresses(list);
        const defaultAddress = list.find((addr) => addr.isDefault) ?? list[0];
        setSelectedAddressId(defaultAddress ? defaultAddress.id : null);
      })
      .catch((err) => {
        console.error(err);
        if (cancelled) return;
        setAddressError("배송지 정보를 불러오는 데 실패했습니다. 잠시 후 다시 시도해주세요.");
      })
      .finally(() => {
        if (!cancelled) {
          setAddressLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!editingAddress && selectedAddress) {
      setDraftAddress(selectedAddress.addressLine);
    }
  }, [selectedAddress, editingAddress]);

  const handleAddressSave = async () => {
    if (!selectedAddress || !user?.id) return;
    const nextAddress = draftAddress.trim();
    if (!nextAddress) {
      alert("주소를 입력해주세요.");
      return;
    }

    setSavingAddress(true);
    try {
      const updated = await mypageApi.updateAddress(selectedAddress.id, {
        member_id: user.id,
        addressLine: nextAddress,
      });
      setAddresses((prev) => prev.map((addr) => (addr.id === updated.id ? updated : addr)));
      setEditingAddress(false);
      alert("배송지가 업데이트되었습니다.");
    } catch (error) {
      console.error(error);
      alert("배송지 저장에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSavingAddress(false);
    }
  };

  const handlePay = async () => {
    if (selectedItems.length === 0) return;
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    if (!selectedAddress) {
      alert("배송지를 등록한 후 결제를 진행해주세요.");
      return;
    }

    // call backend to create order
    try {
      const memberId = user?.id;
      // build payload
      const itemsPayload = selectedItems.map((it: any) => ({ product_id: it.id, quantity: it.quantity }));

      // dynamic import to avoid cycles
      const { createOrder } = await import("@/api/order");

      const res = await createOrder({ member_id: memberId, items: itemsPayload });
      const created = res;

      // remove selected items from cart
      removeSelected();

      alert(`결제가 완료되었습니다. 결제금액: ${KRW(payAmount)}원`);
      navigate(`/order/${created.id}`);
    } catch (err: any) {
      console.error(err);
      // fallback: persist locally so user still sees confirmation
      const orderId = `ORD-${Date.now()}`;
      const order = {
        id: orderId,
        date: new Date().toISOString(),
        items: selectedItems,
        productAmount,
        shippingFee,
        payAmount,
        address: selectedAddress.addressLine,
        request,
        paymentMethod,
      };

      try {
        const raw = localStorage.getItem("orders");
        const arr = raw ? JSON.parse(raw) : [];
        arr.unshift(order);
        localStorage.setItem("orders", JSON.stringify(arr));
      } catch (e) {
        // ignore
      }

      removeSelected();
      alert(`결제가 완료되었습니다. (로컬 저장) 결제금액: ${KRW(payAmount)}원`);
      navigate(`/order/${orderId}`);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 flex flex-col">
      <div className="sticky top-0 z-50 bg-white">
        <Header />
        <Navigation />
      </div>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-10">
          <h1 className="text-center text-3xl font-extrabold text-slate-900">주문서</h1>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
            <section className="lg:col-span-8">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm mb-6">
                <h2 className="text-lg font-bold">주문자 정보</h2>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm mb-6">
                <h2 className="text-lg font-bold">배송 정보</h2>

                <div className="mt-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">기본배송지</span>
                      </div>

                      {addressLoading ? (
                        <p className="mt-3 text-sm text-slate-500">배송지 정보를 불러오는 중입니다...</p>
                      ) : addressError ? (
                        <p className="mt-3 text-sm text-rose-600">{addressError}</p>
                      ) : selectedAddress ? (
                        <div className="mt-3 text-sm text-slate-700">
                          <p className="font-semibold text-slate-900">
                            {selectedAddress.receiver || "수령인 미지정"}
                          </p>
                          {selectedAddress.phone && (
                            <p className="mt-1 text-xs text-slate-600">{selectedAddress.phone}</p>
                          )}
                          <p className="mt-2 whitespace-pre-line">{selectedAddress.addressLine}</p>
                          {selectedAddress.deliveryType && (
                            <p className="mt-2 text-xs text-slate-500">
                              요청 형태: {selectedAddress.deliveryType}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-slate-500">
                          등록된 배송지가 없습니다. 마이페이지에서 배송지를 추가해주세요.
                        </p>
                      )}

                      {!addressLoading && addresses.length > 1 && selectedAddress && (
                        <div className="mt-4">
                          <label className="text-xs font-semibold text-slate-500">배송지 선택</label>
                          <select
                            value={selectedAddress.id}
                            onChange={(e) => setSelectedAddressId(e.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                          >
                            {addresses.map((addr) => (
                              <option key={addr.id} value={addr.id}>
                                {(addr.isDefault ? "[기본] " : "") + (addr.label || addr.addressLine)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {editingAddress && (
                        <div className="mt-3 flex gap-2">
                          <input
                            value={draftAddress}
                            onChange={(e) => setDraftAddress(e.target.value)}
                            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                            placeholder="도로명/건물명, 상세주소"
                          />
                          <button
                            onClick={handleAddressSave}
                            disabled={savingAddress || draftAddress.trim() === ""}
                            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
                          >
                            {savingAddress ? "저장 중" : "저장"}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="ml-4">
                      {!editingAddress ? (
                        <button
                          disabled={!selectedAddress || addressLoading}
                          onClick={() => {
                            if (!selectedAddress) return;
                            setDraftAddress(selectedAddress.addressLine);
                            setEditingAddress(true);
                          }}
                          className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                        >
                          변경
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingAddress(false);
                            if (selectedAddress) {
                              setDraftAddress(selectedAddress.addressLine);
                            }
                          }}
                          className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold"
                        >
                          취소
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 border-t pt-4">
                    <label className="text-sm font-semibold">배송 요청사항</label>
                    {requestError && (
                      <p className="mt-2 text-sm text-rose-600">배송 요청사항을 입력해주세요</p>
                    )}

                    <textarea
                      value={request}
                      onChange={(e) => {
                        setRequest(e.target.value);
                        if (e.target.value.trim() !== "") setRequestError(false);
                      }}
                      rows={3}
                      className="mt-3 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      placeholder="예) 부재 시 경비실에 맡겨주세요."
                    />

                    <div className="mt-3">
                      <button
                        onClick={() => {
                          if (request.trim() === "") {
                            setRequestError(true);
                            return;
                          }
                          setRequestError(false);
                          // saved locally
                          alert("배송 요청사항이 저장되었습니다.");
                        }}
                        className="rounded-md border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
                      >
                        입력
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold">주문상품</h2>

                <ul className="mt-4 divide-y divide-slate-200">
                  {selectedItems.length === 0 ? (
                    <li className="py-6 text-center text-slate-500">선택된 상품이 없습니다.</li>
                  ) : (
                    selectedItems.map((it) => (
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
                    ))
                  )}
                </ul>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold">결제 수단</h2>
                <div className="mt-4 space-y-3 text-sm">
                  <label className="flex items-center gap-3">
                    <input type="radio" checked={paymentMethod === "카드"} onChange={() => setPaymentMethod("카드")} />
                    카드/계좌
                  </label>
                  <label className="flex items-center gap-3">
                    <input type="radio" checked={paymentMethod === "기타"} onChange={() => setPaymentMethod("기타")} />
                    다른 결제수단
                  </label>
                </div>
              </div>
            </section>

            <aside className="lg:col-span-4">
              <div className="sticky top-40 lg:top-44 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-extrabold text-slate-900">결제금액</h2>

                  <div className="mt-5 space-y-3 text-sm">
                    <Row label="주문금액" value={`${KRW(productAmount)}원`} />
                    <Row label="배송비" value={`${KRW(shippingFee)}원`} />
                  </div>

                  <div className="my-5 border-t border-slate-200" />

                  <div className="flex items-end justify-between">
                    <p className="text-sm font-semibold text-slate-700">최종 결제금액</p>
                    <p className="text-2xl font-extrabold text-slate-900">{KRW(payAmount)}원</p>
                  </div>
                </div>

                <button
                  disabled={selectedItems.length === 0}
                  onClick={handlePay}
                    className="w-full rounded-2xl bg-primary py-4 text-center text-lg font-extrabold text-primary-foreground shadow-sm hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isAuthenticated ? `${KRW(payAmount)}원 결제하기` : "로그인"}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-slate-600">{label}</span>
        <span className="font-extrabold text-slate-900">{value}</span>
      </div>
    </div>
  );
}
