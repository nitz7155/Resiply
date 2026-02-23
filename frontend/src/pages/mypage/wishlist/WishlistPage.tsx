import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import useStore from "@/lib/useStore";
import type { WishlistItem } from "@/api/wishlist";
import { fetchWishlist, addWishlist, removeWishlist } from "@/api/wishlist";
import { useCartStore } from "@/lib/cartStore";
import { Search, Heart, ArrowUpDown, ExternalLink, ShoppingCart } from "lucide-react";
import { ApiError } from "@/api/axios";

type SortKey = "recent" | "name";

/** ✅ 프로젝트 라우팅에 맞게 여기만 바꾸면 됨 */
const toDetailPath = (id: string) => `/store/${id}`;

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

const KRW = (n?: number) =>
  typeof n === "number" ? n.toLocaleString("ko-KR") + "원" : "";

type GridCardProps = {
  product: WishlistItem;
  isLiked: boolean;
  onGoDetail: () => void;
  onToggleLike: () => void;
  onAddToCart: () => void;
};

const GridCard: React.FC<GridCardProps> = ({
  product,
  isLiked,
  onGoDetail,
  onToggleLike,
  onAddToCart,
}) => {
  const name = product.title ?? product.name ?? "상품";
  const img = product.imageUrl ?? product.image ?? product.thumbnail ?? "";

  return (
    <div className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      {/* 이미지 */}
      <div
        className="relative aspect-square w-full cursor-pointer bg-slate-50 dark:bg-slate-800"
        onClick={onGoDetail}
        role="button"
        tabIndex={0}
      >
        {img ? (
          <img src={img} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full" />
        )}

        {/* 하트 */}
        <button
          type="button"
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur hover:bg-white dark:bg-slate-950/70"
          onClick={(e) => {
            e.stopPropagation();
            onToggleLike();
          }}
          aria-label={isLiked ? "찜 해제" : "찜하기"}
          title={isLiked ? "찜 해제" : "찜하기"}
        >
          <Heart
            className={[
              "h-5 w-5",
              isLiked ? "fill-orange-500 text-orange-500" : "text-slate-400",
            ].join(" ")}
          />
        </button>
      </div>

      {/* 텍스트 */}
      <div className="p-3">
        <div
          className="cursor-pointer text-sm font-medium leading-snug text-slate-900 line-clamp-2 dark:text-slate-100"
          onClick={onGoDetail}
          role="button"
          tabIndex={0}
        >
          {name}
        </div>

        <div className="mt-2 text-base font-extrabold text-slate-900 dark:text-slate-100">
          {KRW(product.price)}
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddToCart();
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ShoppingCart className="h-4 w-4" />
            담기
          </button>
        </div>
      </div>
    </div>
  );
};

