import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Bookmark,
  Clock,
  ArrowUpDown,
  ExternalLink,
  BookmarkCheck,
} from "lucide-react";
import apiClient from "@/api/axios";

type SortKey = "recent" | "title";

// ✅ Recipes.tsx에서 사용한 localStorage 키랑 반드시 동일해야 연동됨
const SAVED_RECIPES_KEY = "savedRecipes";

// 레시피 API 응답 타입 (너가 Recipes.tsx에서 쓰던 형태)
type ApiRecipe = {
  id: number;
  name: string;
  time: string;      // 예: "15분 이내", "60분 이내" 등
  thumbnail: string; // 이미지 URL
};

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

// ✅ savedRecipes 파서: (현재는 number[])만 쓰고 있지만,
// 나중에 {id, savedAt} 형태로 바뀌어도 깨지지 않게 호환 처리
type SavedEntry = { id: number; savedAt?: string };
function readSavedRecipes(): SavedEntry[] {
  const raw = localStorage.getItem(SAVED_RECIPES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);

    // 기존 형태: [1,2,3]
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "number")) {
      return parsed.map((id) => ({ id }));
    }

    // 확장 형태: [{id:1,savedAt:"..."}, ...]
    if (
      Array.isArray(parsed) &&
      parsed.every((v) => v && typeof v === "object" && typeof v.id === "number")
    ) {
      return parsed.map((v) => ({ id: v.id, savedAt: v.savedAt }));
    }

    return [];
  } catch {
    return [];
  }
}

function writeSavedRecipes(entries: SavedEntry[]) {
  localStorage.setItem(SAVED_RECIPES_KEY, JSON.stringify(entries));
}

