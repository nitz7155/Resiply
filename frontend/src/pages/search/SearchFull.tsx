import Header from "@/components/layout/Header";
import Navigation from "@/components/layout/Navigation";
import Footer from "@/components/layout/Footer";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShoppingCart, Clock } from "lucide-react";
import { fetchSearchProducts } from "@/api/product";
import { useCartStore } from "@/lib/cartStore";
import AddToCartDialog from "@/components/common/AddToCartDialog";
import eggsImg from "@/assets/products/eggs.jpg";

const SearchFull = () => {
  const [searchParams] = useSearchParams();
  const q = searchParams.get("q") || "";
  const tab = (searchParams.get("tab") as "ingredients" | "recipes") || "ingredients";

  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addItem = useCartStore((s) => s.addItem);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<typeof tab>(tab);

  useEffect(() => {
    setActiveTab(tab);
  }, [tab]);

  useEffect(() => {
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
        const items = await fetchSearchProducts(q, { limit: 100, signal: controller.signal });
        console.debug("SearchFull: fetched items for q=", q, items);
        setResults(items);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        setError(err.message || String(err));
        console.error("SearchFull: fetch error", err);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
    return () => controller.abort();
  }, [q]);

  const recipes = useMemo(() => results.filter((it) => it.type === 'recipe'), [results]);

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

        <div className="flex items-center justify-between mb-4">
          <div />
        </div>

        <Tabs defaultValue={activeTab} value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList>
            <TabsTrigger value="ingredients">재료</TabsTrigger>
            <TabsTrigger value="recipes">레시피</TabsTrigger>
          </TabsList>

          <TabsContent value="ingredients">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
              {loading && (
                <div className="text-sm text-muted-foreground">로딩 중...</div>
              )}
              {error && (
                <div className="text-sm text-destructive">에러: {error}</div>
              )}
              {!loading && results.length === 0 && !error && (
                <div className="text-sm text-muted-foreground">검색 결과가 없습니다.</div>
              )}
              {results.filter((it) => it.type === 'product').map((it) => {
                const rawName = (it as any).title ?? it.name ?? "";
                const displayName = rawName.length > 80 ? rawName.slice(0, 80).trimEnd() + "..." : rawName;
                const imgUrl = (it as any).main_thumbnail || (it as any).detail_images || "";
                return (
                  <Link key={it.id} to={`/product/${it.id}`} className="bg-card rounded-md border border-border overflow-hidden shadow-card block hover:shadow-soft transition-transform hover:-translate-y-1">
                    <div className="relative bg-secondary aspect-[4/3] overflow-hidden">
                      <img src={imgUrl || eggsImg} alt={it.name} className="w-full h-full object-cover" />
                    </div>

                    <div className="p-3">
                      <div className="h-12">
                        <h3 className="text-md font-medium text-foreground line-clamp-2 leading-6">{displayName}</h3>
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <div className="text-base font-bold">{it.price.toLocaleString()}원</div>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-2"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            addItem({ id: String(it.id), title: it.name, imageUrl: imgUrl, price: it.price });
                            setSelectedProduct(it);
                            setDialogOpen(true);
                          }}
                        >
                          <ShoppingCart className="h-4 w-4" /> 담기
                        </Button>
                      </div>

                        <div className="mt-4 text-xs text-muted-foreground flex items-center gap-3">
                            <div className="flex items-center text-amber-400">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.97a1 1 0 00.95.69h4.18c.969 0 1.371 1.24.588 1.81l-3.38 2.455a1 1 0 00-.364 1.118l1.286 3.97c.3.921-.755 1.688-1.54 1.118l-3.38-2.455a1 1 0 00-1.176 0L5.24 17.96c-.785.57-1.84-.197-1.54-1.118l1.286-3.97a1 1 0 00-.364-1.118L1.243 8.199c-.783-.57-.38-1.81.588-1.81h4.18a1 1 0 00.95-.69l1.286-3.97z"/></svg>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.97a1 1 0 00.95.69h4.18c.969 0 1.371 1.24.588 1.81l-3.38 2.455a1 1 0 00-.364 1.118l1.286 3.97c.3.921-.755 1.688-1.54 1.118l-3.38-2.455a1 1 0 00-1.176 0L5.24 17.96c-.785.57-1.84-.197-1.54-1.118l1.286-3.97a1 1 0 00-.364-1.118L1.243 8.199c-.783-.57-.38-1.81.588-1.81h4.18a1 1 0 00.95-.69l1.286-3.97z"/></svg>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.97a1 1 0 00.95.69h4.18c.969 0 1.371 1.24.588 1.81l-3.38 2.455a1 1 0 00-.364 1.118l1.286 3.97c.3.921-.755 1.688-1.54 1.118l-3.38-2.455a1 1 0 00-1.176 0L5.24 17.96c-.785.57-1.84-.197-1.54-1.118l1.286-3.97a1 1 0 00-.364-1.118L1.243 8.199c-.783-.57-.38-1.81.588-1.81h4.18a1 1 0 00.95-.69l1.286-3.97z"/></svg>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.97a1 1 0 00.95.69h4.18c.969 0 1.371 1.24.588 1.81l-3.38 2.455a1 1 0 00-.364 1.118l1.286 3.97c.3.921-.755 1.688-1.54 1.118l-3.38-2.455a1 1 0 00-1.176 0L5.24 17.96c-.785.57-1.84-.197-1.54-1.118l1.286-3.97a1 1 0 00-.364-1.118L1.243 8.199c-.783-.57-.38-1.81.588-1.81h4.18a1 1 0 00.95-.69l1.286-3.97z"/></svg>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-300"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.97a1 1 0 00.95.69h4.18c.969 0 1.371 1.24.588 1.81l-3.38 2.455a1 1 0 00-.364 1.118l1.286 3.97c.3.921-.755 1.688-1.54 1.118l-3.38-2.455a1 1 0 00-1.176 0L5.24 17.96c-.785.57-1.84-.197-1.54-1.118l1.286-3.97a1 1 0 00-.364-1.118L1.243 8.199c-.783-.57-.38-1.81.588-1.81h4.18a1 1 0 00.95-.69l1.286-3.97z"/></svg>
                            <div className="text-sm text-muted-foreground">(548,623)</div>
                            </div>
                        </div>
                    </div>
                    </Link>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="recipes">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
              {recipes.length === 0 && !loading && (
                <div className="text-sm text-muted-foreground">검색 결과가 없습니다.</div>
              )}
              {recipes.map((rec) => (
                <div key={rec.id} className="group bg-card rounded-2xl border border-border overflow-hidden shadow-card hover:shadow-soft transition-all duration-300">
                  <div className="flex flex-col sm:flex-row">
                    <div className="relative w-full sm:w-48 lg:w-56 aspect-video sm:aspect-square overflow-hidden shrink-0">
                      { (rec as any).thumbnail ? <img src={(rec as any).thumbnail} alt={(rec as any).name || rec.title} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-muted" /> }
                    </div>
                    <div className="flex-1 p-4 flex flex-col justify-center">
                      <span className="text-xs font-medium text-primary mb-2">{(rec as any).difficulty || ''}</span>
                      <h3 className="text-lg font-semibold text-foreground mb-2">{(rec as any).name || rec.title}</h3>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5"><Clock className="h-4 w-4"/>{(rec as any).time || ''}</div>
                      </div>
                      {(rec as any).snippet && <div className="text-sm text-muted-foreground mt-2 line-clamp-3">{(rec as any).snippet}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>
      <AddToCartDialog open={dialogOpen} setOpen={setDialogOpen} selectedProduct={selectedProduct} />
      <Footer />
    </div>
  );
};

export default SearchFull;
