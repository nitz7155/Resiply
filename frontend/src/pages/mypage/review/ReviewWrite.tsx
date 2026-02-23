import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import apiClient from "@/api/axios";
import useStore from "@/lib/useStore";
import { getOrder } from "@/api/order";
import { fetchProductDetail } from "@/api/product";

export default function ReviewWrite() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("orderId");
  const productId = searchParams.get("productId");
  const orderDetailId = searchParams.get("orderDetailId");

  const user = useStore((s) => s.user);
  const orders = useStore((s) => s.orders);
  const setOrders = useStore((s) => (s as any).setOrders);

  const [rating, setRating] = useState<number>(0);
  const [content, setContent] = useState("");

  function handleStarClick(value: number) {
    setRating(value);
  }

  const [loading, setLoading] = useState(false);

  const [orderItems, setOrderItems] = useState<any[] | null>(null);
  const [productInfo, setProductInfo] = useState<any | null>(null);

  React.useEffect(() => {
    // if there's no productId but an orderId, fetch order to show items list
    if (!productId && orderId) {
      (async () => {
        try {
          const oid = Number(orderId);
          const res = await getOrder(oid);
          // backend returns order with order_details
          const details = (res as any).order_details ?? (res as any).items ?? [];
          // normalize items with review state
          const items = (details || []).map((d: any) => ({
            order_detail_id: d.id,
            id: d.product_id ?? d.product?.id ?? d.id,
            product_id: d.product_id ?? d.product?.id ?? d.id,
            name: d.product?.title ?? d.product?.name ?? d.name ?? d.title,
            image: d.product?.main_thumbnail ?? d.product?.main_image ?? d.image,
            has_review: !!d.has_review,
          }));
          setOrderItems(items);
        } catch (err) {
          console.error(err);
        }
      })();
    }

    // if productId present, try to fetch product detail (preferred) and also try order fallback
    if (productId) {
      (async () => {
        try {
          const pid = Number(productId);
          const p = await fetchProductDetail(pid).catch(() => null);
          if (p) {
            setProductInfo(p);
            return;
          }

          // fallback: if orderId present, fetch order and try to find product info there
          if (orderId) {
            const oid = Number(orderId);
            const res = await getOrder(oid).catch(() => null);
            const details = (res as any)?.order_details ?? [];
            const found = (details || []).find((d: any) => (d.product_id ?? d.product?.id) === pid);
            if (found) {
              setProductInfo({
                id: pid,
                name: found.product?.title ?? found.product?.name ?? found.name ?? found.title,
                main_thumbnail: found.product?.main_thumbnail ?? found.image,
              });
            }
          }
        } catch (err) {
          console.error(err);
        }
      })();
    }
  }, [orderId, productId]);

  async function handleSubmit() {
    if (!productId) {
      alert("상품 정보가 없습니다. productId 쿼리 파라미터를 전달해주세요.");
      return;
    }

    setLoading(true);
    try {
      if (!user?.id) {
        alert("로그인이 필요합니다. 로그인 후 다시 시도해주세요.");
        return;
      }

      const memberId = Number(user.id);

      const payload = {
        member_id: memberId,
        content,
        rating,
        order_detail_id: orderDetailId ? Number(orderDetailId) : undefined,
      };

      await apiClient.post(`products/${productId}/reviews`, payload);

      // update local order store so buttons hide without hard reload
      if (orderId) {
        const pid = Number(productId);
        const odid = orderDetailId ? Number(orderDetailId) : null;
        const oid = String(orderId);
        const updated = (orders ?? []).map((o: any) => {
          if (String(o.id) !== oid) return o;
          const nextItems = (o.items || []).map((it: any) => {
            const targetId = it.product_id ?? it.id;
            const matches = odid ? it.order_detail_id === odid : targetId === pid;
            return matches ? { ...it, has_review: true } : it;
          });
          const nextDetails = (o.order_details || []).map((od: any) =>
            odid ? (od.id === odid ? { ...od, has_review: true } : od) : ( (od.product_id ?? od.product?.id) === pid ? { ...od, has_review: true } : od)
          );
          return { ...o, items: nextItems, order_details: nextDetails };
        });
        setOrders(updated as any);
      }

      // After submit, go back to orders (or review list if no order info)
      navigate(orderId ? "/mypage/order" : "/mypage/review");
    } catch (err: any) {
      console.error(err);
      // try to show backend detail message if available
      const msg = err?.message || (err?.toString && err.toString()) || "리뷰 등록 중 오류가 발생했습니다";
      try {
        const parsed = typeof err === "object" && err?.message && JSON.parse(err.message);
        if (parsed?.detail) {
          alert(parsed.detail);
        } else {
          alert(msg);
        }
      } catch {
        alert(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-6 border">
        <h2 className="text-lg font-bold">리뷰 작성</h2>
        {orderId && (
          <div className="text-sm text-gray-500 mt-1">주문번호: {orderId}</div>
        )}

        {/* If no productId provided, show list of order items with buttons */}
        {!productId && orderItems && (
          <div className="mt-4 space-y-4">
            {orderItems.map((it) => (
              <div
                key={it.id}
                className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-14 w-14 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0">
                    {it.image ? (
                      <img src={it.image} alt={it.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-xs text-slate-400">이미지</div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{it.name}</div>
                    <div className="text-xs text-slate-500 mt-1">배송</div>
                  </div>
                </div>

                <div className="w-full sm:w-auto sm:flex sm:justify-end">
                  {it.has_review ? (
                    <span className="text-xs text-gray-400">리뷰 완료</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          `/mypage/review/new?orderId=${orderId}&productId=${it.product_id ?? it.id}&orderDetailId=${it.order_detail_id}`
                        )
                      }
                      className="h-10 w-full sm:w-auto sm:h-9 rounded-full border border-orange-200 bg-orange-50 px-4 text-sm font-semibold text-orange-600 hover:bg-orange-100 whitespace-nowrap shrink-0"
                    >
                      리뷰 작성하기
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* If productId present, show the existing single-item review form */}
        {productId && (
          <div className="mt-4">
            {/* product header: image + name */}
            {productInfo && (
              <div className="flex items-center gap-4 mb-4">
                <div className="h-16 w-16 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0">
                  {productInfo.main_thumbnail ? (
                    <img src={productInfo.main_thumbnail} alt={productInfo.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-xs text-slate-400">이미지</div>
                  )}
                </div>
                <div>
                  <div className="text-sm font-semibold">{productInfo.title}</div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => handleStarClick(v)}
                  aria-label={`${v}점`}
                  className={[
                    "h-9 w-9 flex items-center justify-center rounded-md",
                    rating >= v ? "bg-orange-100 text-orange-600" : "bg-slate-50 text-slate-400",
                  ].join(" ")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.97a1 1 0 00.95.69h4.18c.969 0 1.371 1.24.588 1.81l-3.38 2.455a1 1 0 00-.364 1.118l1.286 3.97c.3.921-.755 1.688-1.54 1.118l-3.38-2.455a1 1 0 00-1.176 0L5.24 17.96c-.785.57-1.84-.197-1.54-1.118l1.286-3.97a1 1 0 00-.364-1.118L1.243 8.199c-.783-.57-.38-1.81.588-1.81h4.18a1 1 0 00.95-.69l1.286-3.97z"/>
                  </svg>
                </button>
              ))}
            </div>

            <div className="mt-4">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                placeholder="리뷰를 작성해주세요."
                className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-slate-300"
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleSubmit}
                className="h-10 rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white hover:bg-orange-600"
              >
                등록
              </button>

              <button
                type="button"
                onClick={() => navigate(-1)}
                className="h-10 rounded-xl border px-4 text-sm"
              >
                취소
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
