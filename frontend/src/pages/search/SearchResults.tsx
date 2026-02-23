import Header from "@/components/layout/Header";
import Navigation from "@/components/layout/Navigation";
import Footer from "@/components/layout/Footer";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChevronRight, ShoppingCart, Clock } from "lucide-react";
import { fetchSearchProducts } from "@/api/product";
import { Link } from "react-router-dom";
import { useCartStore } from "@/lib/cartStore";
import AddToCartDialog from "@/components/common/AddToCartDialog";

import eggsImg from "@/assets/products/eggs.jpg";
import ChatbotButton from '@/components/ui/ChatbotButton.tsx';

// Recipes are loaded from backend search results (type === 'recipe')

const SearchResults = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const q = searchParams.get("q") || "";

  const [view, setView] = useState<"summary" | "tabs">("summary");
  const [activeTab, setActiveTab] = useState<"ingredients" | "recipes">("ingredients");

  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addItem = useCartStore((s) => s.addItem);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);

  useEffect(() => {
    // reset to summary when query changes
    setView("summary");
    setActiveTab("ingredients");

    const controller = new AbortController();
    const fetchResults = async () => {
      if (!q) {
        setResults([]);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const items = await fetchSearchProducts(q, { limit: 50, signal: controller.signal });
        setResults(items);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        setError(err.message || String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchResults();

    return () => controller.abort();
  }, [q]);

  const topIngredients = useMemo(() => results.filter((it) => it.type === 'product').slice(0, 6), [results]);
  const topRecipes = useMemo(() => results.filter((it) => it.type === 'recipe').slice(0, 2), [results]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Navigation />

      <main className="container mx-auto px-4 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl">'
            <span className="font-semibold">{q}</span>'에 대한 검색 결과
          </h1>
        </div>

        {/* Summary view: stacked lists with 더보기 buttons */}
        {view === "summary" && (
          <div className="space-y-6">
            <section className="bg-card p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-medium">재료</h2>
                <button
                  onClick={() => { navigate(`/search/full?q=${encodeURIComponent(q)}&tab=ingredients`); }}
                  className="text-sm text-primary inline-flex items-center gap-1 hover:underline"
                  aria-label="더보기 재료"
                >
                  더보기
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-hide">
                {loading && <div className="px-4">로딩 중...</div>}
                {!loading && topIngredients.length === 0 && (
                  <div className="px-4 text-sm text-muted-foreground">검색 결과가 없습니다.</div>
                )}
                {topIngredients.map((p, index) => (
                  <div
                    key={p.id}
                    className="flex-shrink-0 w-[180px] lg:w-[200px] group animate-fade-in"
                    style={{ animationDelay: `${index * 0.04}s` }}
                  >
                      <Link to={`/product/${p.id}`} className="block">
                      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-card hover:shadow-soft transition-all duration-300 hover:-translate-y-1 h-full flex flex-col">
                        <div className="relative aspect-square bg-secondary overflow-hidden">
                          <img src={(p as any).main_thumbnail || eggsImg} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          {(p as any).original_price && (
                            <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-xs font-medium">SALE</span>
                          )}
                        </div>

                        <div className="p-4 pt-1 h-28 flex flex-col justify-between">
                          <h3 className="flex items-center font-medium text-foreground mb-2 overflow-hidden line-clamp-2 whitespace-normal" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.title || p.name}</h3>
                          <div className="flex items-center justify-between">
                            <div className="flex items-baseline gap-2">
                              <span className="text-lg font-bold text-foreground">{(p.price || 0).toLocaleString()}원</span>
                              {(p as any).original_price && (
                                <span className="text-sm text-muted-foreground line-through">{(p as any).original_price.toLocaleString()}원</span>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-primary hover:bg-primary hover:text-primary-foreground"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                addItem({
                                  id: String(p.id),
                                  title: p.title,
                                  imageUrl: (p as any).main_thumbnail,
                                  price: p.price,
                                  originalPrice: (p as any).original_price ?? undefined,
                                });
                                setSelectedProduct(p);
                                setDialogOpen(true);
                              }}
                            >
                              <ShoppingCart className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-card p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-medium">레시피</h2>
                <button
                  onClick={() => { navigate(`/search/full?q=${encodeURIComponent(q)}&tab=recipes`); }}
                  className="text-sm text-primary inline-flex items-center gap-1 hover:underline"
                  aria-label="더보기 레시피"
                >
                  더보기
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {topRecipes.length === 0 && !loading && (
                  <div className="px-4 text-sm text-muted-foreground">검색 결과가 없습니다.</div>
                )}
                {topRecipes.map((rec) => (
                  <Link to={`/recipes/${rec.id}`}>
                    <div key={rec.id} className="group bg-card rounded-2xl border border-border overflow-hidden shadow-card hover:shadow-soft transition-all duration-300">
                      <div className="flex flex-col sm:flex-row">
                        <div className="relative w-full sm:w-48 lg:w-56 aspect-video sm:aspect-square overflow-hidden shrink-0">
                          <img src={(rec as any).thumbnail || rec.image} alt={(rec as any).name || rec.title} className="w-full h-full object-cover" />
                          <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-accent text-accent-foreground text-xs font-medium">{(rec as any).servings || ''}</span>
                        </div>
                        <div className="flex-1 p-4 flex flex-col justify-center">
                          <span className="text-xs font-medium text-primary mb-2">{(rec as any).difficulty || ''}</span>
                          <h3 className="text-lg font-semibold text-foreground mb-2">{(rec as any).name || rec.title}</h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1.5"><Clock className="h-4 w-4"/>{(rec as any).time || ''}</div>
                          </div>
                          {(rec as any).snippet && <div className="text-sm text-muted-foreground mt-2 line-clamp-2">{(rec as any).snippet}</div>}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* Tabs view: full lists */}
        {view === "tabs" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium">전체 결과</h2>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setView("summary")}>요약보기</Button>
              </div>
            </div>

            <Tabs defaultValue={activeTab} value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList>
                <TabsTrigger value="ingredients">재료</TabsTrigger>
                <TabsTrigger value="recipes">레시피</TabsTrigger>
              </TabsList>

              <TabsContent value="ingredients">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                  {results.length === 0 && !loading && (
                    <div className="text-sm text-muted-foreground">검색 결과가 없습니다.</div>
                  )}
                  {results.map((it) => (
                    <Link key={it.id} to={`/product/${it.id}`} className="block">
                      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-card hover:shadow-soft transition-all duration-300">
                        <div className="relative w-full h-40 bg-secondary overflow-hidden">
                          <img src={it.main_thumbnail || eggsImg} alt={it.title} className="w-full h-full object-cover" />
                        </div>
                        <div className="p-3 w-full">
                          <div className="text-sm font-medium">{it.title}</div>
                          <div className="flex items-center justify-between mt-2">
                            <div className="text-xs text-muted-foreground">가격: {it.price.toLocaleString()}원</div>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-primary hover:bg-primary hover:text-primary-foreground"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                addItem({
                                  id: String(it.id),
                                  title: it.title,
                                  imageUrl: it.main_thumbnail,
                                  price: it.price,
                                });
                                setSelectedProduct(it);
                                setDialogOpen(true);
                              }}
                            >
                              <ShoppingCart className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="recipes">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                  {results.filter((it) => it.type === 'recipe').length === 0 && !loading && (
                    <div className="text-sm text-muted-foreground">검색 결과가 없습니다.</div>
                  )}
                  {results.filter((it) => it.type === 'recipe').map((r) => (
                    <div key={r.id} className="flex flex-col items-start bg-card rounded-md border overflow-hidden">
                      <div className="w-full h-56 bg-muted" />
                      <div className="p-3 w-full">
                        <div className="text-sm font-medium">{r.title}</div>
                        <div className="text-xs text-muted-foreground mt-1">간단 소개 또는 소요시간 등</div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>

      <AddToCartDialog open={dialogOpen} setOpen={setDialogOpen} selectedProduct={selectedProduct} />
      <ChatbotButton />
      <Footer />
    </div>
  );
};

export default SearchResults;
