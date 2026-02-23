import { useLocation, useNavigate, Link } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useCartStore } from "@/lib/cartStore";
import apiClient from "@/api/axios";
import { ArrowLeft, Trash, MessageSquare, ChefHat, Send, Loader2, ShoppingCart, CreditCard, Menu, X, Home } from "lucide-react";
import { DailyPlan, BackendCartItem, ChatResponse, Message, Thread, NavState } from "@/api/chat";

const STORAGE_KEY = "resiply_chat_threads";

// ------------------------------------
// 1) Sub-Component: 식단표 모바일=카드 / 데스크톱=테이블)
// ------------------------------------
const MealPlanTable = ({ plans, planKind }: { plans: DailyPlan[]; planKind?: "current" | "preview" }) => {
  const mealTypesSet = new Set<string>();
  plans.forEach((p) => Object.keys(p.meals).forEach((k) => mealTypesSet.add(k)));

  const sortOrder: Record<string, number> = { 아침: 1, 점심: 2, 저녁: 3 };
  const columns = Array.from(mealTypesSet).sort((a, b) => (sortOrder[a] || 99) - (sortOrder[b] || 99));

  const formatDateLabel = (dateStr?: string | null) => {
    if (!dateStr) return "";
    return dateStr.replace(/-/g, "/");
  };

  const MobileCards = () => (
    <div className="w-full max-w-full min-w-0 mt-3 space-y-4 lg:hidden">
      {plans.map((daily) => {
        const dayLabel =
          planKind === "preview" && daily.date_str
            ? formatDateLabel(daily.date_str)
            : `${daily.day}일차`;

        return (
          <div
            key={daily.date_str || daily.day}
            className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden"
          >
            {/* Day Header */}
            <div className="px-4 py-3 bg-muted/50 border-b border-border flex items-center justify-between">
              <div className="font-bold text-primary">{dayLabel}</div>
              <div className="text-xs text-muted-foreground">
                {columns.length > 0 ? `${columns.length}끼니` : ""}
              </div>
            </div>

            {/* Meals */}
            <div className="p-4 space-y-3">
              {columns.map((mealType) => {
                const recipe = daily.meals[mealType];

                if (!recipe) {
                  return (
                    <div
                      key={mealType}
                      className="rounded-xl border border-dashed border-border bg-muted/20 p-4"
                    >
                      <div className="text-xs font-semibold text-muted-foreground mb-1">
                        {mealType}
                      </div>
                      <div className="text-sm text-muted-foreground/60">
                        추천 없음
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={mealType}
                    className="rounded-xl border border-border bg-background p-3 flex gap-3"
                  >
                    {/* thumbnail */}
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted border border-border flex-shrink-0">
                      <img
                        src={recipe.thumbnail || ""}
                        alt={recipe.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          console.error("MealPlan image load error", {
                            src: (e.currentTarget as HTMLImageElement).src,
                            recipe,
                          });
                        }}
                      />
                    </div>

                    {/* content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-muted-foreground shrink-0">
                          {mealType}
                        </span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-sm font-bold text-foreground truncate">
                          {recipe.name}
                        </span>
                      </div>

                      <div className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {recipe.ingredient || "재료 정보 없음"}
                      </div>

                      <div className="mt-2">
                        {recipe.id ? (
                          <Link
                            to={`/recipes/${recipe.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-xs font-semibold text-primary hover:underline"
                          >
                            레시피 보기 &rarr;
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            상세 정보 없음
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  const DesktopTable = () => (
    <div className="hidden lg:block overflow-x-auto rounded-xl border border-border shadow-sm bg-card w-full max-w-full mt-3">
      <table className="w-full text-sm text-left border-collapse table-fixed min-w-[600px]">
        <thead className="bg-muted text-muted-foreground uppercase text-xs">
          <tr>
            <th className="px-4 py-3 font-medium border-b border-border w-[100px] text-center whitespace-nowrap">
              Day
            </th>
            {columns.map((meal) => (
              <th key={meal} className="px-4 py-3 font-medium border-b border-border">
                {meal}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-border">
          {plans.map((daily) => (
            <tr
              key={daily.date_str || daily.day}
              className="bg-card hover:bg-muted/30 transition-colors"
            >
              <td className="px-4 py-4 font-bold text-center text-primary whitespace-nowrap align-top pt-10">
                {planKind === "preview" && daily.date_str
                  ? formatDateLabel(daily.date_str)
                  : `${daily.day}일차`}
              </td>

              {columns.map((mealType) => {
                const recipe = daily.meals[mealType];
                return (
                  <td key={mealType} className="px-3 py-4 align-top">
                    {recipe ? (
                      <div className="flex flex-col gap-3 h-full">
                        <div className="relative w-full h-40 rounded-lg overflow-hidden bg-muted border border-border shrink-0">
                          <img
                            src={recipe.thumbnail || ""}
                            alt={recipe.name}
                            className="w-full h-full object-cover"
                            onError={(e) => { console.error("MealPlan image load error", { src: (e.currentTarget as HTMLImageElement).src, recipe }); }}
                          />
                        </div>
                        <div className="flex flex-col flex-1 min-h-[100px]">
                          <div className="font-bold text-base text-foreground line-clamp-1 mb-1" title={recipe.name}>
                            {recipe.name}
                          </div>
                          <div className="text-xs text-muted-foreground line-clamp-2 h-9 mb-3 leading-relaxed">
                            {recipe.ingredient || "재료 정보 없음"}
                          </div>
                          <div className="mt-auto">
                            {recipe.id ? (
                              <Link
                                to={`/recipes/${recipe.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-primary font-semibold hover:underline inline-flex items-center gap-1"
                              >
                                레시피 보기 &rarr;
                              </Link>
                            ) : (
                              <span className="text-xs text-muted-foreground">상세 정보 없음</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-40 flex items-center justify-center bg-muted/20 rounded-lg text-muted-foreground/30 text-lg font-light border border-dashed border-border">
                        -
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <>
      <MobileCards />
      <DesktopTable />
    </>
  );
};


// ------------------------------------
// 2) Sub-Component: 장바구니 결과 테이블
// ------------------------------------
const CartItemTable = ({ items, onCheckout }: { items: BackendCartItem[]; onCheckout: (items: BackendCartItem[]) => void; }) => {
  if (!items || items.length === 0) return null;

  const totalPrice = items.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);

  return (
    <div className="mt-3 w-full max-w-md bg-card rounded-xl border border-border overflow-hidden shadow-sm">
      <div className="bg-muted px-4 py-3 border-b border-border flex justify-between items-center">
        <span className="font-bold text-sm text-foreground">장바구니 추가 내역</span>
        <span className="text-xs text-muted-foreground bg-background px-2 py-1 rounded-full border border-border">
          총 {items.length}개
        </span>
      </div>

      <div className="max-h-[300px] overflow-y-auto divide-y divide-border">
        {items.map((item, idx) => (
          <div key={`${item.id}-${idx}`} className="flex items-center gap-3 p-3 hover:bg-muted/20">
            <div className="w-12 h-12 rounded-md bg-muted overflow-hidden flex-shrink-0 border border-border">
              <img
                src={item.imageUrl || ""}
                alt={item.title}
                className="w-full h-full object-cover"
                onError={(e) => { console.error("Cart item image load error", { src: (e.currentTarget as HTMLImageElement).src, item, }); }}
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">{item.title}</div>
              <div className="text-xs text-muted-foreground">
                {item.price.toLocaleString()}원 × {item.quantity || 1}
              </div>
            </div>

            <div className="text-sm font-bold text-primary">
              {(item.price * (item.quantity || 1)).toLocaleString()}원
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-muted/50 border-t border-border flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">총 합계</span>
          <span className="text-lg font-bold text-primary">{totalPrice.toLocaleString()}원</span>
        </div>

        <div className="flex gap-2">
          <Link
            to="/cart"
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium bg-white border border-border text-foreground hover:bg-muted transition-colors"
          >
            <ShoppingCart className="w-4 h-4" />
            장바구니 이동
          </Link>

          <button
            onClick={() => onCheckout(items)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <CreditCard className="w-4 h-4" />
            바로 구매하기
          </button>
        </div>
      </div>
    </div>
  );
};

// ------------------------------------
// 3) Main Component: Chat
// ------------------------------------
const Chat = () => {
  const { state } = useLocation();
  const navState = (state as NavState | null) ?? null;
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const cartStore = useCartStore();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sidebarExpanded, setSidebarExpanded] = useState(true); // 데스크톱
  const [drawerOpen, setDrawerOpen] = useState(false); // 모바일
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const scroller = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const aiAddedMapRef = useRef<Record<string, Record<string, "active" | "dormant">>>({});

  const activeTitle = useMemo(() => {
    const t = threads.find((x) => x.id === currentThreadId);
    return (t?.title || "Resiply") + "";
  }, [threads, currentThreadId]);

  // 모바일에서 드로어 열리면 배경 스크롤 방지
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  // 1) 초기 로드
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Thread[];
        const sanitized = parsed.map((t) => ({
          ...t,
          title: typeof t.title === "string" && t.title.endsWith("...") ? t.title.slice(0, -3) : t.title,
        }));
        setThreads(sanitized);

        if (parsed.length > 0 && !navState) {
          setCurrentThreadId(sanitized[0].id);
          setMessages(sanitized[0].messages);
        } else if (parsed.length === 0 && !navState) {
          createNewThread();
        }
      } else if (!navState) {
        createNewThread();
      }
    } catch (e) {
      console.error("Failed to load threads", e);
      if (!navState) createNewThread();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1-1) 서버 로그 로드 + 병합
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    let mounted = true;

    (async () => {
      try {
        const res = await apiClient.get<any>("/recommendations/chat/logs", { member_id: user.id });

        const serverThreads = (res?.threads || []).map((t: any) => ({
          id: `srv-${t.id}`,
          chatLogId: t.id,
          title: t.title || `채팅 ${t.id}`,
          messages: (t.messages || []).map((m: any) => ({
            role: m.role,
            text: m.content,
            assistant_message_id: m.role === "assistant" ? m.id : undefined,
          })),
        }));

        if (!mounted) return;

        setThreads((prev) => {
          // [핵심 1] 로컬에서 삭제했던 ID 목록(Blacklist)을 가져옴
          const deletedIds = new Set(JSON.parse(localStorage.getItem("resiply_deleted_ids") || "[]"));
          const mergedMap = new Map<string, Thread>();

          // [핵심 2] 서버 데이터 중 삭제된 적 없는 것만 Map에 추가
          serverThreads.forEach((t: Thread) => {
            if (!deletedIds.has(t.id)) mergedMap.set(t.id, t);
          });

          // [핵심 3] 로컬 데이터 병합 (중복 방지)
          prev.forEach((t) => {
            // 삭제된 ID가 아니고, 이미 Map에 없다면 추가
            if (!deletedIds.has(t.id) && !mergedMap.has(t.id)) mergedMap.set(t.id, t);
          });

          const merged = Array.from(mergedMap.values()).sort((a: any, b: any) => {
            const idA = String(a.id).replace(/\D/g, "");
            const idB = String(b.id).replace(/\D/g, "");
            return Number(idB) - Number(idA);
          });

          saveThreads(merged);
          return merged;
        });
      } catch (err) {
        console.error("Failed to load server chat logs", err);
      }
    })();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id]);

  // 2) 외부 데이터 수신(navState)
  useEffect(() => {
    if (!navState) return;

    if (navState.newChat) {
      createNewThread();
      navigate(location.pathname, { replace: true, state: null });
      return;
    }

    const { period, ingredients, meals, request, recommendation } = navState;
    const userText = `[요리 추천 요청]\n기간: ${period}\n끼니: ${meals?.join(", ") || "없음"}\n재료: ${ingredients?.join(", ") || "없음"}\n요청사항: ${request || "없음"}`;

    const initialMessages: Message[] = [{ role: "user", text: userText }];

    if (recommendation?.meal_plan?.length > 0) {
      initialMessages.push({
        role: "assistant",
        text: `${period} 동안의 맞춤형 식단표입니다. 식재료 구매를 도와드릴까요?`,
        plan: recommendation.meal_plan,
        planKind: "current",
        assistant_message_id: recommendation.assistant_message_id,
      });
    } else if (recommendation?.best_match) {
      initialMessages.push({
        role: "assistant",
        text: `"${recommendation.best_match.name}" 요리를 추천해 드립니다.`,
        recipe: recommendation.best_match,
      });
    } else {
      initialMessages.push({
        role: "assistant",
        text: "조건에 맞는 레시피를 찾지 못했습니다. 다른 재료로 다시 시도해 보시겠어요?",
      });
    }

    const newThreadId = String(Date.now());
    const newThread: Thread = {
      id: newThreadId,
      title: recommendation?.best_match?.name || `${period} 식단 추천`,
      messages: initialMessages,
    };

    setThreads((prev) => {
      const next = [newThread, ...prev];
      saveThreads(next);
      return next;
    });

    setCurrentThreadId(newThreadId);
    setMessages(initialMessages);

    const timer = setTimeout(() => {
      navigate(location.pathname, { replace: true, state: null });
    }, 100);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navState]);

  useEffect(() => {
    scroller.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!loading) {
      inputRef.current?.focus();
    }
  }, [loading]);

  // --- Helpers ---
  function saveThreads(next: Thread[]) {
    setThreads(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function createNewThread() {
    const id = String(Date.now());
    const newThread: Thread = {
      id,
      title: "새 채팅",
      messages: [{ role: "assistant", text: "안녕하세요! 어떤 요리를 도와드릴까요?" }],
    };

    setThreads((prev) => {
      const next = [newThread, ...prev];
      saveThreads(next);
      return next;
    });

    setCurrentThreadId(id);
    setMessages(newThread.messages);
    return id;
  }

  function appendToThread(threadId: string | null, msg: Message, options?: { chatLogId?: number }) {
    if (!threadId) return;

    setThreads((prevThreads) => {
      const nextThreads = prevThreads.map((t) => {
        if (t.id !== threadId) return t;
        const msgs = [...t.messages, msg];
        const title =
          t.title === "새 채팅" && msg.role === "user" && msg.text
            ? msg.text.length > 20
              ? msg.text.slice(0, 20)
              : msg.text
            : t.title;
        const nextThread: Thread = { ...t, messages: msgs, title };
        if (typeof options?.chatLogId === "number") {
          nextThread.chatLogId = options.chatLogId;
        }
        return nextThread;
      });
      saveThreads(nextThreads);
      return nextThreads;
    });

    if (threadId === currentThreadId) {
      setMessages((prev) => [...prev, msg]);
    }
  }

  function selectThread(id: string) {
    const thread = threads.find((t) => t.id === id);
    if (!thread) return;
    setCurrentThreadId(id);
    setMessages(thread.messages);
    setDrawerOpen(false);
  }

  function deleteThread(id: string) {
    const next = threads.filter((t) => t.id !== id);
    saveThreads(next);

    try {
      const deletedRaw = localStorage.getItem("resiply_deleted_ids");
      const deletedIds = deletedRaw ? JSON.parse(deletedRaw) : [];
      if (!deletedIds.includes(id)) {
        deletedIds.push(id);
        localStorage.setItem("resiply_deleted_ids", JSON.stringify(deletedIds));
      }
    } catch (e) {
      console.error("Failed to save deleted ID", e);
    }

    if (currentThreadId === id) {
      if (next.length > 0) {
        setCurrentThreadId(next[0].id);
        setMessages(next[0].messages);
      } else {
        createNewThread();
      }
    }
  }

  // --- Checkout ---
  async function performCheckout(specificItems?: BackendCartItem[]) {
    if (!currentThreadId) return;

    if (!isAuthenticated) {
      appendToThread(currentThreadId, { role: "assistant", text: "결제를 진행하려면 로그인이 필요합니다." });
      navigate("/login");
      return;
    }

    let itemsToBuy: any[] = [];

    if (specificItems && specificItems.length > 0) {
      itemsToBuy = specificItems.map((item) => ({
        id: item.id,
        title: item.title,
        price: item.price,
        imageUrl: item.imageUrl,
        quantity: item.quantity || 1,
      }));
    } else {
      const cartItems = cartStore.items;
      const aiMap = aiAddedMapRef.current[currentThreadId];
      const aiSelectedItems = aiMap ? cartItems.filter((it) => aiMap[it.id] === "active") : [];
      itemsToBuy = aiSelectedItems.length > 0 ? aiSelectedItems : cartStore.getSelectedItems();
    }

    if (itemsToBuy.length === 0) {
      appendToThread(currentThreadId, { role: "assistant", text: "결제할 상품이 없습니다. 장바구니를 확인해주세요." });
      return;
    }

    const productAmount = itemsToBuy.reduce((sum, i) => sum + (i.price || 0) * i.quantity, 0);
    const SHIPPING_FEE = 3000;
    const FREE_SHIPPING_THRESHOLD = 30000;
    const shippingFee = productAmount >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
    const payAmount = Math.max(0, productAmount + shippingFee);

    const orderId = `ORD-${Date.now()}`;
    const order = {
      id: orderId,
      date: new Date().toISOString(),
      items: itemsToBuy,
      productAmount,
      shippingFee,
      payAmount,
      address: "(간편결제)",
      request: "",
      paymentMethod: "챗봇 자동결제",
    };

    try {
      const raw = localStorage.getItem("orders");
      const arr = raw ? JSON.parse(raw) : [];
      arr.unshift(order);
      localStorage.setItem("orders", JSON.stringify(arr));
    } catch {
      // ignore
    }

    const cartState = useCartStore.getState();

    for (const itemToBuy of itemsToBuy) {
      const globalItem = cartState.items.find((i) => i.id === itemToBuy.id);
      if (!globalItem) continue;

      const remainingQty = globalItem.quantity - itemToBuy.quantity;
      if (remainingQty > 0) {
        cartState.setQuantity(itemToBuy.id, remainingQty);
      } else {
        cartState.removeItem(itemToBuy.id);
        if (currentThreadId && aiAddedMapRef.current[currentThreadId]) {
          delete aiAddedMapRef.current[currentThreadId][itemToBuy.id];
        }
      }
    }

    const receiptLines = [
      `주문번호: ${orderId}`,
      ...itemsToBuy.map((it) => `- ${it.title} x${it.quantity}`),
      `총 결제금액: ${payAmount.toLocaleString()}원`,
    ];
    appendToThread(currentThreadId, { role: "assistant", text: `결제가 완료되었습니다.\n\n${receiptLines.join("\n")}` });
    navigate(`/order/${orderId}`);
  }

  // --- Send ---
  async function send(manualText?: string) {
    const v = manualText || input.trim();
    if (!v || !currentThreadId || loading) return;

    const threadMeta = threads.find((t) => t.id === currentThreadId);
    const backendChatLogId = threadMeta?.chatLogId;

    if (!user?.id) {
      appendToThread(currentThreadId, { role: "assistant", text: "채팅을 이용하려면 로그인해 주세요." });
      navigate("/login");
      return;
    }

    const userMsg: Message = { role: "user", text: v };
    appendToThread(currentThreadId, userMsg);
    setInput("");
    inputRef.current?.focus();

    const cancelPaymentRegex = /(아니요|아니오|취소|취소할게|괜찮아|아니)/;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (lastAssistant?.text?.includes("결제를 진행할까요") && cancelPaymentRegex.test(v)) {
      appendToThread(currentThreadId, { role: "assistant", text: "결제를 취소했습니다. 장바구니 내역은 유지됩니다." });
      if (aiAddedMapRef.current[currentThreadId]) {
        Object.keys(aiAddedMapRef.current[currentThreadId]).forEach((k) => {
          if (aiAddedMapRef.current[currentThreadId][k] === "active") aiAddedMapRef.current[currentThreadId][k] = "dormant";
        });
      }
      return;
    }

    setLoading(true);
    try {
      const lastPlanMessage = [...messages, userMsg]
        .reverse()
        .find((m) => m.plan && m.plan.length > 0 && m.planKind !== "preview");

      const currentPlan = lastPlanMessage?.plan || [];
      const isNewThread = !backendChatLogId;

      const res = await apiClient.post<ChatResponse>("/recommendations/chat", {
        member_id: user.id,
        user_message: v,
        current_plan: currentPlan,
        new_chat: isNewThread,
        chat_log_id: backendChatLogId,
        plan_message_id: lastPlanMessage?.assistant_message_id,
      });

      const resolvedChatLogId = res.chat_log_id ?? backendChatLogId;

      const aiMsg: Message = { role: "assistant", text: res.message };

      if (res.response_type === "plan_update" && res.updated_plan) {
        aiMsg.plan = res.updated_plan;
        aiMsg.planKind = res.plan_kind || "current";
        if ((res as any).assistant_message_id) aiMsg.assistant_message_id = (res as any).assistant_message_id;
      } else if (res.response_type === "calendar_conflict" && res.updated_plan) {
        aiMsg.plan = res.updated_plan;
        aiMsg.planKind = "preview";
      } else if (res.response_type === "cart_add" && res.cart_items) {
        res.cart_items.forEach((item) => {
          cartStore.addItem(
            { id: item.id, title: item.title, price: item.price, imageUrl: item.imageUrl || "" },
            item.quantity || 1
          );
          if (!aiAddedMapRef.current[currentThreadId]) aiAddedMapRef.current[currentThreadId] = {};
          aiAddedMapRef.current[currentThreadId][item.id] = "active";
        });
        aiMsg.cartItems = res.cart_items;
      }

      appendToThread(currentThreadId, aiMsg, { chatLogId: resolvedChatLogId });
    } catch (err) {
      console.error("Chat API Error:", err);
      appendToThread(currentThreadId, { role: "assistant", text: "죄송합니다. 오류가 발생하여 답변을 드릴 수 없습니다." });
    } finally {
      setLoading(false);
    }
  }

  // ------------------------------------
  // Render
  // ------------------------------------
  return (
    <div className="flex h-[100dvh] bg-background overflow-hidden">
      {/* 모바일 오버레이 */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          "bg-card border-r border-border flex flex-col",
          "fixed inset-y-0 left-0 z-40 w-[86vw] max-w-xs transform transition-transform duration-200 lg:static lg:translate-x-0",
          drawerOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          sidebarExpanded ? "lg:w-72" : "lg:w-16",
        ].join(" ")}
      >
        <div className="h-14 lg:h-16 flex items-center justify-between px-4 border-b border-border">
          <div
            className={`font-bold text-lg lg:text-xl cursor-pointer flex items-center gap-1 ${
              !sidebarExpanded && "lg:hidden"
            }`}
            onClick={() => {
              setDrawerOpen(false);
              navigate("/");
            }}
          >
            Resiply<span className="text-primary">+</span>
          </div>

          <button
            onClick={() => {
              if (window.matchMedia("(min-width: 1024px)").matches) setSidebarExpanded((v) => !v);
              else setDrawerOpen(false);
            }}
            className="p-2 hover:bg-muted rounded-full transition-colors"
            aria-label="사이드바 토글"
          >
            <span className="lg:hidden">
              <X className="w-5 h-5" />
            </span>
            <span className="hidden lg:inline">
              <ArrowLeft className={`w-5 h-5 transition-transform ${!sidebarExpanded && "rotate-180"}`} />
            </span>
          </button>
        </div>

        <div className="p-4">
          <button
            onClick={() => {
              createNewThread();
              setDrawerOpen(false);
            }}
            className={`flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-xl transition-all shadow-sm ${
              sidebarExpanded ? "w-full px-4" : "lg:w-10 lg:h-10 lg:px-0 lg:rounded-full"
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            {sidebarExpanded && <span className="font-medium">새 채팅</span>}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-1 custom-scrollbar">
          {threads.map((t) => (
            <div
              key={t.id}
              onClick={() => selectThread(t.id)}
              className={`group flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer transition-colors ${
                t.id === currentThreadId
                  ? "bg-muted text-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center">
                <ChefHat className="w-4 h-4 text-primary" />
              </div>

              {sidebarExpanded && (
                <>
                  <span className="truncate text-sm flex-1">{t.title || "새 채팅"}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteThread(t.id);
                    }}
                    className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-1.5 hover:bg-background rounded-md text-muted-foreground hover:text-destructive transition-all"
                    aria-label="채팅 삭제"
                  >
                    <Trash className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col h-full relative">
        {/* 모바일 상단바 */}
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur lg:hidden">
          <div className="h-14 px-3 flex items-center gap-2">
            <button
              onClick={() => setDrawerOpen(true)}
              className="p-2 rounded-full hover:bg-muted"
              aria-label="채팅 목록 열기"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex-1 min-w-0 text-center">
              <div className="text-sm font-semibold truncate">{activeTitle}</div>
            </div>

            {/* 홈 버튼 */}
            <button
              onClick={() => navigate("/")}
              className="p-2 rounded-full hover:bg-muted"
              aria-label="홈으로 이동"
              title="홈"
            >
              <Home className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Messages (모바일 여백 적용) */}
        <div className="flex-1 overflow-y-auto px-4 py-3 sm:p-4 lg:p-8 space-y-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {messages.map((m, idx) => {
              const hasStructuredContent = Boolean(m.plan || m.cartItems);
              return (
                <div key={idx} className={`flex gap-3 sm:gap-4 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                {/* Avatar */}
                <div
                  className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${
                    m.role === "assistant" ? "bg-white border border-border" : "bg-primary"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <ChefHat className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                  ) : (
                    <span className="text-white text-xs sm:text-sm font-bold">나</span>
                  )}
                </div>

                {/* Bubble Wrapper */}
                <div
                  className={`flex flex-col ${
                    hasStructuredContent
                      ? "w-full min-w-0 max-w-[86%] sm:max-w-[90%] lg:max-w-full"
                      : "max-w-[86%] sm:max-w-[90%] lg:max-w-[85%]"
                  } space-y-2 ${m.role === "user" ? "items-end" : "items-start"}`}
                >
                  {/* Text */}
                  {m.text && (
                    <div
                      className={`px-4 py-3 sm:px-5 sm:py-3.5 rounded-2xl whitespace-pre-wrap leading-relaxed shadow-sm ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-none"
                          : "bg-card border border-border text-card-foreground rounded-tl-none"
                      }`}
                    >
                      {m.text}
                    </div>
                  )}

                  {/* 결제 버튼 */}
                  {m.role === "assistant" &&
                    m.text &&
                    (m.text.includes("결제를 진행할까요") || m.text.includes("결제할까요")) &&
                    !m.cartItems && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        <button
                          onClick={() => {
                            appendToThread(currentThreadId, { role: "user", text: "결제해줘" });
                            performCheckout();
                          }}
                          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90"
                        >
                          <CreditCard className="w-4 h-4" /> 결제하기
                        </button>

                        <button
                          onClick={() => {
                            appendToThread(currentThreadId, { role: "user", text: "아니요" });
                            appendToThread(currentThreadId, { role: "assistant", text: "결제를 취소했습니다." });
                          }}
                          className="px-4 py-2 rounded-lg text-sm border border-border bg-card hover:bg-muted"
                        >
                          취소
                        </button>
                      </div>
                    )}

                  {/* Single Recipe Card */}
                  {m.recipe && !m.plan && (
                    <div className="w-full max-w-sm bg-card border border-border rounded-xl overflow-hidden shadow-sm mt-1 group hover:shadow-md transition-shadow">
                      <div className="relative h-48 bg-muted">
                        <img
                          src={m.recipe.thumbnail || ""}
                          alt={m.recipe.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            console.error("Recipe image load error", {
                              src: (e.currentTarget as HTMLImageElement).src,
                              recipe: m.recipe,
                            });
                          }}
                        />
                      </div>

                      <div className="p-4">
                        <h4 className="font-bold text-lg mb-1 line-clamp-1 text-foreground">{m.recipe.name}</h4>
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-4 h-10">
                          {m.recipe.ingredient || "재료 정보가 없습니다."}
                        </p>

                        <div className="flex gap-2">
                          <Link
                            to={m.recipe.id ? `/recipes/${m.recipe.id}` : "#"}
                            target={m.recipe.id ? "_blank" : undefined}
                            className="flex-1 bg-muted hover:bg-muted/80 text-foreground text-center py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                            레시피 보기
                          </Link>

                          <button
                            onClick={() => send("이 요리 재료 담아줘")}
                            className="flex-1 bg-primary text-primary-foreground flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                          >
                            <ShoppingCart className="w-4 h-4" /> 담기
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Meal Plan */}
                  {m.plan && (
                    <div className="w-full min-w-0 max-w-[calc(100vw-96px)] sm:max-w-[420px] lg:max-w-none mx-0 rounded-2xl border border-border/70 bg-card/70 p-2 sm:p-3">
                      <MealPlanTable plans={m.plan} planKind={m.planKind} />
                    </div>
                  )}

                  {/* Plan action */}
                  {m.plan && m.planKind !== "preview" && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => send("캘린더 등록해줘")}
                        className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90"
                      >
                        캘린더 등록
                      </button>
                    </div>
                  )}

                  {/* Cart items */}
                  {m.cartItems && (
                    <div className="w-full min-w-0 max-w-[min(420px,calc(100vw-96px))] lg:max-w-none mx-0">
                      <CartItemTable items={m.cartItems} onCheckout={performCheckout} />
                    </div>
                  )}
                </div>
                </div>
              );
            })}

            {/* Loading */}
            {loading && (
              <div className="flex gap-3 sm:gap-4 flex-row">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm bg-white border border-border">
                  <ChefHat className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                </div>
                <div className="flex items-center gap-2 bg-card border border-border px-4 py-3 sm:px-5 sm:py-3.5 rounded-2xl rounded-tl-none shadow-sm">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">AI가 생각 중입니다...</span>
                </div>
              </div>
            )}

            <div ref={scroller} className="h-4" />
          </div>
        </div>

        {/* Input (모바일 safe-area + 여백 통일) */}
        <div className="bg-background border-t border-border px-4 py-3 sm:py-4 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <div className="max-w-3xl mx-auto relative">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && send()}
              placeholder={loading ? "답변을 기다리는 중입니다..." : "메시지를 입력하세요 (예: 재료 담아줘, 점심 바꿔줘)"}
              className="w-full bg-muted/50 border border-border hover:border-primary/50 focus:border-primary rounded-full pl-5 pr-14 py-3.5 sm:py-4 outline-none transition-all shadow-sm"
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary text-primary-foreground p-2 rounded-full disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-all"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Chat;
