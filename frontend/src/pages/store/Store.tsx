import Header from "@/components/layout/Header";
import Navigation from "@/components/layout/Navigation";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Heart, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { fetchProductList, fetchRecommendedProducts } from "@/api/product";
import type { ProductListParams } from "@/api/product";
import { Link } from "react-router-dom";
import { useCartStore } from "@/lib/cartStore";
import AddToCartDialog from "@/components/common/AddToCartDialog";
import { SORT_OPTIONS, type SortOption } from "@/api/product_sort";
import useStore from "@/lib/useStore";
import type { WishlistItem } from "@/api/wishlist";
import { addWishlist, removeWishlist } from "@/api/wishlist";
import ChatbotButton from '@/components/ui/ChatbotButton.tsx';

// exported binding kept for compatibility with other pages that import `sampleProducts`
export let sampleProducts: any[] = [];

const mapProductFromResponse = (d: any) => ({
  id: d.id,
  name: d.title,
  price: d.price,
  image: d.main_thumbnail || d.detail_images || "",
  ...d,
});

type StoreSortValue = SortOption | "recommend";

const STORE_SORT_OPTIONS: { value: StoreSortValue; label: string }[] = [
  { value: "recommend", label: "추천순" },
  ...SORT_OPTIONS,
];

const Store = () => {
  const addItem = useCartStore((s) => s.addItem);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);

  const [activeSort, setActiveSort] = useState(0);
  const [products, setProducts] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 12;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pageGroupSize = 5;
  const currentGroup = Math.floor((page - 1) / pageGroupSize);
  const startPage = currentGroup * pageGroupSize + 1;
  const endPage = Math.min(startPage + pageGroupSize - 1, totalPages);
  const pageNumbers = [];
  for (let i = startPage; i <= endPage; i++) {
    pageNumbers.push(i);
  }

  // ✅ 모바일에서만 (현재±1) 최대 3개 페이지 숫자 만들기
  const mobilePageNumbers = useMemo(() => {
    const nums = [page - 1, page, page + 1].filter(
      (n) => n >= 1 && n <= totalPages
    );
    // 중복 제거(안전)
    return Array.from(new Set(nums));
  }, [page, totalPages]);

    // ✅ wishlist store
  const wishlist = useStore((s) => s.wishlist) ?? [];
  const toggleWishlist = useStore((s) => s.toggleWishlist);
  const isWishlisted = useStore((s) => s.isWishlisted);

  // ✅ 찜 토스트
  const [wishToast, setWishToast] = useState<string | null>(null);
  const wishToastTimerRef = useRef<number | null>(null);
  const recommendedCacheRef = useRef<any[]>([]);

  const showWishToast = (msg: string) => {
    setWishToast(msg);
    if (wishToastTimerRef.current) window.clearTimeout(wishToastTimerRef.current);
    wishToastTimerRef.current = window.setTimeout(() => {
      setWishToast(null);
      wishToastTimerRef.current = null;
    }, 2000);
  };

  const handleToggleWish = async (p: any) => {
  const id = String(p.id);
  const liked = isWishlisted(id);

  const item: WishlistItem = {
    id,
    title: String(p.title ?? p.name ?? "상품"),
    name: String(p.name ?? p.title ?? "상품"),
    price: typeof p.price === "number" ? p.price : Number(p.price) || 0,
    imageUrl: String(p.image ?? p.main_thumbnail ?? ""),
    image: String(p.image ?? p.main_thumbnail ?? ""),
    thumbnail: String(p.image ?? p.main_thumbnail ?? ""),
    likedAt: new Date().toISOString(),
    savedAt: new Date().toISOString(),
  };

  try {
    // ✅ DB 먼저 반영
    if (liked) {
      await removeWishlist(id);
    } else {
      await addWishlist(id);
    }

    // ✅ 성공하면 프론트 store 갱신
    toggleWishlist(item);
    showWishToast(liked ? "찜을 해제했어요" : "상품을 찜했어요");
  } catch (e: any) {
    // 401/404/500 등
    console.error(e);
    showWishToast("찜 저장에 실패했어요");
  }
};

  useEffect(() => {
    const ac = new AbortController();
    const fetchProducts = async () => {
      setLoading(true);
      setError(null);
      try {
        const sortValue = STORE_SORT_OPTIONS[activeSort]?.value;
        const isRecommendedSort = sortValue === "recommend";

        if (isRecommendedSort) {
          if (!recommendedCacheRef.current.length) {
            try {
              const recommended = await fetchRecommendedProducts({ signal: ac.signal });
              if (ac.signal.aborted) return;
              recommendedCacheRef.current = recommended.map(mapProductFromResponse);
            } catch (detailError) {
              if (ac.signal.aborted) return;
              console.error("추천 상품 목록 불러오기 실패", detailError);
              setError("추천 상품을 불러오지 못했습니다.");
              setProducts([]);
              setTotalCount(0);
              queueMicrotask(() => {
                sampleProducts = [];
              });
              return;
            }
          }

          const fullList = recommendedCacheRef.current;
          if (!fullList.length) {
            setError("추천 상품을 불러오지 못했습니다.");
            setProducts([]);
            setTotalCount(0);
            queueMicrotask(() => {
              sampleProducts = [];
            });
            return;
          }

          const startIdx = (page - 1) * pageSize;
          if (startIdx >= fullList.length && page > 1) {
            setPage(1);
            return;
          }

          const paged = fullList.slice(startIdx, startIdx + pageSize);
          setProducts(paged);
          setTotalCount(fullList.length);
          queueMicrotask(() => {
            sampleProducts = paged;
          });
          return;
        }

        const params: ProductListParams = {
          page,
          size: pageSize,
        };

        if (sortValue) {
          params.sort = sortValue as SortOption;
        }

        const resp = await fetchProductList(params, { signal: ac.signal });
        if (ac.signal.aborted) return;
        const items = (resp as any)?.items ?? [];
        const total = (resp as any)?.total_count ?? 0;
        const mapped = items.map(mapProductFromResponse);
        setProducts(mapped);
        setTotalCount(total);
        queueMicrotask(() => {
          sampleProducts = mapped;
        });
      } catch (e) {
        if (ac.signal.aborted) return;
        setError("상품을 불러오는 중 오류가 발생했습니다.");
        setProducts([]);
        sampleProducts = [];
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    };
    fetchProducts();
    return () => ac.abort();
  }, [activeSort, page]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Navigation />

      <main className="container mx-auto px-4 lg:px-8 py-6 mb-8">
        <div className="mb-6">
          <div className="sm:hidden">
            <div className="flex flex-col gap-3">
              <div className="w-full">
                <div
                  className="hide-x-scrollbar rounded-full border border-border bg-muted/40 p-1 overflow-x-auto"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                  <style>{`
                    .hide-x-scrollbar::-webkit-scrollbar { display: none; height: 0; }
                  `}</style>

                  <div className="flex w-max items-center gap-1">
                    {STORE_SORT_OPTIONS.map((s, i) => {
                      const active = i === activeSort;
                      return (
                        <button
                          key={s.value}
                          onClick={() => {
                            if (i === activeSort) return;
                            setActiveSort(i);
                            setPage(1);
                          }}
                          className={[
                            "shrink-0 rounded-full px-3 py-2 text-[13px] leading-none font-medium whitespace-nowrap",
                            "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                            active
                              ? "bg-background text-orange-500 font-bold shadow-sm"
                              : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                          ].join(" ")}
                          aria-current={active ? "page" : undefined}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  총 <span className="font-semibold text-foreground">{totalCount}</span>개
                </div>
              </div>
            </div>
          </div>

          <div className="hidden sm:flex items-center justify-between mb-6">
            <div className="flex items-center gap-3 text-sm text-muted-foreground overflow-x-auto scrollbar-hide">
              {STORE_SORT_OPTIONS.map((s, i) => (
                <button
                  key={s.value}
                  onClick={() => {
                    if (i === activeSort) return;
                    setActiveSort(i);
                    setPage(1);
                  }}
                  className={`px-2 py-1 rounded text-sm whitespace-nowrap ${
                    i === activeSort ? "text-foreground font-medium" : "hover:text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="text-sm text-muted-foreground">총 {totalCount}개</div>
          </div>
        </div>

        {/* Products grid */}
        <section>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
            {products.map((p) => (
              <Link
                key={p.id}
                to={`/product/${p.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-card rounded-md border border-border overflow-hidden shadow-card block hover:shadow-soft transition-transform hover:-translate-y-1"
              >
                <div className="relative bg-secondary aspect-[4/3] overflow-hidden">
                  <img src={p.image} alt={p.title} className="w-full h-full object-cover" />
                  {/* ✅ 하트 오버레이 */}
                  <button
                    type="button"
                    className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur hover:bg-white"
                    onClick={(e) => {
                      e.preventDefault();   // ✅ Link 이동 방지
                      e.stopPropagation();  // ✅ 카드 클릭 이벤트 방지
                      handleToggleWish(p);
                    }}
                    aria-label={isWishlisted(String(p.id)) ? "찜 해제" : "찜하기"}
                    title={isWishlisted(String(p.id)) ? "찜 해제" : "찜하기"}
                  >
                    <Heart
                      className={[
                        "h-5 w-5",
                        isWishlisted(String(p.id))
                          ? "fill-orange-500 text-orange-500"
                          : "text-slate-400",
                      ].join(" ")}
                    />
                  </button>
                </div>

                <div className="p-3">
                  <div className="h-12">
                    <h3 className="text-md font-medium text-foreground line-clamp-2 leading-6">{p.title}</h3>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <div className="text-base font-bold">{p.price.toLocaleString()}원</div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        addItem({
                          id: p.id.toString(),
                          title: p.title,
                          imageUrl: p.image,
                          price: p.price,
                        });
                        setSelectedProduct(p);
                        setDialogOpen(true);
                      }}
                    >
                      <ShoppingCart className="h-4 w-4" /> 담기
                    </Button>
                  </div>

                  <div className="mt-4 text-xs text-muted-foreground flex items-center gap-3">
                    <div className="flex items-center">
                      {(() => {
                        const avg = Math.round((((p.avg_rating ?? 0) || 0) * 10)) / 10; // one decimal
                        const filled = Math.round(avg);
                        return (
                          <>
                            {Array.from({ length: 5 }).map((_, i) => (
                              <svg
                                key={i}
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                className={`w-4 h-4 ${i < filled ? 'text-amber-400' : 'text-amber-200'}`}
                              >
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.97a1 1 0 00.95.69h4.18c.969 0 1.371 1.24.588 1.81l-3.38 2.455a1 1 0 00-.364 1.118l1.286 3.97c.3.921-.755 1.688-1.54 1.118l-3.38-2.455a1 1 0 00-1.176 0L5.24 17.96c-.785.57-1.84-.197-1.54-1.118l1.286-3.97a1 1 0 00-.364-1.118L1.243 8.199c-.783-.57-.38-1.81.588-1.81h4.18a1 1 0 00.95-.69l1.286-3.97z"/>
                              </svg>
                            ))}
                            <div className="text-sm text-muted-foreground ml-1">{avg.toFixed(1)}</div>
                            <div className="text-sm text-muted-foreground">({(p.review_count ?? 0).toLocaleString()})</div>
                          </>
                        );
                      })()}
                     </div>
                   </div>
                 </div>
               </Link>
             ))}
          </div>
        </section>
        {/* 페이지 버튼 기능 */}
        <div className="mt-10 mb-10 px-2">
          <div className="flex justify-center items-center gap-1 sm:gap-2 flex-wrap">
            {/* 처음 */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="h-9 w-9 p-0 flex items-center justify-center"
              aria-label="처음 페이지"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>

            {/* 이전 */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="h-9 w-9 p-0 flex items-center justify-center"
              aria-label="이전 페이지"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* ✅ 페이지 숫자: 모바일(3개) / sm 이상(전체) */}
            <div className="flex items-center gap-1 flex-wrap justify-center">
              {/* 모바일 */}
              <div className="flex items-center gap-1 sm:hidden">
                {mobilePageNumbers.map((num) => (
                  <Button
                    key={num}
                    variant={page === num ? "default" : "outline"}
                    onClick={() => setPage(num)}
                    className="w-9 h-9 p-0"
                  >
                    {num}
                  </Button>
                ))}
              </div>

              {/* 데스크톱 */}
              <div className="hidden sm:flex items-center gap-1">
                {pageNumbers.map((num) => (
                  <Button
                    key={num}
                    variant={page === num ? "default" : "outline"}
                    onClick={() => setPage(num)}
                    className="w-10 h-10 p-0"
                  >
                    {num}
                  </Button>
                ))}
              </div>
            </div>

            {/* 다음 */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="h-9 w-9 p-0 flex items-center justify-center"
              aria-label="다음 페이지"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            {/* 끝 */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="h-9 w-9 p-0 flex items-center justify-center"
              aria-label="끝 페이지"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>


        <AddToCartDialog open={dialogOpen} setOpen={setDialogOpen} selectedProduct={selectedProduct} />
      </main>
      {wishToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg dark:bg-white dark:text-slate-900">
            {wishToast}
          </div>
        </div>
      )}
      <ChatbotButton />
      <Footer />
    </div>
  );
};

export default Store;
