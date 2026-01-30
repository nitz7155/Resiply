import Header from "@/components/layout/Header";
import Navigation from "@/components/layout/Navigation";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState, useRef } from "react";
import { Image as ImageIcon, Lightbulb, X, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import ChatbotButton from '@/components/ui/ChatbotButton.tsx';
import { useCartStore } from "@/lib/cartStore";
import apiClient from "@/api/axios";
import useStore from "@/lib/useStore";

// --- 타입 정의 ---
type RecipeStep = {
  step_number: number;
  description: string;
  url: string | null;
};

type Recipe = {
  id: number;
  name: string;
  ingredients: Array<{
    name: string;
    qty: string;
    productId: number;
  }>;
  time: string;
  thumbnail: string;
  steps: RecipeStep[];
  products: Array<{
    id: number;
    title: string;
    image: string;
    price: number;
  }>;
  description: string;
};

const RecipeDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [sort, setSort] = useState("최신");
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState<number>(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [comments, setComments] = useState([]);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const addItem = useCartStore((state) => state.addItem);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [tips, setTips] = useState<string[]>([]);
  const [showTips, setShowTips] = useState(false);
  const [tipsLoading, setTipsLoading] = useState(false);
  const user = useStore((s: any) => s.user);

  const allRecipes = location.state?.recipes || [];

  useEffect(() => {
    if (!id) return;
    const getRecipeData = async () => {
      try {
        const res = await fetch(`/api/recipe/${id}`);
        const data = await res.json();
        setRecipe(data);
        // fetch like count / status
        try {
          const r2 = await fetch(`/api/recipe/${id}/likes`);
          if (r2.ok) {
            const j = await r2.json();
            setLikeCount(j.count || 0);
            setLiked(Boolean(j.liked));
          }
        } catch (e) {
          console.debug("like fetch failed", e);
        }
      } catch (err) {
        console.error("데이터 로드 에러:", err);
      }
    };
    getRecipeData();
  }, [id]);

  const recentRecipes = useMemo(() => {
    try {
      const raw = localStorage.getItem("recentRecipes");
      if (!raw) return [];
      const recentData = JSON.parse(raw);
      return recentData.slice(0, 3);
    } catch {
      return [];
    }
  }, []);

  const detail = useMemo(() => {
    if (!recipe) return null;

    return {
      id: recipe.id,
      title: recipe.name,
      short: `${recipe.name}의 간단 소개입니다. 맛있게 즐겨보세요!`,
      cookMinutes: recipe.time,
      description: recipe.description,
      ingredients: recipe.ingredients,
      products: recipe.products,

      steps: recipe.steps.map((s) => ({
        id: s.step_number,
        text: s.description,
        image: s.url
      })),
      completionImages: [recipe.thumbnail, ""],
      relatedProductIds: [2, 3, 4],
      reviews: []
    };
  }, [recipe]);

  const handleQuantityChange = (productId: number, delta: number) => {
    setQuantities((prev) => {
      const currentQuantity = prev[productId] || 1;
      const newQuantity = Math.max(1, currentQuantity + delta);
      return { ...prev, [productId]: newQuantity };
    });
  };

  const selectedTotalPrice = useMemo(() => {
    if (!recipe) return 0;

    return selectedIds.reduce((sum, productId) => {
      const prod = recipe.products.find((p) => p.id === productId);
      if (!prod) return sum;

      const qty = quantities[productId] || 1;
      return sum + prod.price * qty;
    }, 0);
  }, [recipe, selectedIds, quantities]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (!recipe) return;
    if (selectedIds.length === recipe.ingredients.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(recipe.ingredients.map((ing) => ing.productId));
    }
  };

  // Select all ingredients by default when a recipe is loaded
  useEffect(() => {
    if (!recipe) return;
    setSelectedIds(recipe.ingredients.map((ing) => ing.productId));
  }, [recipe]);

  useEffect(() => {
    if (!detail) return;
    // 현재 레시피를 로컬스토리지에 저장
    const recentData = JSON.parse(localStorage.getItem("recentRecipes") || "[]");
    const updated = [
      { id: detail.id, name: recipe?.name || detail.title, thumbnail: recipe?.thumbnail || "" },
      ...recentData.filter((item: any) => item.id !== detail.id)
    ].slice(0, 10);
    localStorage.setItem("recentRecipes", JSON.stringify(updated));
  }, [detail, recipe]);

  if (!recipe || !detail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">레시피를 불러오고 있습니다...</p>
        </div>
      </div>
    );
  }

  const onAddToCart = (productId: number) => {
    if (!recipe) return;
    const prod = recipe.products.find((p) => p.id === productId);
    if (!prod) {
      toast({ title: "상품 정보를 찾을 수 없습니다.", variant: "destructive" });
      return;
    }

    const cleanTitle = prod.title
      .replace(/(,\s*)?(1개입|1개|\d*개)[.,]?\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const qty = quantities[productId] || 1;

    addItem({
      id: prod.id.toString(),
      title: cleanTitle,
      imageUrl: prod.image,
      price: prod.price,
    }, qty);

    toast({
      title: `${cleanTitle} ${qty}개를 장바구니에 담았습니다.`
    });
  };

  const handleAddSelectedToCart = () => {
    if (selectedIds.length === 0) {
      toast({ title: "선택된 상품이 없습니다.", variant: "destructive" });
      return;
    }

    selectedIds.forEach((id) => onAddToCart(id));

    toast({ title: `${selectedIds.length}개 항목을 장바구니에 추가했습니다.` });

    setSelectedIds([]);
  };

  const relatedProducts = recipe.products.filter((p) => detail.relatedProductIds.includes(p.id));

  const onToggleLike = async () => {
    if (!id) {
      toast({ title: "레시피 정보가 없습니다.", variant: "destructive" });
      return;
    }

    try {
      const res = await fetch(`/api/recipe/${id}/like`, { method: "POST" });
      if (!res.ok) {
        if (res.status === 401) {
          toast({ title: "로그인이 필요합니다.", variant: "destructive" });
        } else {
          toast({ title: "좋아요 처리에 실패했습니다.", variant: "destructive" });
        }
        return;
      }

      const j = await res.json();
      setLikeCount(j.count);
      setLiked(j.liked);
      const updatedRecipes = allRecipes.map((r: any) => 
        r.id === Number(id) ? { ...r, like_count: j.count } : r
      );
      navigate(location.pathname, { 
        state: { ...location.state, recipes: updatedRecipes }, 
        replace: true 
      });
      toast({ title: j.liked ? "좋아요" : "좋아요 취소" });
    } catch (e) {
      console.error(e);
      toast({ title: "통신 오류가 발생했습니다.", variant: "destructive" });
    }
  };

  const onToggleBookmark = () => {
    setBookmarked((v) => !v);
    toast({ title: bookmarked ? "찜 해제" : "찜 등록" });
  };

  const onShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: "링크가 복사되었습니다." });
    } catch {
      toast({ title: "공유에 실패했습니다." });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setAttachedFiles(Array.from(e.target.files));
  };

  const submitComment = () => {
    const textEl = document.getElementById("comment-text") as HTMLTextAreaElement | null;
    if (textEl) textEl.value = "";
    setAttachedFiles([]);
    toast({ title: "댓글이 등록되었습니다." });
  };


  const getTips = async () => {
    if (!recipe?.id) return;

    setShowTips(true);
    setTipsLoading(true);

    try {
      const res = await apiClient.get<{ tips: string[] }>(
        `/recipe/${recipe.id}/tips`,
        { withCredentials: true }
      );

      const data = (res as any)?.data ?? res;
      setTips((data as any)?.tips ?? []);
    } catch (e: any) {
      // console.error(e);

      // axios.ts가 Error("...json string...") 형태로 던지니까 파싱 시도
      let status: number | undefined;
      let detail: string | undefined;

      // 1) axios error 표준 형태일 수도 있음
      status = e?.response?.status;
      detail = e?.response?.data?.detail;

      // 2) 너 로그처럼 Error: {"detail":"..."} 문자열로 올 수도 있음
      if (!detail && typeof e?.message === "string") {
        try {
          const parsed = JSON.parse(e.message);
          detail = parsed?.detail;
        } catch { }
      }

      if (status === 401 || detail?.includes("로그인이 필요")) {
        toast({ title: "로그인이 필요합니다.", variant: "destructive" });
        setShowTips(false);
        setTipsLoading(false);
        return;
      }

      toast({ title: "팁을 불러오지 못했어요.", variant: "destructive" });
      setShowTips(false);
      setTipsLoading(false);
    } finally {
      setTipsLoading(false);
    }
  };



  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <Navigation />
      <main className="container mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 mb-8 pb-24 sm:pb-0">
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          {/* Hero */}
          <div className="relative bg-secondary aspect-[16/7] sm:aspect-[16/6] overflow-hidden">
            <img
              src={recipe.thumbnail}
              alt={recipe.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

            <div className="absolute left-4 right-4 sm:left-6 sm:right-6 bottom-4 sm:bottom-6 text-white">
              <h1 className="text-2xl sm:text-4xl font-bold leading-tight break-words drop-shadow">
                {detail.title}
              </h1>

              <div className="mt-3 sm:mt-4 flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className="bg-white/20 text-white border-none text-xs sm:text-sm"
                >
                  {detail.cookMinutes}
                </Badge>
              </div>
            </div>
          </div>

          <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
            <section className="lg:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold border-b pb-2">레시피 설명</h2>

                {/* 내 취향 팁보기 버튼 */}
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-amber-400 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                    onClick={getTips}
                    disabled={tipsLoading}
                  >
                    {tipsLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Lightbulb className="w-4 h-4" />
                    )}
                    내 취향 팁보기
                  </Button>

                  {/* 팁 팝오버 */}
                  {showTips && (
                    <div className="absolute right-0 top-12 z-50 w-80 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl shadow-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-semibold text-amber-800">맞춤 요리 팁</span>
                        <button onClick={() => setShowTips(false)}>
                          <X className="w-4 h-4 text-amber-600 hover:text-amber-800" />
                        </button>
                      </div>

                      {tipsLoading ? (
                        <div className="flex flex-col items-center justify-center py-6 gap-3">
                          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                          <p className="text-sm text-amber-700 text-center">
                            AI가 사용자 맞춤 팁을<br />생성하고 있습니다..
                          </p>
                        </div>
                      ) : (
                        <ul className="space-y-2 list-disc pl-5 text-amber-900">
                          {tips.map((t, i) => (
                            <li key={i}>{t}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                </div>
              </div>

              <p className="mt-4 text-muted-foreground leading-relaxed">{detail.description}</p>

              <div className="mt-10">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <h3 className="text-lg font-semibold">필요한 재료</h3>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={toggleAll}
                      className="h-9 px-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700
                                dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-200"
                    >
                      {selectedIds.length === detail.ingredients.length ? "전체 해제" : "전체 선택"}
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      disabled={selectedIds.length === 0}
                      onClick={handleAddSelectedToCart}
                      className="hidden sm:inline-flex h-9"
                    >
                      선택 상품 담기 ({selectedIds.length})
                    </Button>
                  </div>
                </div>

                <ul className="space-y-3">
                  {detail.ingredients.map((ing, idx) => {
                    const prod = recipe.products.find((p) => p.id === ing.productId);
                    const isSelected = selectedIds.includes(ing.productId);

                    return (
                      <li
                        key={idx}
                        className={`p-4 rounded-lg border transition-colors ${isSelected ? "bg-secondary/60 border-primary" : "bg-secondary/30 border-border"
                          }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              className="w-5 h-5 accent-primary cursor-pointer shrink-0"
                              checked={isSelected}
                              onChange={() => toggleSelect(ing.productId)}
                            />

                            <div className="w-12 h-12 bg-muted rounded flex items-center justify-center overflow-hidden shrink-0">
                              {prod?.image ? (
                                <img src={prod.image} alt={ing.name} className="w-full h-full object-cover" />
                              ) : (
                                <ImageIcon className="text-muted-foreground" />
                              )}
                            </div>

                            <div className="flex flex-col gap-1 min-w-0">
                              <span className="font-semibold truncate">{ing.name}</span>
                              <span className="text-sm text-muted-foreground truncate">{ing.qty}</span>
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
                            <div className="flex items-center justify-between sm:justify-start gap-3">
                              <div className="flex items-center border border-border rounded-md justify-between w-[110px] shrink-0">
                                <button
                                  className="px-3 py-2 hover:bg-secondary text-muted-foreground"
                                  onClick={() => handleQuantityChange(ing.productId, -1)}
                                >
                                  -
                                </button>
                                <span className="text-sm font-medium">{quantities[ing.productId] || 1}</span>
                                <button
                                  className="px-3 py-2 hover:bg-secondary text-muted-foreground"
                                  onClick={() => handleQuantityChange(ing.productId, 1)}
                                >
                                  +
                                </button>
                              </div>

                              <div className="text-right font-semibold text-primary whitespace-nowrap">
                                {prod ? prod.price.toLocaleString() + "원" : ""}
                              </div>
                            </div>

                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full sm:w-[72px]"
                              onClick={() => onAddToCart(ing.productId)}
                            >
                              담기
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="mt-12">
                <h3 className="text-lg font-semibold mb-6">조리 순서</h3>
                <div className="space-y-8">
                  {detail.steps.map((s, idx) => (
                    <div key={idx} className="flex flex-col md:flex-row gap-6 p-4 rounded-xl hover:bg-secondary/20 transition-colors">
                      <div className="w-full md:w-48 h-32 bg-muted rounded-lg overflow-hidden flex-shrink-0 shadow-sm">
                        <img src={s.image || recipe.thumbnail} className="w-full h-full object-cover" alt={`Step ${s.id}`} />
                      </div>
                      <div className="flex gap-4">
                        <span className="text-3xl font-black text-primary italic">{s.id}</span>
                        <p className="text-md pt-1 leading-relaxed">{s.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-12 pt-8 border-t">
                <div className="flex items-center gap-1 sm:gap-4">
                  <Button onClick={onToggleLike} variant={liked ? "default" : "outline"} className="gap-2">
                    {liked ? "❤️ 좋아요 취소" : "🤍 좋아요"}
                  </Button>
                  <Button onClick={onToggleBookmark} variant={bookmarked ? "default" : "outline"} className="gap-2">
                    {bookmarked ? "⭐ 찜 해제" : "📁 레시피 저장"}
                  </Button>
                  <Button onClick={onShare} variant="outline" className="gap-2">📤 공유하기</Button>
                </div>
              </div>

              <div className="mt-8">
                <h3 className="text-md font-semibold">댓글</h3>
                <div className="mt-3 flex items-center gap-2">
                  <div className="text-sm text-muted-foreground">정렬:</div>
                  <Button size="sm" variant={sort === "최신" ? "default" : "outline"} onClick={() => setSort("최신")}>최신</Button>
                  <Button size="sm" variant={sort === "인기" ? "default" : "outline"} onClick={() => setSort("인기")}>인기</Button>
                </div>

                <div className="mt-4 space-y-4">
                  {comments.map((r: any) => (
                    <div key={r.id} className="bg-card p-3 rounded border border-border">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-secondary" />
                          <div>
                            <div className="font-medium">{r.user}</div>
                            <div className="text-xs text-muted-foreground">{r.date}</div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 text-sm">{r.text}</div>

                      <div className="mt-3 flex gap-2">
                        {(r.images || []).map((im: string, ii: number) => (
                          <div key={ii} className="w-24 h-24 bg-secondary rounded overflow-hidden">
                            <img src={im || r.image} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6">
                  <h4 className="text-sm font-semibold">댓글 / 사진 올리기</h4>
                  <div className="mt-2 flex flex-col gap-2">
                    <div className="flex items-start gap-2">
                      <button type="button" className="p-2 bg-secondary rounded" onClick={() => fileInputRef.current?.click()}>
                        <ImageIcon className="h-4 w-4" />
                      </button>
                      <textarea id="comment-text" className="flex-1 p-2 border border-border rounded" placeholder="댓글을 작성하세요" />
                      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={submitComment}>등록</Button>
                    </div>
                  </div>
                </div>

              </div>
            </section>

            <aside className="space-y-8">
              <div className="bg-secondary/20 p-6 rounded-xl border border-border lg:sticky lg:top-24">
                <h4 className="font-bold text-lg mb-4">최근 본 레시피</h4>
                <div className="space-y-3">
                  {recentRecipes.map((r) => (
                    <button
                      key={r.id}
                      className="flex items-center gap-3 w-full text-left hover:opacity-70 transition-opacity"
                      onClick={() => navigate(`/recipes/${r.id}`)}
                    >
                      <img src={r.thumbnail} className="w-12 h-10 object-cover rounded" />
                      <span className="text-xs font-medium truncate">{r.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>
      <div className="sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-screen-lg px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">
                선택한 상품 {selectedIds.length}개
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate">선택한 재료를 한 번에 장바구니에 담아요</span>
              </div>
            </div>
            <Button
              size="sm"
              variant="default"
              disabled={selectedIds.length === 0}
              onClick={handleAddSelectedToCart}
              className="h-11 px-4"
            >
              선택 담기 ({selectedIds.length}) · {selectedTotalPrice.toLocaleString()}원
            </Button>
          </div>
        </div>
      </div>
      <ChatbotButton />
      <Footer />
    </div>
  );
};

export default RecipeDetail;
