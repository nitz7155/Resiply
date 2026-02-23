import { Store, ChefHat, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import apiClient from "@/api/axios"

const navItems = [
  { label: "스토어", icon: Store, href: "/store" },
  { label: "레시피", icon: ChefHat, href: "/recipes" },
  { label: "AI 레시피 추천", icon: Sparkles, href: "#ai-recommendation" },
];

const Navigation = () => {
  const [showMega, setShowMega] = useState(false);
  const hideTimeout = useRef<number | null>(null);
  const [majorCategories, setMajorCategories] = useState<any[]>([]);

  const onStoreClick = (e: React.MouseEvent) => {
    if (!isMobile()) return;

    e.preventDefault();

    // ✅ hover로 걸려있던 닫힘 타이머 ensures 제거
    if (hideTimeout.current) {
      window.clearTimeout(hideTimeout.current);
      hideTimeout.current = null;
    }

    setShowMega((v) => !v);
  };

const isDesktopLike = () =>
  window.matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine)").matches;

const isMobile = () => window.matchMedia("(max-width: 1023px)").matches;

  useEffect(() => {
    return () => {
      if (hideTimeout.current) {
        window.clearTimeout(hideTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    const ac = new AbortController();

    const fetchMajors = async () => {
      try {
        const data = await apiClient.get<any[]>("/major-categories", { signal: ac.signal });
        setMajorCategories(data || []);
      } catch (e) {
        // ignore
      }
    };

    fetchMajors();
    return () => ac.abort();
  }, []);

  return (
    <nav className="relative sticky top-16 lg:top-20 z-40 w-full bg-card border-b border-border">
      <div className="container mx-auto px-4 lg:px-8">
        <ul className="flex items-center gap-1 lg:gap-2 overflow-x-auto scrollbar-hide py-2">
          {navItems.map((item) => (
            <li
              key={item.label}
              {...(item.label === "스토어"
                ? {
                    className: "relative",
                    onMouseEnter: () => {
                      if (!isDesktopLike()) return;
                      if (hideTimeout.current) {
                        window.clearTimeout(hideTimeout.current);
                        hideTimeout.current = null;
                      }
                      setShowMega(true);
                    },
                    onMouseLeave: () => {
                      if (!isDesktopLike()) return;
                      hideTimeout.current = window.setTimeout(() => setShowMega(false), 150);
                    },
                  }
                : { className: "" })}
            >
              {item.href.startsWith("/") ? (
                <Link
                  to={item.href}
                  onClick={item.label === "스토어" ? onStoreClick : undefined}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all whitespace-nowrap"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ) : item.href.startsWith("#") ? (
                <Link
                  to={`/${item.href}`}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all whitespace-nowrap"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ) : (
                <a
                  href={item.href}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all whitespace-nowrap"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </a>
              )}
            </li>
          ))}
        </ul>
        {/* Render megamenu as a sibling under the nav container so it's not clipped */}
        <div
          className={`${showMega ? "block" : "hidden"} absolute left-0 right-0 top-full bg-popover border-t border-border shadow-lg z-50 max-h-[calc(100vh-160px)] overflow-y-auto overscroll-contain`}
          onMouseEnter={() => {
            if (!isDesktopLike()) return;
            if (hideTimeout.current) {
              window.clearTimeout(hideTimeout.current);
              hideTimeout.current = null;
            }
            setShowMega(true);
          }}
          onMouseLeave={() => {
            if (!isDesktopLike()) return;
            hideTimeout.current = window.setTimeout(() => setShowMega(false), 150);
          }}
        >
          <div className="container mx-auto px-4 lg:px-8">
            <div className="flex lg:hidden items-center justify-between gap-2 py-3">
              <div className="text-sm font-semibold text-foreground shrink-0">카테고리</div>
              <Link
                to="/store"
                onClick={() => setShowMega(false)}
                className="
                  inline-flex items-center gap-1.5
                  rounded-full border border-border
                  bg-background/80 px-3 py-1.5
                  text-xs font-semibold text-foreground
                  shadow-sm
                  hover:bg-primary/10 hover:border-primary/30
                  active:scale-[0.98]
                  transition
                  max-w-[72%]
                "
              >
                <span className="leading-tight break-keep">
                  스토어 전체보기
                </span>
                <span className="shrink-0" aria-hidden>→</span>
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6 lg:gap-8 py-4 lg:py-6 text-sm text-muted-foreground">
              {(() => {
                const cols = majorCategories.slice(0, 6);
                const nodes: any[] = [];
                for (let i = 0; i < 6; i++) {
                  const m = cols[i];
                  if (m) {
                    nodes.push(
                      <div
                        key={m.id}
                        className="rounded-xl bg-secondary/30 p-3 lg:bg-transparent lg:p-0"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="h-4 w-1 rounded-full bg-primary" />
                          <h4 className="text-foreground font-semibold leading-none">{m.name}</h4>
                        </div>

                        <ul className="space-y-1.5 pl-3">
                          {(m.categories || []).map((cat: any) => (
                            <li key={cat.id}>
                              <Link
                                to={`/store/category/${cat.id}`}
                                onClick={() => setShowMega(false)}
                                className="text-sm text-muted-foreground hover:text-foreground hover:underline break-keep"
                              >
                                {cat.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>

                    );
                  } else {
                    nodes.push(<div key={`empty-${i}`} />);
                  }
                }
                return nodes;
              })()}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
