import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Navigation from "@/components/layout/Navigation";
import Footer from "@/components/layout/Footer";
import {
    fetchAnalyzeProductImage,
    fetchProductDetail,
    fetchProductList,
    fetchProductReviews,
    postProductReview,
    Product,
    ProductReviewOut,
} from "@/api/product";
import AddToCartDialog from "@/components/common/AddToCartDialog";
import { useCartStore } from "@/lib/cartStore";
import useStore from "@/lib/useStore";
import { Heart } from "lucide-react";
import type { WishlistItem } from "@/api/wishlist";
import { addWishlist, removeWishlist } from "@/api/wishlist";
import ChatbotButton from '@/components/ui/ChatbotButton.tsx';

const ProductDetail = (): JSX.Element => {
    const { id } = useParams();
    const navigate = useNavigate();

    // -- Store & User --
    const user = useStore((s) => s.user);
    const addItem = useCartStore((s) => s.addItem);
    const clearSelection = useCartStore((s) => s.clearSelection);
    const toggleWishlist = useStore((s) => s.toggleWishlist);
    const isWishlisted = useStore((s) => s.isWishlisted);

    // -- Local State --
    const [qty, setQty] = useState<number>(1);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

    // Product Data
    const [product, setProduct] = useState<Product | null>(null);
    const [recommended, setRecommended] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [aiDescription, setAiDescription] = useState<string | null>(null);

    // UI State
    const [showFullDetails, setShowFullDetails] = useState(false);
    const [wishToast, setWishToast] = useState<string | null>(null);

    // Reviews State
    const [reviews, setReviews] = useState<ProductReviewOut[]>([]);
    const [reviewsLoading, setReviewsLoading] = useState(false);
    const [reviewContent, setReviewContent] = useState("");
    const [reviewRating, setReviewRating] = useState<number>(5); // 기본 5점
    const [reviewSubmitting, setReviewSubmitting] = useState(false);

    // Derived Values
    const unitPrice = product ? product.price : 0;
    const detailImages = product?.detail_images ? product.detail_images.split("|").filter(Boolean) : [];
    const monthlyBuyers = product?.monthly_buyers ?? 0;
    const monthlyBuyersText = product
        ? `한 달간 ${monthlyBuyers.toLocaleString()}명 구매했어요`
        : '한 달간 구매 이력을 불러오는 중이에요';
    const formatPrice = (n: number) => `${n.toLocaleString()}원`;

    // -- Effects --

    // 1. Fetch Product, Recommended, AI Analysis
    useEffect(() => {
        if (!id) return;
        const pid = Number(id);
        if (Number.isNaN(pid)) return;

        const ac = new AbortController();
        setLoading(true);
        setAiDescription(null); // Reset for skeleton loading

        (async () => {
            try {
                // AI Fetch (Parallel)
                fetchAnalyzeProductImage(pid, { signal: ac.signal })
                    .then(setAiDescription)
                    .catch(() => {}); // Ignore AI error

                // Product & Recommended Fetch
                const p = await fetchProductDetail(pid);
                setProduct(p);

                const list = await fetchProductList({ category_id: p.category_id, size: 4 });
                const items = Array.isArray(list) ? list : (list as any).items ?? [];
                setRecommended((items as Product[]).filter((it) => it.id !== pid).slice(0, 4));

            } catch (e) {
                if ((e as any)?.name !== 'AbortError') console.error(e);
            } finally {
                setLoading(false);
            }
        })();

        return () => ac.abort();
    }, [id]);

    // 2. Fetch Reviews
    useEffect(() => {
        if (!id) return;
        const pid = Number(id);
        if (Number.isNaN(pid)) return;

        const ac = new AbortController();
        setReviewsLoading(true);

        fetchProductReviews(pid, { page: 1, size: 10 }, { signal: ac.signal })
            .then((res) => setReviews(res.items || []))
            .catch((e) => { if ((e as any)?.name !== 'AbortError') console.error(e); })
            .finally(() => setReviewsLoading(false));

        return () => ac.abort();
    }, [id]);

    // -- Handlers --

    const showWishToastMsg = (msg: string) => {
        setWishToast(msg);
        window.setTimeout(() => setWishToast(null), 1500);
    };

    const handleToggleWish = async (p: Product) => {
        const pid = String(p.id);
        const liked = isWishlisted(pid);
        const item: WishlistItem = {
            id: pid,
            title: String(p.title ?? p.name ?? "상품"),
            name: String(p.name ?? p.title ?? "상품"),
            price: typeof p.price === 'number' ? p.price : Number(p.price) || 0,
            imageUrl: String(p.main_thumbnail ?? ""),
            image: String(p.main_thumbnail ?? ""),
            thumbnail: String(p.main_thumbnail ?? ""),
            likedAt: new Date().toISOString(),
            savedAt: new Date().toISOString(),
        };

        try {
            if (liked) await removeWishlist(pid);
            else await addWishlist(pid);
            toggleWishlist(item);
            showWishToastMsg(liked ? '찜을 해제했어요' : '상품을 찜했어요');
        } catch (e) {
            console.error(e);
            showWishToastMsg('찜 저장에 실패했어요');
        }
    };

    const handleAddReview = async () => {
        if (!id) return;
        if (!user?.id) { navigate(`/login?next=/product/${id}`); return; }

        const pid = Number(id);
        if (reviewRating <= 0 || !reviewContent.trim()) return;

        setReviewSubmitting(true);
        try {
            const payload = { member_id: Number(user.id), content: reviewContent.trim(), rating: reviewRating };
            const created = await postProductReview(pid, payload);
            setReviews(prev => [created, ...prev]);
            setReviewContent('');
            setReviewRating(5);
            // refresh product summary (for avg rating update)
            try { const updated = await fetchProductDetail(pid); setProduct(updated); } catch {}
        } catch (e) { console.error(e); }
        finally { setReviewSubmitting(false); }
    };

    const handleAddToCart = (directBuy: boolean) => {
        if (!product) return;
        if (directBuy) clearSelection();

        const cartItem = {
            id: String(product.id),
            title: product.title,
            imageUrl: product.main_thumbnail,
            price: product.price
        };

        addItem(cartItem, qty);

        if (directBuy) {
            navigate('/checkout');
        } else {
            setSelectedProduct(product);
            setDialogOpen(true);
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <Header />
            <Navigation />

            <main>
                <div className="container mx-auto px-4 lg:px-8 py-8">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">

                        {/* Left: Product Images */}
                        <div className="lg:col-span-6">
                            <div className="relative p-6 rounded-lg overflow-visible bg-[hsl(var(--background))]">
                                <div className="relative h-[300px] md:h-[360px] lg:h-[420px]">
                                    <img
                                        src={product?.main_thumbnail ?? "/src/assets/products/placeholder-product.jpg"}
                                        alt={product?.title ?? "product"}
                                        className="w-full h-full object-contain rounded-md"
                                    />
                                    {/* Heart Button */}
                                    <button
                                        type="button"
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (product) handleToggleWish(product); }}
                                        aria-label={product && isWishlisted(String(product.id)) ? "찜 해제" : "찜하기"}
                                        className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur hover:bg-white"
                                    >
                                        <Heart className={product && isWishlisted(String(product.id)) ? 'h-5 w-5 fill-orange-500 text-orange-500' : 'h-5 w-5 text-slate-400'} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Right: Product Info */}
                        <div className="lg:col-span-6 flex flex-col justify-between p-6 h-auto lg:h-[420px]">
                            <div>
                                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold leading-tight break-keep">{product?.title ?? '상품명'}</h1>

                                {/* Rating & Badge */}
                                <div className="mt-4 flex flex-wrap items-center gap-4">
                                    <div className="flex items-center gap-1">
                                        {(() => {
                                            const avg = Math.round((((product?.avg_rating ?? 0) || 0) * 10)) / 10; // one decimal
                                            const filled = Math.round(avg);
                                            return (
                                                <>
                                                    {Array.from({ length: 5 }).map((_, i) => (
                                                        <svg key={i} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 ${i < filled ? 'text-amber-400' : 'text-amber-200'}`}>
                                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.97a1 1 0 00.95.69h4.18c.969 0 1.371 1.24.588 1.81l-3.38 2.455a1 1 0 00-.364 1.118l1.286 3.97c.3.921-.755 1.688-1.54 1.118l-3.38-2.455a1 1 0 00-1.176 0L5.24 17.96c-.785.57-1.84-.197-1.54-1.118l1.286-3.97a1 1 0 00-.364-1.118L1.243 8.199c-.783-.57-.38-1.81.588-1.81h4.18a1 1 0 00.95-.69l1.286-3.97z"/>
                                                        </svg>
                                                    ))}
                                                    <div className="text-sm font-medium ml-2">{avg.toFixed(1)}</div>
                                                    <div className="text-sm text-muted-foreground">({(product?.review_count ?? 0).toLocaleString()})</div>
                                                </>
                                            );
                                        })()}
                                    </div>

                                     <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs">
                                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 10-1.414 1.414L9 13.414l4.707-4.707z" clipRule="evenodd"/></svg>
                                         <span>{monthlyBuyersText}</span>
                                    </div>
                                </div>

                                {/* AI Description */}
                                <div className="mt-6">
                                    <h3 className="text-sm font-semibold mb-2">AI 상품 요약</h3>
                                    <div className="text-sm text-muted-foreground">
                                        {aiDescription ? (
                                            <p className="whitespace-pre-line">{aiDescription}</p>
                                        ) : (
                                            <div className="space-y-3 animate-pulse">
                                                <div className="h-4 bg-amber-100 rounded w-full" />
                                                <div className="h-4 bg-amber-100 rounded w-11/12" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Price & Cart Actions */}
                            <div className="mt-8">
                                <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 mb-4">
                                    <div className="text-base lg:text-lg font-medium text-muted-foreground">총 상품 금액</div>
                                    <div className="text-xl sm:text-2xl font-semibold text-emerald-700">{formatPrice(unitPrice * qty)}</div>
                                </div>

                                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                    {/* Qty Control */}
                                    <div className="flex items-center gap-0">
                                        <button onClick={() => setQty(q => Math.max(1, q - 1))} className="px-3 py-3 border rounded-l hover:bg-slate-50">-</button>
                                        <div className="w-12 text-center py-3 border-y font-medium">{qty}</div>
                                        <button onClick={() => setQty(q => q + 1)} className="px-3 py-3 border rounded-r hover:bg-slate-50">+</button>
                                    </div>

                                    {/* Buttons */}
                                    <div className="flex flex-col sm:flex-row flex-1 gap-2">
                                        <button
                                            className="bg-emerald-700 hover:bg-emerald-800 text-white flex-1 py-3 rounded-lg font-medium transition-colors"
                                            onClick={() => handleAddToCart(false)}
                                        >
                                            장바구니 담기
                                        </button>
                                        <button
                                            className="border border-slate-300 hover:bg-slate-50 flex-1 py-3 rounded-lg font-medium transition-colors"
                                            onClick={() => handleAddToCart(true)}
                                        >
                                            바로 구매
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Recommended Products */}
                    <div className="mt-12">
                        <h3 className="text-lg font-semibold mb-3">추천 상품</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {recommended.map(p => (
                                <Link to={`/product/${p.id}`} key={p.id} className="block bg-white border rounded p-3 text-center hover:shadow-sm transition-shadow">
                                    <img src={p.main_thumbnail ?? '/src/assets/products/placeholder-thumb.jpg'} alt={p.name} className="h-24 object-contain mx-auto mb-2" />
                                    <div className="text-sm font-medium truncate">{p.title}</div>
                                    <div className="text-xs text-muted-foreground mt-1">{formatPrice(p.price)}</div>
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* Detail Images (Expandable) */}
                    <div className="mt-12">
                        <h2 className="text-xl font-semibold mb-4">상세정보</h2>
                        {detailImages.length > 0 ? (
                            <div className="grid grid-cols-1 gap-0">
                                {!showFullDetails ? (
                                    <div className="relative">
                                        <div className="h-[600px] overflow-hidden bg-white flex items-start justify-center relative">
                                            <img src={detailImages[0]} alt="detail-preview" className="w-full max-w-3xl object-contain" />
                                            <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-white to-transparent" />
                                        </div>
                                        <div className="w-full flex justify-center mt-4 absolute bottom-4">
                                            <button
                                                onClick={() => setShowFullDetails(true)}
                                                className="bg-white border border-emerald-700 text-emerald-700 px-8 py-3 rounded-full shadow-lg flex items-center gap-2 hover:bg-emerald-50 transition-colors"
                                            >
                                                <span className="font-medium">상세정보 더보기</span>
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center">
                                        {detailImages.map((url, idx) => (
                                            <img key={idx} src={url} alt={`detail-${idx}`} className="w-full max-w-3xl block" />
                                        ))}
                                        <div className="w-full flex justify-center mt-8">
                                            <button
                                                onClick={() => setShowFullDetails(false)}
                                                className="bg-white border border-emerald-700 text-emerald-700 px-8 py-3 rounded-full shadow-md flex items-center gap-2 hover:bg-emerald-50"
                                            >
                                                <span className="font-medium">상세정보 접기</span>
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-sm text-muted-foreground p-8 text-center bg-slate-50 rounded">
                                상세 정보 이미지가 없습니다.
                            </div>
                        )}
                    </div>

                    {/* Reviews Section */}
                    <div className="mt-12">
                        <h2 className="text-xl font-semibold mb-4">상품 후기</h2>

                        {/* Review List */}
                        <div className="space-y-4">
                            {reviewsLoading && <div className="bg-white border rounded p-4 text-center">로딩 중...</div>}
                            {!reviewsLoading && reviews.length === 0 && (
                                <div className="bg-white border rounded p-8 text-center text-sm text-muted-foreground">등록된 후기가 없습니다. 첫 번째 후기를 남겨보세요!</div>
                            )}
                            {!reviewsLoading && reviews.map(r => (
                                <div key={r.id} className="bg-white border rounded p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">{r.nickname ?? '익명'}</span>
                                            <span className="text-amber-400">{'★'.repeat(r.rating ?? 5)}</span>
                                        </div>
                                        <div className="text-xs text-muted-foreground">{r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</div>
                                    </div>
                                    <div className="text-sm text-slate-700">{r.content}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Q&A Section */}
                    <div className="mt-12 mb-12">
                        <h2 className="text-xl font-semibold mb-4">상품 문의</h2>
                        <div className="space-y-4">
                            <div className="bg-white border rounded p-4">
                                <div className="text-sm font-medium flex gap-2"><span className="text-emerald-700">Q.</span> 유통기한이 어떻게 되나요?</div>
                                <div className="text-sm text-muted-foreground mt-2 pl-6">A. 포장에 표기되어 있으며, 배송 후 약 7일 권장입니다.</div>
                            </div>
                            <div className="bg-white border rounded p-4">
                                <div className="text-sm font-medium flex gap-2"><span className="text-emerald-700">Q.</span> 신선도 보장되나요?</div>
                                <div className="text-sm text-muted-foreground mt-2 pl-6">A. 네, 엄선된 상품만 발송합니다.</div>
                            </div>
                        </div>
                    </div>

                </div>
            </main>

            <AddToCartDialog open={dialogOpen} setOpen={setDialogOpen} selectedProduct={selectedProduct} />

            {wishToast && (
                <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2">
                    <div className="rounded-xl bg-slate-900/90 backdrop-blur px-5 py-3 text-sm font-semibold text-white shadow-lg">
                        {wishToast}
                    </div>
                </div>
            )}

            <ChatbotButton />
            <Footer />
        </div>
    );
};

export default ProductDetail;