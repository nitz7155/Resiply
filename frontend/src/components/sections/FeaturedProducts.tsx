import { ChevronRight, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, Link } from "react-router-dom";
import { useCartStore } from "@/lib/cartStore";
import { useStore } from "@/lib/useStore";
import eggsImg from "@/assets/products/eggs.jpg";
import spinachImg from "@/assets/products/spinach.jpg";
import chickenImg from "@/assets/products/chicken.jpg";
import tomatoesImg from "@/assets/products/tomatoes.jpg";
import riceImg from "@/assets/products/rice.jpg";
import salmonImg from "@/assets/products/salmon.jpg";
import { useEffect, useState } from "react";
import { fetchProductList, Product as ApiProduct } from "@/api/product";
import AddToCartDialog from "@/components/common/AddToCartDialog";
import apiClient from "@/api/axios";

const fallbackImages = [eggsImg, spinachImg, chickenImg, tomatoesImg, riceImg, salmonImg];

function shuffle<T>(arr: T[]) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

const FeaturedProducts = () => {
  const navigate = useNavigate();
  const addItem = useCartStore((s) => s.addItem);
  const user = useStore((s) => s.user);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const params = { member_id: user?.id, limit: 10 };
        const recRes = await apiClient.get<any[]>("/mf_recommend/mf", params);
        const items = Array.isArray(recRes) ? recRes : (recRes as any).items ?? [];
        if (!mounted) return;
        const mapped = items.map((p: any, idx: number) => {
          const rawName = p.title ?? p.name ?? "";
          const short = rawName.length > 40 ? rawName.slice(0, 40).trimEnd() + "..." : rawName;
          return {
            id: p.id,
            name: rawName,
            displayName: short,
            price: p.price ?? 0,
            originalPrice: p.original_price ?? null,
            image: p.main_thumbnail ?? p.detail_images ?? fallbackImages[idx % fallbackImages.length],
          };
        });
        setProducts(mapped);
      } catch (err) {
        console.error("Failed to load featured products", err);
        try {
          const res = await fetchProductList({ size: 50 });
          const items = Array.isArray(res) ? res : (res as any).items ?? [];
          const shuffled = shuffle(items as ApiProduct[]);
          const limitedItems = shuffled.slice(0, Math.min(10, shuffled.length));
          if (!mounted) return;
          const mapped = limitedItems.map((p: ApiProduct, idx: number) => {
            const rawName = (p as any).title ?? p.name ?? "";
            const short = rawName.length > 40 ? rawName.slice(0, 40).trimEnd() + "..." : rawName;
            return {
              id: p.id,
              name: rawName,
              displayName: short,
              price: p.price,
              originalPrice: (p as any).original_price ?? null,
              image: p.main_thumbnail ?? fallbackImages[idx % fallbackImages.length],
            };
          });
          setProducts(mapped);
        } catch (fallbackErr) {
          console.error("Failed to load fallback featured products", fallbackErr);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  return (
    <section className="py-12 lg:py-16" id="store">
      <div className="container mx-auto px-4 lg:px-8">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl lg:text-3xl font-bold text-foreground mb-2">
              오늘의 추천 식자재
            </h2>
            <p className="text-muted-foreground">1인 가구를 위한 소량 패키지</p>
          </div>
          <Button variant="ghost" className="hidden sm:flex gap-1 text-primary" onClick={() => { navigate("/store") }}>
            전체보기 <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Products Scroll */}
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-hide">
          {products.map((product, index) => (
            <div
              key={product.id}
              className="flex-shrink-0 w-[200px] lg:w-[220px] group animate-fade-in"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <Link
                to={`/product/${product.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-card hover:shadow-soft transition-all duration-300 hover:-translate-y-1 h-full flex flex-col">
                {/* Image */}
                <div className="relative aspect-square bg-secondary overflow-hidden">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {product.originalPrice && (
                    <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                      SALE
                    </span>
                  )}
                </div>

                {/* Content */}
                {/* <div className="p-4"> */}
                <div className="p-4 pt-1 h-28 flex flex-col justify-between">
                  <h3
                    className="flex items-center font-medium text-foreground mb-2 overflow-hidden line-clamp-2 whitespace-normal"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {product.displayName ?? product.name}
                  </h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-bold text-foreground">
                        {product.price.toLocaleString()}원
                      </span>
                      {product.originalPrice && (
                        <span className="text-sm text-muted-foreground line-through">
                          {product.originalPrice.toLocaleString()}원
                        </span>
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
                          id: product.id.toString(),
                          title: product.name,
                          imageUrl: product.image,
                          price: product.price,
                          originalPrice: product.originalPrice ?? undefined,
                        });
                        setSelectedProduct(product);
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

        {/* Mobile View All */}
        <Button variant="outline" className="w-full mt-4 sm:hidden gap-1" asChild>
          <Link to="/store">
            전체보기 <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>

        <AddToCartDialog open={dialogOpen} setOpen={setDialogOpen} selectedProduct={selectedProduct} />
      </div>
    </section >
  );
};

export default FeaturedProducts;
