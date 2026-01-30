import { Sparkles, Loader2, Plus } from "lucide-react"; // Loader2 아이콘 추가
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "@/api/axios";
import { useAuth } from "@/lib/AuthContext";

const MEALS = ["아침", "점심", "저녁"];
const periods = ["1일", "3일", "7일"];

// --- Type Definitions ---
export type RecipeInfo = {
  id?: number | null;
  name: string;
  ingredient?: string | null;
  thumbnail?: string | null;
};

export type DailyPlan = {
  day: number;
  meals: Record<string, RecipeInfo>; // key: "아침", "점심", "저녁"
};

export type RecommendationResponse = {
  query: string;
  best_match: RecipeInfo;
  meal_plan: DailyPlan[];
  candidates: RecipeInfo[];
  // [수정 1] 백엔드에서 반환하는 메시지 ID 필드 추가 (Chat.tsx 에러 방지)
  assistant_message_id?: number;
};
// ----------------------------------

const AIMealPlanner = () => {
  const navigate = useNavigate();
  const { user } = useAuth(); // AuthContext에서 유저 정보 가져오기

  const [period, setPeriod] = useState<string>(periods[0]);
  const [meals, setMeals] = useState<string[]>([]);
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [request, setRequest] = useState("");
  const [loading, setLoading] = useState(false);

  // 자동완성 관련 상태
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const suggTimer = useRef<number | null>(null);
  const suggBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // 클릭 외부 영역에서 suggestions 닫기
    function handleClick(e: MouseEvent) {
      if (suggBoxRef.current && !suggBoxRef.current.contains(e.target as Node)) {
        setSuggestions([]);
      }
    }
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // debounced suggestion fetch
  useEffect(() => {
    if (!input || input.trim().length === 0) { setSuggestions([]); return; }
    // clear previous timer
    if (suggTimer.current) window.clearTimeout(suggTimer.current);
    // debounce 300ms
    suggTimer.current = window.setTimeout(async () => {
      setSuggestLoading(true);
      try {
        const q = input.trim();
        // call dedicated ingredients endpoint which returns List[str]
        const res = await apiClient.get<string[]>('/ingredients/', { q, limit: 8 });
        const list = Array.isArray(res) ? res : [];
        // simple filter to ensure match and uniqueness
        const inputLower = q.toLowerCase();
        const filtered = Array.from(new Set(list)).filter(n => n && n.toLowerCase().includes(inputLower));
        setSuggestions(filtered.slice(0, 8));
      } catch (e) {
        console.error('autocomplete error', e);
        setSuggestions([]);
      } finally {
        setSuggestLoading(false);
      }
    }, 300);
    // cleanup when input changes
    return () => { if (suggTimer.current) window.clearTimeout(suggTimer.current); };
  }, [input]);

  function toggle(list: string[], setList: (v: string[]) => void, item: string) {
    if (list.includes(item)) setList(list.filter((i) => i !== item));
    else setList([...list, item]);
  }

  function addIngredient() {
    const v = input.trim();
    if (!v) return;
    if (!ingredients.includes(v)) setIngredients([...ingredients, v]);
    setInput("");
    setSuggestions([]);
  }

  function removeIngredient(i: number) {
    setIngredients(ingredients.filter((_, idx) => idx !== i));
  }

  function onPickSuggestion(s: string) {
    if (!s) return;
    if (!ingredients.includes(s)) setIngredients(prev => [...prev, s]);
    setInput('');
    setSuggestions([]);
  }

  async function onSubmit() {
    setLoading(true);
    try {
      // [수정 2] payload에 member_id 포함 (유저가 없으면 게스트 ID 1 사용)
      const payload = {
        period,
        meals,
        ingredients,
        request,
        member_id: user?.id || 1
      };

      // API 호출
      const res = await apiClient.post<RecommendationResponse>("recommendations/query", payload);

      // 채팅 페이지로 이동
      navigate("/chat", {
        state: {
          period,
          meals,
          ingredients,
          request,
          // axios 설정에 따라 res 자체가 데이터일 수도 있고 res.data일 수도 있습니다.
          // 보통 apiClient interceptor를 쓴다면 res가 데이터입니다.
          recommendation: res,
        },
      });
    } catch (error) {
      console.error("추천 요청 실패:", error);
      alert("식단 추천 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      // [수정 3] 로딩 상태 해제 (성공하든 실패하든 실행)
      setLoading(false);
    }
  }

  return (
      <section className="pt-2 lg:pt-4 pb-8 lg:pb-16" id="ai-recommendation">
        <div className="max-w-4xl mx-auto px-4 lg:px-8">
          <div className="rounded-3xl bg-card border border-border p-6 lg:p-10">
            <div className="flex items-center gap-4 mb-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/20">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="text-xl lg:text-2xl font-semibold">요리 추천</h3>
                <p className="text-sm text-muted-foreground">원하는 기간과 재료, 취향을 골라주세요.</p>
              </div>
            </div>

            {/* Period */}
            <div className="mb-4">
              <label className="text-sm font-medium mb-2 block">기간</label>
              <div className="flex gap-2 flex-wrap">
                {periods.map((p) => (
                    <button
                        key={p}
                        onClick={() => setPeriod(p)}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-shadow ${
                            period === p ? "bg-primary text-primary-foreground shadow" : "bg-muted/20 text-muted-foreground"
                        }`}
                    >
                      {p}
                    </button>
                ))}
              </div>
            </div>

            {/* Meals */}
            <div className="mb-4">
              <label className="text-sm font-medium mb-2 block">끼니</label>
              <div className="flex gap-2 flex-wrap">
                {MEALS.map((m) => (
                    <button
                        key={m}
                        onClick={() => toggle(meals, setMeals, m)}
                        className={`px-4 py-2 rounded-full text-sm ${meals.includes(m) ? "bg-primary text-primary-foreground shadow" : "bg-muted/20 text-muted-foreground"}`}
                    >
                      {m}
                    </button>
                ))}
              </div>
            </div>

            {/* Ingredients */}
            <div className="mb-4">
              <label className="text-sm font-medium mb-2 block">재료 선택</label>
              <div className="flex gap-2 flex-wrap mb-2">
                {ingredients.map((ing, i) => (
                  <div
                    key={ing + i}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm bg-primary text-primary-foreground shadow"
                  >
                    <span className="truncate">{ing}</span>
                    <button
                      onClick={() => removeIngredient(i)}
                      className="text-xs text-primary-foreground/90 ml-2"
                      aria-label={`${ing} 삭제`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addIngredient()}
                    placeholder="예: 알배추, 다진 대파"
                    className="w-full bg-transparent border border-border rounded-full px-4 py-2 outline-none"
                  />

                  {/* suggestions box */}
                  <div ref={suggBoxRef} className="absolute left-0 right-0 mt-2 z-40">
                    {suggestLoading && (
                      <div className="bg-card border border-border rounded p-2 text-sm text-muted-foreground">
                        검색 중...
                      </div>
                    )}
                    {!suggestLoading && suggestions.length > 0 && (
                      <div className="bg-card border border-border rounded shadow max-h-52 overflow-auto">
                        {suggestions.map((s, idx) => (
                          <button
                            key={s + idx}
                            type="button"
                            onClick={() => onPickSuggestion(s)}
                            className="w-full text-left px-3 py-2 hover:bg-muted/10"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* ✅ 모바일: + 아이콘만 / sm 이상: + 추가 */}
                <button
                  onClick={addIngredient}
                  aria-label="재료 추가"
                  className="
                    shrink-0 inline-flex items-center justify-center
                    bg-primary text-primary-foreground rounded-full
                    h-10 w-10 px-0
                    sm:w-auto sm:px-4 sm:py-2
                  "
                >
                  <Plus className="w-5 h-5 sm:mr-2" />
                  <span className="hidden sm:inline">추가</span>
                </button>
              </div>
            </div>

            {/* Request */}
            <div className="mb-4">
              <label className="text-sm font-medium mb-2 block">요청사항</label>
              <textarea
                  value={request}
                  onChange={(e) => setRequest(e.target.value)}
                  placeholder="예: 알레르기(견과류), 맵기 조절 등 요청사항을 입력하세요"
                  rows={3}
                  className="w-full bg-transparent border border-border rounded-lg px-4 py-2 resize-none outline-none"
              />
            </div>

            {/* Bottom CTA */}
            <div className="mt-6 lg:mt-8 flex justify-center">
              <button
                  onClick={onSubmit}
                  disabled={loading}
                  className={`w-full lg:w-auto px-6 py-3 rounded-xl ${loading ? "bg-orange-300 cursor-wait" : "bg-orange-400 hover:bg-orange-500"} text-white font-semibold shadow flex items-center justify-center gap-3`}
              >
                {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" /> 추천 생성중...
                    </>
                ) : (
                    <>
                      <Sparkles className="h-5 w-5" /> AI 추천받기
                    </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Loading Modal */}
        {loading && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/40" />
              <div className="relative z-10 w-[90%] max-w-lg rounded-2xl bg-card border border-border p-6 flex flex-col items-center">
                <div className="mb-4 text-center text-sm text-muted-foreground">추천을 생성 중입니다. 잠시만 기다려주세요.</div>
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              </div>
            </div>
        )}

      </section>
  );
};

export default AIMealPlanner;
