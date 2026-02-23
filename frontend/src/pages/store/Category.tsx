import Header from "@/components/layout/Header";
import Navigation from "@/components/layout/Navigation";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Heart } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchProductList } from "@/api/product";
import { SORT_OPTIONS } from "@/api/product_sort";
import { addWishlist, removeWishlist } from "@/api/wishlist";
import type { WishlistItem } from "@/api/wishlist";
import { useCartStore } from "@/lib/cartStore";
import useStore from "@/lib/useStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const Category = () => {
  const navigate = useNavigate();
  const addItem = useCartStore((s) => s.addItem);
  const toggleWishlist = useStore((s) => s.toggleWishlist);
  const isWishlisted = useStore((s) => s.isWishlisted);
  const [wishToast, setWishToast] = useState<string | null>(null);
  const wishToastTimerRef = useRef<number | null>(null);
  const showWishToast = (msg: string) => {
    setWishToast(msg);
    if (wishToastTimerRef.current) window.clearTimeout(wishToastTimerRef.current);
    wishToastTimerRef.current = window.setTimeout(() => {
      setWishToast(null);
      wishToastTimerRef.current = null;
    }, 2000);
  };

  // ✅ categoryId로 title 찾기 (응답 구조가 달라도 최대한 찾아줌)
  const findCategoryTitleById = (data: any, targetId: number): string | null => {
    if (data == null) return null;

    if (Array.isArray(data)) {
      for (const v of data) {
        const found = findCategoryTitleById(v, targetId);
        if (found) return found;
      }
      return null;
    }

    if (typeof data === "object") {
      const id = (data as any).id;
      if (id != null && Number(id) === targetId) {
        return (data as any).title ?? (data as any).name ?? null;
      }

      for (const key of Object.keys(data)) {
        const found = findCategoryTitleById((data as any)[key], targetId);
        if (found) return found;
      }
    }

    return null;
  };

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);

  const [activeSort, setActiveSort] = useState(0);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { id } = useParams();
  const categoryId = id ? parseInt(id, 10) : undefined;
  const [categoryName, setCategoryName] = useState<string | null>(null);

  const handleToggleWish = async (p: any) => {
    const pid = String(p.id);
    const liked = isWishlisted(pid);

    const item: WishlistItem = {
      id: pid,
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
      if (liked) {
        await removeWishlist(pid);
      } else {
        await addWishlist(pid);
      }
      toggleWishlist(item);
      showWishToast(liked ? "찜을 해제했어요" : "상품을 찜했어요");
    } catch (e: any) {
      console.error(e);

      const status = e?.status ?? e?.response?.status;
      if (status === 401) {
        showWishToast("로그인이 필요해요");
        navigate("/login");
        return;
      }
      showWishToast("찜 저장에 실패했어요");
    }
  };

  useEffect(() => {
    const ac = new AbortController();

    const fetchProducts = async () => {
      if (!categoryId) return;
      setLoading(true);
      setError(null);

      try {
        const resp = await fetchProductList(
          {
            page: 1,
            size: 48,
            sort: SORT_OPTIONS[activeSort]?.value,
            category_id: categoryId,
          },
          { signal: ac.signal }
        );

        if (ac.signal.aborted) return;

        const items = Array.isArray(resp) ? resp : (resp as any)?.items ?? [];
        const mapped = (items || []).map((d: any) => ({
          id: d.id,
          name: d.title,
          price: d.price,
          image: d.main_thumbnail || d.detail_images || "",
          ...d,
        }));

        setProducts(mapped);
      } catch (e) {
        if (ac.signal.aborted) return;
        setError("상품을 불러오는 중 오류가 발생했습니다.");
        setProducts([]);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    };

    fetchProducts();
    return () => ac.abort();
  }, [categoryId, activeSort]);

  useEffect(() => {
    const ac = new AbortController();

    const fetchName = async () => {
      if (!categoryId) return;

      try {
        const res = await fetch(`/api/major-categories`, { signal: ac.signal });
        if (!res.ok) return;

        const data = await res.json();
        setCategoryName(findCategoryTitleById(data, categoryId));
      } catch (e) {}
    };

    fetchName();
    return () => ac.abort();
  }, [categoryId]);

  useEffect(() => {
    return () => {
      if (wishToastTimerRef.current) window.clearTimeout(wishToastTimerRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Navigation />

      <main className="container mx-auto px-4 lg:px-8 py-6 mb-8">
        <div className="mb-6">
          {/* ✅ Title */}
          <div className="text-lg font-semibold mb-3">
            {categoryName ?? "카테고리"}
          </div>

          {/* ✅ Mobile (sm 미만): 스토어와 동일한 알약 탭 */}
          <div className="sm:hidden">
            <div
              className="hide-x-scrollbar rounded-full border border-border bg-muted/40 p-1 overflow-x-auto flex justify-center"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              <style>{`
                .hide-x-scrollbar::-webkit-scrollbar { display: none; height: 0; }
              `}</style>

              <div className="flex w-max items-center gap-1 mx-auto">
                {SORT_OPTIONS.map((s, i) => {
                  const active = i === activeSort;
                  return (
                    <button
                      key={s.value}
                      onClick={() => setActiveSort(i)}
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

          {/* ✅ Web (sm 이상): 기존 UI 유지 */}
          <div className="hidden sm:flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm text-muted-foreground overflow-x-auto scrollbar-hide">
              {SORT_OPTIONS.map((s, i) => (
                <button
                  key={s.value}
                  onClick={() => setActiveSort(i)}
                  className={`px-2 py-1 rounded text-sm whitespace-nowrap ${
                    i === activeSort ? "text-foreground font-medium" : "hover:text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="text-sm text-muted-foreground mb-4">
          {loading ? "불러오는 중..." : error ? error : `총 ${products.length}개`}
        </div>

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
                  <img
                    src={p.image}
                    alt={p.title}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur hover:bg-white"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
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
                    <h3 className="text-md font-medium text-foreground line-clamp-2 leading-6">
                      {p.title}
                    </h3>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <div className="text-base font-bold">
                        {Number(p.price ?? 0).toLocaleString()}원
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        addItem({
                          id: String(p.id),
                          title: String(p.title ?? "상품"),
                          imageUrl: String(p.image ?? ""),
                          price: typeof p.price === "number" ? p.price : Number(p.price) || 0,
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
                      {Array.from({ length: 5 }).map((_, i) => {
                        const avg = Math.round((p.avg_rating ?? 0) || 0);
                        return (
                          <svg
                            key={i}
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className={`w-4 h-4 ${
                              i < avg ? "text-amber-400" : "text-amber-200"
                            }`}
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.97a1 1 0 00.95.69h4.18c.969 0 1.371 1.24.588 1.81l-3.38 2.455a1 1 0 00-.364 1.118l1.286 3.97c.3.921-.755 1.688-1.54 1.118l-3.38-2.455a1 1 0 00-1.176 0L5.24 17.96c-.785.57-1.84-.197-1.54-1.118l1.286-3.97a1 1 0 00-.364-1.118L1.243 8.199c-.783-.57-.38-1.81.588-1.81h4.18a1 1 0 00.95-.69l1.286-3.97z" />
                          </svg>
                        );
                      })}

                      <div className="text-sm text-muted-foreground">
                        ({Number(p.review_count ?? 0).toLocaleString()})
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <Dialog open={dialogOpen} onOpenChange={(v) => setDialogOpen(v)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>장바구니에 담겼습니다</DialogTitle>
            </DialogHeader>

            <DialogDescription>
              {selectedProduct ? (
                <div className="text-sm text-muted-foreground">
                  {selectedProduct.title}이(가) 장바구니에 추가되었습니다. 장바구니로
                  이동하시겠습니까?
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  장바구니로 이동하시겠습니까?
                </div>
              )}
            </DialogDescription>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                아니요
              </Button>
              <Button
                onClick={() => {
                  setDialogOpen(false);
                  navigate("/cart");
                }}
              >
                예
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
      {wishToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg dark:bg-white dark:text-slate-900">
            {wishToast}
          </div>
        </div>
      )}
      <Footer />
    </div>
  );
};

export default Category;
