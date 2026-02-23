import Header from "@/components/layout/Header";
import Navigation from "@/components/layout/Navigation";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useMemo } from "react";
import { Image as ImageIcon } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { fetchCookingTipDetail, CookingTip } from "@/api/cookingtips";

const TipDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const tipId = Number(id);
  const [tip, setTip] = useState<CookingTip | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    if (!tipId) return;
    setLoading(true);
    (async () => {
      try {
        const data = await fetchCookingTipDetail(tipId);
        setTip(data);
      } catch (e) {
        console.error('failed to load tip', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [tipId]);

  // 최근 본 팁 저장
  useEffect(() => {
    if (!tip) return;
    const KEY = 'recentTips';
    try {
      const raw = localStorage.getItem(KEY);
      const arr: number[] = raw ? JSON.parse(raw) : [];
      const next = [tip.id, ...arr.filter((i) => i !== tip.id)].slice(0, 10);
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }, [tip]);

  const onToggleLike = () => {
    setLiked((v) => !v);
    toast({ title: liked ? "좋아요 취소" : "좋아요" });
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

  const detail = useMemo(() => {
    if (!tip) return null;
    return {
      id: tip.id,
      title: tip.title,
      intro: tip.intro_summary,
      thumbnail: tip.main_thumbnail,
      steps: (tip.steps || []).map((s) => ({ id: s.step_number, text: s.content, image: s.url }))
    };
  }, [tip]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Navigation />

      <main className="container mx-auto px-4 lg:px-8 py-6 mb-8">
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-6">로딩 중...</div>
          ) : detail ? (
            <>
              {/* Hero (Recipe 스타일과 통일) */}
              <div className="relative bg-secondary aspect-[16/7] overflow-hidden">
                {detail.thumbnail ? (
                  <img src={detail.thumbnail} alt={detail.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-muted-foreground" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute left-6 bottom-6 text-white">
                  <h1 className="text-3xl font-bold">{detail.title}</h1>
                </div>
              </div>

              <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
                <section className="lg:col-span-2">
                  <h2 className="text-xl font-semibold border-b pb-2">요리팁 설명</h2>
                  <p className="mt-4 text-muted-foreground leading-relaxed whitespace-pre-wrap">{detail.intro}</p>

                  <div className="mt-10">
                    <h3 className="text-lg font-semibold mb-4">순서</h3>
                    <div className="space-y-8">
                      {detail.steps.map((s, idx) => (
                        <div key={idx} className="flex flex-col md:flex-row gap-6 p-4 rounded-xl hover:bg-secondary/20 transition-colors">
                          <div className="w-full md:w-48 h-32 bg-muted rounded-lg overflow-hidden flex-shrink-0 shadow-sm">
                            {s.image ? (
                              <img src={s.image} className="w-full h-full object-cover" alt={`Step ${s.id}`} />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImageIcon /></div>
                            )}
                          </div>
                          <div className="flex gap-4">
                            <span className="text-3xl font-black text-primary/20 italic">{s.id}</span>
                            <p className="text-md pt-1 leading-relaxed">{s.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-12 pt-8 border-t">
                    <div className="flex items-center gap-4">
                      <Button onClick={onToggleLike} variant={liked ? "default" : "outline"} className="gap-2">
                        {liked ? "❤️ 좋아요 취소" : "🤍 좋아요"}
                      </Button>
                      <Button onClick={onToggleBookmark} variant={bookmarked ? "default" : "outline"} className="gap-2">
                        {bookmarked ? "⭐ 찜 해제" : "📁 저장"}
                      </Button>
                      <Button onClick={onShare} variant="ghost">공유하기</Button>
                    </div>
                  </div>

                </section>

                <aside className="space-y-8">
                  <div className="bg-secondary/20 p-6 rounded-xl border border-border sticky top-24">
                    <h4 className="font-bold text-lg mb-4">정보</h4>
                    <div className="text-sm text-muted-foreground">작성일: {tip?.created_at ? new Date(tip.created_at).toLocaleDateString() : '-'}</div>
                    <div className="mt-4">
                      <Button onClick={() => navigate(`/recipes?view=tips`)} variant="outline">목록으로 돌아가기</Button>
                    </div>
                  </div>
                </aside>
              </div>
            </>
          ) : (
            <div className="p-6 text-sm text-muted-foreground">요리팁을 찾을 수 없습니다.</div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default TipDetail;
