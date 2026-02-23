import Header from "@/components/layout/Header";
import Navigation from "@/components/layout/Navigation";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { RotateCw, Clock, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { fetchCookingTipsList, CookingTip } from "@/api/cookingtips";
import ChatbotButton from '@/components/ui/ChatbotButton.tsx';

type RecipeCategory = "조리시간별";
type RecipeSort = "기본" | "최신" | "추천";

type Recipe = {
  id: number;
  name: string;
  time: string;
  thumbnail: string;
  like_count: number;
};

type RecentRecipeEntry = {
  id: number;
  name: string;
  thumbnail: string;
};


const categoryOptions: RecipeCategory[] = ["조리시간별"];
const sortOptions: RecipeSort[] = ["기본", "최신", "추천"];

const RECENT_TIPS_KEY = "recentTips";
const RECENT_RECIPES_KEY = "recentRecipes";

// ✅ 북마크(저장) - 프론트 임시 저장 키 (나중에 DB 붙일 때 API로 교체)
const SAVED_RECIPES_KEY = "savedRecipes";

type SavedEntry = { id: number; savedAt: string };

function readSavedEntries(): SavedEntry[] {
  const raw = localStorage.getItem(SAVED_RECIPES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);

    // 예전 형태(숫자 배열)도 호환: [1,2,3] -> [{id:1,savedAt:now}, ...]
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "number")) {
      const now = new Date().toISOString();
      return parsed.map((id) => ({ id, savedAt: now }));
    }

    // 새 형태: [{id, savedAt}]
    if (
      Array.isArray(parsed) &&
      parsed.every((v) => v && typeof v === "object" && typeof v.id === "number")
    ) {
      return parsed
        .map((v) => ({
          id: Number(v.id),
          savedAt: typeof v.savedAt === "string" ? v.savedAt : new Date().toISOString(),
        }))
        .filter((v) => Number.isFinite(v.id));
    }

    return [];
  } catch {
    return [];
  }
}

function writeSavedEntries(entries: SavedEntry[]) {
  localStorage.setItem(SAVED_RECIPES_KEY, JSON.stringify(entries));
}

function safeParseRecent(value: string | null): number[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "number")) return parsed;
    return [];
  } catch {
    return [];
  }
}

function readRecentRecipes(): RecentRecipeEntry[] {
  const raw = localStorage.getItem(RECENT_RECIPES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v) => v && typeof v === "object")
      .map((v) => ({
        id: Number(v.id),
        name: String(v.name ?? ""),
        thumbnail: String(v.thumbnail ?? ""),
      }))
      .filter((v) => Number.isFinite(v.id));
  } catch {
    return [];
  }
}

function writeRecentRecipes(entries: RecentRecipeEntry[]) {
  localStorage.setItem(RECENT_RECIPES_KEY, JSON.stringify(entries));
}