const WishlistPage: React.FC = () => {
  const navigate = useNavigate();

  const wishlist = useStore((s) => s.wishlist) ?? [];
  const setWishlist = useStore((s) => s.setWishlist);
  const isWishlisted = useStore((s) => s.isWishlisted);

  const addItem = useCartStore((s) => s.addItem);

  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");

  // ✅ 토스트
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const showToast = (msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMsg(null);
      toastTimerRef.current = null;
    }, 2000);
  };

  // ✅ 서버에서 찜 목록 로드
  const loadWishlist = async (options?: { signal?: AbortSignal }) => {
  try {
    const data = await fetchWishlist({ signal: options?.signal });

    const list = Array.isArray(data) ? data : (data as any);
    setWishlist(list ?? []);
    return true;
  } catch (e) {
    const err = e as unknown;

    if ((err as any)?.name === "AbortError") return false;

    if (err instanceof ApiError) {
      if (err.status === 401) {
        showToast("로그인이 필요해요. 다시 로그인해주세요.");
        navigate("/login", { replace: true });
        return false;
      }

      if (err.status >= 500) {
        showToast("서버 오류로 찜 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
        return false;
      }

      showToast(err.message || "찜 목록을 불러오지 못했어요.");
      return false;
    }

    console.error("fetchWishlist failed:", err);
    showToast("찜 목록을 불러오지 못했어요.");
    return false;
  };
};

  useEffect(() => {
    const ac = new AbortController();

    (async () => {
      await loadWishlist({ signal: ac.signal });
    })();

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase();

    let list = wishlist.filter((p) => {
      if (!keyword) return true;
      const name = String(p.title ?? p.name ?? "").toLowerCase();
      return name.includes(keyword);
    });

    list = [...list].sort((a, b) => {
      if (sortKey === "name") {
        return String(a.title ?? a.name ?? "").localeCompare(
          String(b.title ?? b.name ?? ""),
          "ko"
        );
      }
      // recent
      const ad = safeDate(a.likedAt)?.getTime() ?? safeDate(a.savedAt)?.getTime() ?? 0;
      const bd = safeDate(b.likedAt)?.getTime() ?? safeDate(b.savedAt)?.getTime() ?? 0;
      return bd - ad;
    });

    return list;
  }, [wishlist, q, sortKey]);

  const lastLikedText = useMemo(() => {
    const times = wishlist
      .map((p) => safeDate(p.likedAt ?? p.savedAt)?.getTime() ?? 0)
      .filter((t) => t > 0);
    if (times.length === 0) return null;
    return formatYMD(new Date(Math.max(...times)));
  }, [wishlist]);

  const handleAddToCart = (p: WishlistItem) => {
    const id = String(p.id);
    const title = String(p.title ?? p.name ?? "상품");
    const imageUrl = String(p.imageUrl ?? p.image ?? p.thumbnail ?? "");
    const price = typeof p.price === "number" ? p.price : 0;

    addItem({ id, title, imageUrl, price }, 1);
    showToast("장바구니에 담겼어요");
  };

  const handleToggleLike = async (p: WishlistItem) => {
    const id = String(p.id);
    const liked = isWishlisted(id);

    try {
      if (liked) await removeWishlist(id);
      else await addWishlist(id);

      await loadWishlist(); // 성공 시 서버 목록으로 동기화
      showToast(liked ? "찜을 해제했어요" : "상품을 찜했어요");
    } catch (e) {
      const err = e as unknown;

      if (err instanceof ApiError && err.status === 401) {
        showToast("로그인이 필요해요. 다시 로그인해주세요.");
        navigate("/login", { replace: true });
        return;
      }

      if (err instanceof ApiError && err.status >= 500) {
        showToast("서버 오류로 찜 처리에 실패했어요. 잠시 후 다시 시도해주세요.");
        return;
      }

      console.error("toggle wishlist failed:", err);
      showToast("찜 처리에 실패했어요");
    }
  };


  return (
    <div className="space-y-4">
      {/* ================= 헤더 카드 ================= */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-slate-700 dark:text-slate-200" />
              <h2 className="text-lg font-extrabold">찜한 상품</h2>
              <span className="ml-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                {wishlist.length}개
              </span>
            </div>

            <p className="mt-2 text-sm text-slate-500">
              찜한 상품을 모아보고, 검색/정렬로 빠르게 찾아보세요.
              {lastLikedText && (
                <span className="ml-2 text-xs text-slate-400">
                  · 최근 찜: {lastLikedText}
                </span>
              )}
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 md:w-[420px]">
            {/* 검색 */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="상품명으로 검색"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-9 py-2 text-sm outline-none"
              />
            </div>

            {/* 정렬 + 버튼 */}
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2">
                <ArrowUpDown className="h-4 w-4 text-slate-400" />
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="bg-transparent text-sm outline-none"
                >
                  <option value="recent">최근 찜순</option>
                  <option value="name">이름순</option>
                </select>
              </div>

              <button
                onClick={() => navigate("/store")}
                className="ml-auto inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 dark:bg-white dark:text-slate-900"
              >
                쇼핑하러 가기 <ExternalLink className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ================= 리스트 카드 ================= */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
        {filtered.length === 0 ? (
          <div className="py-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
              <Heart className="h-6 w-6 text-slate-600 dark:text-slate-200" />
            </div>
            <div className="text-sm font-semibold">찜한 상품이 없습니다.</div>
            <div className="mt-1 text-sm text-slate-500">
              마음에 드는 상품을 찜하면 여기에서 빠르게 확인할 수 있어요.
            </div>
            <button
              onClick={() => navigate("/store")}
              className="mt-4 rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:opacity-90 dark:bg-white dark:text-slate-900"
            >
              상품 보러가기
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {filtered.map((p) => (
              <GridCard
                key={p.id}
                product={p}
                isLiked={isWishlisted(String(p.id))}
                onGoDetail={() => navigate(toDetailPath(String(p.id)))}
                onToggleLike={() => handleToggleLike(p)}
                onAddToCart={() => handleAddToCart(p)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ================= 토스트 ================= */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg dark:bg-white dark:text-slate-900">
            {toastMsg}
          </div>
        </div>
      )}
    </div>
  );
};

export default WishlistPage;