// "15분 이내" 같은 문자열에서 숫자만 뽑아서 분으로 보여주고 싶을 때 사용
function extractMinutes(timeText?: string): number | null {
  if (!timeText) return null;
  const n = parseInt(String(timeText).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const RecipesPage: React.FC = () => {
  const navigate = useNavigate();

  // ✅ 전체 레시피 목록 (API로 가져옴)
  const [allRecipes, setAllRecipes] = useState<ApiRecipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ✅ 저장 목록 (localStorage 기반)
  const [savedEntries, setSavedEntries] = useState<SavedEntry[]>(readSavedRecipes());

  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");

  // 처음 진입 시 전체 레시피 받아오기 + savedEntries 동기화
  useEffect(() => {
    setSavedEntries(readSavedRecipes());

    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const recipes = await apiClient.get<any[]>('/recipe');
        setAllRecipes(Array.isArray(recipes) ? recipes : []);
      } catch (e: any) {
        console.error(e);
        setLoadError(e?.message || "레시피 조회에 실패했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const savedIdSet = useMemo(() => new Set(savedEntries.map((e) => e.id)), [savedEntries]);

  // ✅ “저장한 레시피” = 전체 레시피 중 saved ids만
  const savedRecipes = useMemo(() => {
    const map = new Map(savedEntries.map((e) => [e.id, e] as const));
    return allRecipes
      .filter((r) => savedIdSet.has(r.id))
      .map((r) => {
        const meta = map.get(r.id);
        return {
          ...r,
          savedAt: meta?.savedAt ? safeDate(meta.savedAt) : null,
        };
      });
  }, [allRecipes, savedEntries, savedIdSet]);

  // ✅ 검색/정렬
  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase();

    let list = savedRecipes.filter((r) => {
      if (!keyword) return true;
      const title = String(r?.name ?? "").toLowerCase();
      const time = String(r?.time ?? "").toLowerCase();
      return title.includes(keyword) || time.includes(keyword);
    });

    list = list.sort((a, b) => {
      if (sortKey === "title") {
        return String(a?.name ?? "").localeCompare(String(b?.name ?? ""), "ko");
      }
      // recent: savedAt 있으면 savedAt 기준, 없으면 id 내림차순
      const ad = a.savedAt?.getTime?.() ?? 0;
      const bd = b.savedAt?.getTime?.() ?? 0;
      if (ad && bd) return bd - ad;
      if (ad && !bd) return -1;
      if (!ad && bd) return 1;
      return (b.id ?? 0) - (a.id ?? 0);
    });

    return list;
  }, [savedRecipes, q, sortKey]);

  const lastSavedText = useMemo(() => {
    const times = savedRecipes
      .map((r) => r.savedAt?.getTime?.() ?? 0)
      .filter((t) => t > 0);
    if (times.length === 0) return null;
    const max = new Date(Math.max(...times));
    return formatYMD(max);
  }, [savedRecipes]);

  const goDetail = (id: number) => {
    navigate(`/recipes/${id}`);
  };

  // ✅ 저장 해제 (localStorage와 state 동기화)
  const unsave = (id: number) => {
    setSavedEntries((prev) => {
      const next = prev.filter((e) => e.id !== id);
      writeSavedRecipes(next);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Bookmark className="h-5 w-5 text-slate-700 dark:text-slate-200" />
              <h2 className="text-lg font-extrabold">저장한 레시피</h2>
              <span className="ml-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                {savedRecipes.length}개
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              저장한 레시피를 모아보고, 검색/정렬로 빠르게 찾아보세요.
              {lastSavedText ? (
                <span className="ml-2 text-xs text-slate-400">· 최근 저장: {lastSavedText}</span>
              ) : null}
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 md:w-[420px]">
            {/* 검색 */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="레시피 제목/시간으로 검색"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-9 py-2 text-sm outline-none focus:border-slate-300 dark:focus:border-slate-700"
              />
            </div>

            {/* 정렬 */}
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2">
                <ArrowUpDown className="h-4 w-4 text-slate-400" />
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="bg-transparent text-sm outline-none"
                >
                  <option value="recent">최근 저장순</option>
                  <option value="title">이름순</option>
                </select>
              </div>

              <button
                onClick={() => navigate("/recipes")}
                className="ml-auto inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 dark:bg-white dark:text-slate-900"
              >
                레시피 탐색 <ExternalLink className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">불러오는 중…</div>
        ) : loadError ? (
          <div className="py-10 text-center text-sm text-red-500">데이터 조회 실패: {loadError}</div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
              <Bookmark className="h-6 w-6 text-slate-600 dark:text-slate-200" />
            </div>
            <div className="text-sm font-semibold">저장된 레시피가 없습니다.</div>
            <div className="mt-1 text-sm text-slate-500">
              마음에 드는 레시피를 저장하면 여기에서 빠르게 확인할 수 있어요.
            </div>
            <button
              onClick={() => navigate("/recipes")}
              className="mt-4 rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:opacity-90 dark:bg-white dark:text-slate-900"
            >
              레시피 보러가기
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((r) => {
              const savedAt = r.savedAt ? safeDate(r.savedAt) : null;
              const timeMin = extractMinutes(r.time);

              return (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => goDetail(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      goDetail(r.id);
                    }
                  }}
                  className="group rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden hover:shadow-sm transition cursor-pointer"
                >
                  {/* 썸네일 */}
                  <div className="relative h-36 bg-slate-100 dark:bg-slate-800">
                    {r?.thumbnail ? (
                      <img
                        src={r.thumbnail}
                        alt={r.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-slate-400 text-sm">
                        이미지 없음
                      </div>
                    )}

                    {/* ✅ 저장 해제 버튼 (썸네일 우측 상단) */}
                    <button
                      type="button"
                      aria-label="저장 해제"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        unsave(r.id);
                      }}
                      className="absolute top-2 right-2 z-10 inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/85 backdrop-blur border border-black/5 shadow-sm hover:bg-white transition"
                    >
                      <BookmarkCheck className="h-5 w-5 text-primary" />
                    </button>
                  </div>

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-base font-extrabold">
                          {r?.name ?? "제목 없음"}
                        </div>
                        <div className="mt-1 text-sm text-slate-500 line-clamp-2">
                          {r?.time ?? ""}
                        </div>
                      </div>
                    </div>

                    {/* 메타 정보 */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {typeof timeMin === "number" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                          <Clock className="h-3.5 w-3.5" /> {timeMin}분
                        </span>
                      ) : null}

                      {/* 난이도 같은 필드가 아직 API에 없어서 자리만 유지 (추후 붙이면 여기 표시 가능) */}
                      {/* <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 ...">
                        <ChefHat className="h-3.5 w-3.5" /> 쉬움
                      </span> */}

                      {savedAt ? (
                        <span className="rounded-full bg-slate-50 dark:bg-slate-800/70 px-2 py-1 text-xs text-slate-500">
                          저장 {formatYMD(savedAt)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecipesPage;