const Recipes = () => {
  const [viewMode, setViewMode] = useState<"recipes" | "tips">("recipes");
  const [tipSort, setTipSort] = useState<RecipeSort>("최신");
  const [recentTipIds, setRecentTipIds] = useState<number[]>([]);
  const [fetchedTips, setFetchedTips] = useState<CookingTip[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedSubForBox, setSelectedSubForBox] = useState<string | "전체">("전체");
  const [tipPage, setTipPage] = useState(1);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [categoryBoxOpen, setCategoryBoxOpen] = useState(true);
  const [activeCategory, setActiveCategory] = useState<RecipeCategory | "전체">("전체");
  const [activeSort, setActiveSort] = useState<RecipeSort>("기본");
  const [page, setPage] = useState(1);
  const [recentVersion, setRecentVersion] = useState(0);
  const [savedEntries, setSavedEntries] = useState<SavedEntry[]>([]);
  const savedIdSet = useMemo(() => new Set(savedEntries.map((e) => e.id)), [savedEntries]);

  const pageSize = 9;
  const tipPageSize = 9;

  const location = useLocation();

  const [bookmarkToast, setBookmarkToast] = useState<string | null>(null);
  const bookmarkToastTimerRef = useRef<number | null>(null);

  const showBookmarkToast = (msg: string) => {
    setBookmarkToast(msg);
    if (bookmarkToastTimerRef.current) window.clearTimeout(bookmarkToastTimerRef.current);
    bookmarkToastTimerRef.current = window.setTimeout(() => {
      setBookmarkToast(null);
      bookmarkToastTimerRef.current = null;
    }, 2000);
  };

  const openInNewTab = (path: string) => {
    if (typeof window === "undefined") return;
    window.open(path, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    setRecentTipIds(safeParseRecent(localStorage.getItem(RECENT_TIPS_KEY)));
    setSavedEntries(readSavedEntries());

    (async () => {
      setFetchError(null);
      try {
        const resp = await fetchCookingTipsList({ page: 1, size: 1000, sort: tipSort === '최신' ? 'created_desc' : undefined });
        setFetchedTips(resp.items || []);
      } catch (e: any) {
        console.error('failed to fetch cooking tips', e);
        setFetchError(e?.message || String(e));
      }

      const getRecipeList = async () => {
        try {
          // 만약 상세페이지에서 좋아요를 누르고 '업데이트된 리스트'를 보냈다면 그걸 바로 사용
          if (location.state?.recipes) {
            setRecipes(location.state.recipes);
            return; // 서버 호출을 건너뜁니다.
          }

          // 데이터가 없다면 원래대로 서버에서 가져옵니다.
          const res = await fetch(`/api/recipe`);
          if (res.ok) {
            const recipeData: Recipe[] = await res.json();
            setRecipes(recipeData);
          }
        } catch (err) {
          console.error(err);
        }
      };
      getRecipeList();
    })();
  }, [location.state]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const v = params.get("view");
    if (v === "tips") {
      setViewMode("tips");
    } else if (v === "recipes") {
      setViewMode("recipes");
    }
  }, [location.search]);

  const isSaved = (id: number) => savedIdSet.has(id);

  // ✅ 저장 토글 (지금은 localStorage / 추후 DB API로 교체)
  const toggleSavedRecipe = (recipeId: number) => {
    setSavedEntries((prev) => {
      const exists = prev.some((e) => e.id === recipeId);

      const next = exists
        ? prev.filter((e) => e.id !== recipeId)
        : [{ id: recipeId, savedAt: new Date().toISOString() }, ...prev];

      writeSavedEntries(next);
      showBookmarkToast(exists ? "저장 해제했어요" : "레시피를 저장했어요");
      return next;
    });
  };


  const subcategoryMap = useMemo((): Record<RecipeCategory, string[]> => {
    const uniqueTimes = Array.from(new Set(recipes.map(r => r.time))).filter(Boolean);

    // 숫자 크기순으로 정렬
    const sortedTimes = uniqueTimes.sort((a, b) => {
      // 문자열에서 숫자만 추출 (예: "10분" -> 10)
      const numA = parseInt(a.replace(/[^0-9]/g, ""), 10) || 0;
      const numB = parseInt(b.replace(/[^0-9]/g, ""), 10) || 0;

      return numA - numB; // 오름차순 정렬
    });

    return { "조리시간별": sortedTimes };
  }, [recipes]);

  // 필터링 로직
  const filtered = useMemo(() => {
    let list = [...recipes];
    if (activeCategory !== "전체") {
      list = list.filter((r) => {
        if (selectedSubForBox !== "전체") return r.time === selectedSubForBox;
        return true;
      });
    }
    if (activeSort === "최신") list.sort((a, b) => b.id - a.id);
    return list;
  }, [recipes, activeCategory, activeSort, selectedSubForBox]);

  const filteredTips = useMemo(() => {
    // Use fetched tips from backend; fall back to sampleTips if empty
    let list = fetchedTips.length > 0 ? [...fetchedTips] : [...fetchedTips];
    if (tipSort === "최신") list.sort((a, b) => b.id - a.id);
    return list;
  }, [fetchedTips, tipSort]);

  const totalTipCount = filteredTips.length;
  const totalTipPages = Math.max(1, Math.ceil(totalTipCount / tipPageSize));
  const currentTipPage = Math.min(tipPage, totalTipPages);

  const tipPageGroupSize = 5;
  const currentTipGroup = Math.floor((currentTipPage - 1) / tipPageGroupSize);
  const startTipPage = currentTipGroup * tipPageGroupSize + 1;
  const endTipPage = Math.min(startTipPage + tipPageGroupSize - 1, totalTipPages);

  const tipPageNumbers: number[] = [];
  for (let i = startTipPage; i <= endTipPage; i++) {
    tipPageNumbers.push(i);
  }

  const currentTipItems = useMemo(() => {
    const start = (currentTipPage - 1) * tipPageSize;
    return filteredTips.slice(start, start + tipPageSize);
  }, [filteredTips, currentTipPage]);

  // 페이지네이션 계산
  const total = viewMode === "recipes" ? filtered.length : filteredTips.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage]);

  const handleOpenDetail = (recipe: Recipe) => {
    // 1) localStorage 업데이트 (id/name/thumbnail까지 저장)
    const prev = readRecentRecipes();
    const next: RecentRecipeEntry[] = [
      { id: recipe.id, name: recipe.name, thumbnail: recipe.thumbnail, viewedAt: new Date().toISOString() },
      ...prev.filter((x) => x.id !== recipe.id),
    ].slice(0, 10);

    writeRecentRecipes(next);
    setRecentVersion((v) => v + 1); // 최근 목록 UI 갱신

    // 2) 디테일 열기 (너 프로젝트가 새 탭으로 여는 흐름이었으니 유지)
    openInNewTab(`/recipes/${recipe.id}`);
  };

  const handleOpenRecent = (r: { id: number }) => {
    openInNewTab(`/recipes/${r.id}`);
  };


  const onOpenTip = (tip: CookingTip) => {
    const next = [tip.id, ...recentTipIds.filter((id) => id !== tip.id)].slice(0, 10);
    // setRecentTipIds(next);
    // localStorage.setItem(RECENT_TIPS_KEY, JSON.stringify(next));
    // try {
    //   const recentData = JSON.parse(localStorage.getItem("recentRecipes") || "[]");
    //   return recentData
    //     .map((item: any) => ({ id: item.id, name: item.name, thumbnail: item.thumbnail, time: "" }))
    //     .slice(0, 10);
    // } catch {
    //   return [];
    // }
    openInNewTab(`/tips/${tip.id}`);

  };

  const recentRecipes = useMemo(() => {
    return readRecentRecipes().slice(0, 10);
  }, [recentVersion]);


  const PaginationControls: React.FC<{
    page: number;
    setPage: (n: number) => void;
    totalCount: number;
    pageSize: number;
  }> = ({ page, setPage, totalCount, pageSize }) => {
    const totalPagesLocal = Math.max(1, Math.ceil(totalCount / pageSize));
    const pageGroupSize = 5;
    const currentGroupLocal = Math.floor((page - 1) / pageGroupSize);
    const startPage = currentGroupLocal * pageGroupSize + 1;
    const endPage = Math.min(startPage + pageGroupSize - 1, totalPagesLocal);
    const pageNumbers: number[] = [];
    for (let i = startPage; i <= endPage; i++) pageNumbers.push(i);

    const mobilePageNumbers = useMemo(() => {
      const nums = [page - 1, page, page + 1].filter((n) => n >= 1 && n <= totalPagesLocal);
      return Array.from(new Set(nums));
    }, [page, totalPagesLocal]);

    return (
      <div className="flex justify-center items-center gap-2 mt-10 mb-10">
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

          {/* 숫자: 모바일(3개) / sm 이상(기존 그룹 전체) */}
          <div className="flex items-center gap-1 flex-wrap justify-center">
            {/* 모바일 */}
            <div className="flex items-center gap-1 sm:hidden">
              {mobilePageNumbers.map((num) => (
                <Button
                  key={num}
                  variant={page === num ? "default" : "outline"}
                  className="w-9 h-9 p-0"
                  onClick={() => setPage(num)}
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
                  className="w-10 h-10 p-0"
                  onClick={() => setPage(num)}
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
            onClick={() => setPage(Math.min(totalPagesLocal, page + 1))}
            disabled={page === totalPagesLocal}
            className="h-9 w-9 p-0 flex items-center justify-center"
            aria-label="다음 페이지"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          {/* 끝 */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(totalPagesLocal)}
            disabled={page === totalPagesLocal}
            className="h-9 w-9 p-0 flex items-center justify-center"
            aria-label="끝 페이지"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Navigation />

      <main className="container mx-auto px-4 lg:px-8 py-6 mb-8">
        {/* 타이틀 및 뷰 전환 */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-semibold">레시피</h1>
            <div className="mt-1 text-sm text-muted-foreground">원하는 항목을 선택하세요</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className={`px-3 py-1.5 rounded-md text-sm ${viewMode === "recipes" ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
              onClick={() => {
                setViewMode("recipes");
                setCategoryBoxOpen(true);
              }}
            >
              레시피
            </button>
            <button
              className={`px-3 py-1.5 rounded-md text-sm ${viewMode === "tips" ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
              onClick={() => {
                setViewMode("tips");
                setCategoryBoxOpen(false);
              }}
            >
              요리팁
            </button>
          </div>
        </div>

        {/* 필터 박스 */}
        {viewMode === "recipes" && categoryBoxOpen && (
          <div className="mb-6 bg-card border rounded-lg p-4 relative">
            {categoryOptions.map((main) => (
              <div key={main} className="flex items-start gap-4 p-3 border-b last:border-0 sm:flex-row flex-col">
                <div className="w-32 font-medium text-sm">{main}</div>
                <div className="flex-1 flex flex-wrap gap-2">
                  <button onClick={() => setSelectedSubForBox("전체")} className={`px-2 py-1 text-sm rounded border ${selectedSubForBox === "전체" ? "bg-primary text-white" : ""}`}>전체</button>
                  {subcategoryMap[main].map(sub => (
                    <button key={sub} onClick={() => { setActiveCategory(main); setSelectedSubForBox(sub); }} className={`px-2 py-1 text-sm rounded border ${selectedSubForBox === sub ? "bg-primary text-white" : ""}`}>{sub}</button>
                  ))}
                </div>
              </div>
            ))}
            <button className="absolute top-3 right-3" onClick={() => { setActiveCategory("전체"); setSelectedSubForBox("전체"); }}><RotateCw className="h-4 w-4" /></button>
          </div>
        )}

        {viewMode === "recipes" && (
          <Button className="w-full mb-4" onClick={() => setCategoryBoxOpen(!categoryBoxOpen)}>
            {categoryBoxOpen ? "카테고리 접기" : "카테고리 열기"}
          </Button>
        )}

        {/* 메인 리스트 영역 */}
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          {viewMode === "recipes" ? (
            <>
              <div className="p-4 sm:p-5 border-b border-border">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="text-sm text-muted-foreground">
                    총 <span className="text-foreground font-medium">{total}</span>개의 맛있는 레시피가 있습니다
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-sm text-muted-foreground mr-1"></div>
                    {sortOptions.map((s) => (
                      <button
                        key={s}
                        onClick={() => setActiveSort(s)}
                        className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${activeSort === s
                          ? "bg-secondary text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground"
                          }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {pageItems.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => handleOpenDetail(r)}
                      className="border rounded-md overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                    >
                      <div className="aspect-video relative">
                        <img src={r.thumbnail} alt={r.name} className="w-full h-full object-cover" />

                        {/* ✅ 북마크 버튼: 카드 이미지 우측 상단 */}
                        <button
                          type="button"
                          aria-label={isSaved(r.id) ? "저장 취소" : "레시피 저장"}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleSavedRecipe(r.id);
                          }}
                          className="absolute top-2 right-2 z-10 inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/85 backdrop-blur border border-black/5 shadow-sm hover:bg-white transition"
                        >
                          {isSaved(r.id) ? (
                            <BookmarkCheck className="h-5 w-5 text-primary" />
                          ) : (
                            <Bookmark className="h-5 w-5 text-foreground/70" />
                          )}
                        </button>
                      </div>

                      <div className="p-4">
                        <h3 className="font-bold mt-1 line-clamp-1">{r.name}</h3>
                        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {r.time}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 flex items-center justify-center gap-1">
                  <PaginationControls page={page} setPage={setPage} totalCount={total} pageSize={pageSize} />
                </div>
              </div>
            </>
          ) : (
            // Tips view
            <>
              <div className="p-4 sm:p-5 border-b border-border">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="text-sm text-muted-foreground">총 <span className="text-foreground font-medium">{filteredTips.length}</span>개의 꼼꼼한 요리팁이 있습니다</div>

                  <div className="flex items-center gap-2">
                    <div className="text-sm text-muted-foreground mr-1"></div>
                    {sortOptions.map((s) => (
                      <button
                        key={s}
                        onClick={() => setTipSort(s)}
                        className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${tipSort === s
                          ? "bg-secondary text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground"
                          }`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {fetchError ? <div className="p-4 text-sm text-red-500">데이터 조회 실패: {fetchError}</div> : null}

              <div className="p-4 sm:p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {currentTipItems.map((t) => (
                    <div
                      key={t.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpenTip(t)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpenTip(t);
                        }
                      }}
                      className="bg-card rounded-md border border-border overflow-hidden shadow-card cursor-pointer"
                    >
                      <div className="relative bg-secondary aspect-[4/3] overflow-hidden flex items-center justify-center">
                        {t.main_thumbnail ? (
                          <img src={t.main_thumbnail} alt={t.title} className="w-full h-full object-contain object-center" />
                        ) : (
                          <div className="w-full h-full bg-muted-foreground" />
                        )}
                      </div>

                      <div className="p-4">
                        <h3 className="mt-1 text-xl font-bold text-foreground line-clamp-2">{t.title}</h3>
                        <div className="mt-2 text-base text-foreground leading-relaxed line-clamp-3">{t.intro_summary}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <PaginationControls page={tipPage} setPage={setTipPage} totalCount={totalTipCount} pageSize={tipPageSize} />
              </div>
            </>
          )}
        </div>

        <section className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">최근 본 레시피</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                localStorage.removeItem(RECENT_RECIPES_KEY);
                setRecentVersion((v) => v + 1);
              }}
            >
              전체 삭제
            </Button>

          </div>

          {recentRecipes.length === 0 ? (
            <div className="text-sm text-muted-foreground">최근 본 항목이 없습니다.</div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {recentRecipes.slice(0, 4).map((r) => (
                <div key={r.id} onClick={() => handleOpenRecent(r)} className="border rounded-md overflow-hidden cursor-pointer">
                  <div className="relative">
                    <img src={r.thumbnail} alt="" className="aspect-video object-cover w-full" />

                    {/* ✅ 최근 본 카드에도 북마크(작게) */}
                    <button
                      type="button"
                      aria-label={isSaved(r.id) ? "저장 취소" : "레시피 저장"}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleSavedRecipe(r.id);
                      }}
                      className="absolute top-2 right-2 z-10 inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/85 backdrop-blur border border-black/5 shadow-sm hover:bg-white transition"
                    >
                      {isSaved(r.id) ? (
                        <BookmarkCheck className="h-4 w-4 text-primary" />
                      ) : (
                        <Bookmark className="h-4 w-4 text-foreground/70" />
                      )}
                    </button>
                  </div>

                  <div className="p-2 text-sm font-medium line-clamp-1">{r.name}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      <ChatbotButton />
      {bookmarkToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg dark:bg-white dark:text-slate-900">
            {bookmarkToast}
          </div>
        </div>
      )}
      <Footer />
    </div>
  );
};

export default Recipes;
