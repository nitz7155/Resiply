import { Search, ShoppingCart, User, X, ChefHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useCartStore } from "@/lib/cartStore";
import { useState, useRef, useEffect } from "react";
import apiClient from "@/api/axios";


const Header = () => {
  const [query, setQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileInputRef = useRef<HTMLInputElement | null>(null);

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const suggestTimer = useRef<number | null>(null);
  const suggBoxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { isAuthenticated, logout } = useAuth();
  const cartCount = useCartStore((s) => s.getCartCount());
  const navigate = useNavigate();

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const v = query.trim();
      if (v.length) {
        navigate(`/search?q=${encodeURIComponent(v)}`);
        setMobileSearchOpen(false);
      }
    }
  };

  useEffect(() => {
    if (mobileSearchOpen) mobileInputRef.current?.focus();

    // outside click closes suggestion box
    function handleClick(e: MouseEvent) {
      if (suggBoxRef.current && !suggBoxRef.current.contains(e.target as Node) && inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setSuggestions([]);
      }
    }
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [mobileSearchOpen]);

  useEffect(() => {
    // debounce fetch suggestions
    if (!query || query.trim().length === 0) {
      setSuggestions([]);
      return;
    }
    if (suggestTimer.current) window.clearTimeout(suggestTimer.current);
    suggestTimer.current = window.setTimeout(async () => {
      setSuggestLoading(true);
      try {
        const q = query.trim();
        const res = await apiClient.get<string[]>('/search/suggest', { q, limit: 6 });
        const list = Array.isArray(res) ? res : [];
        setSuggestions(list.slice(0, 6));
      } catch (err) {
        console.error('suggest error', err);
        setSuggestions([]);
      } finally {
        setSuggestLoading(false);
      }
    }, 250);
    return () => { if (suggestTimer.current) window.clearTimeout(suggestTimer.current); };
  }, [query]);

  const onPick = (s: string) => {
    setQuery(s);
    setSuggestions([]);
    navigate(`/search?q=${encodeURIComponent(s)}`);
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full bg-card/95 backdrop-blur-sm border-b border-border shadow-sm">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20 gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0 cursor-pointer" onClick={() => { navigate('/') }}>
            <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-xl bg-primary flex items-center justify-center">
              <ChefHat className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl lg:text-2xl font-bold text-foreground">
              Resiply<span className="text-primary">+</span>
            </span>
          </div>

          {/* (Mobile search now rendered below header to sit between header and nav) */}

          {/* Search Bar - Desktop */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <div className="relative w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="재료나 레시피를 검색하세요"
                className="w-full h-11 pl-12 pr-4 rounded-xl bg-secondary border border-transparent focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm"
              />
              {/* suggestions dropdown */}
              <div ref={suggBoxRef} className="absolute left-0 right-0 mt-2 z-50">
                {suggestLoading && <div className="bg-card border border-border rounded p-2 text-sm text-muted-foreground">검색 중...</div>}
                {!suggestLoading && suggestions.length > 0 && (
                  <div className="bg-card border border-border rounded shadow max-h-56 overflow-auto">
                    {suggestions.map((s, idx) => (
                      <button key={s + idx} type="button" onClick={() => onPick(s)} className="w-full text-left px-3 py-2 hover:bg-muted/10">{s}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2 lg:gap-3">
            {/* Mobile Search */}
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileSearchOpen((s) => !s)} aria-label="검색">
              <Search className="h-5 w-5" />
            </Button>

            {/* Cart */}
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={() => navigate("/cart")}
              aria-label="장바구니"
            >
              <ShoppingCart className="h-5 w-5" />
              <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 bg-primary text-primary-foreground text-xs font-medium rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            </Button>

            {/* Auth Buttons */}
            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                {/* ✅ Mobile only: dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="sm:hidden"
                      aria-label="계정 메뉴"
                    >
                      <User className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent
                    align="end"
                    sideOffset={8}
                    className="
                      w-44 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/95 p-1
                      shadow-xl shadow-black/10 backdrop-blur
                      dark:border-slate-800/80 dark:bg-slate-950/80
                      animate-in fade-in zoom-in-95
                    "
                  >
                    <DropdownMenuItem
                      onClick={() => navigate("/mypage")}
                      className="
                        flex items-center gap-2 rounded-xl px-3 py-2 text-sm
                        focus:bg-slate-100 dark:focus:bg-slate-900
                      "
                    >
                      <User className="h-4 w-4 opacity-80" />
                      마이페이지
                    </DropdownMenuItem>

                    <DropdownMenuSeparator className="my-1 bg-slate-200/70 dark:bg-slate-800/80" />

                    <DropdownMenuItem
                      onClick={() => {
                        logout();
                        navigate("/");
                      }}
                      className="
                        flex items-center gap-2 rounded-xl px-3 py-2 text-sm
                        text-red-600 focus:text-red-600
                        focus:bg-red-50 dark:text-red-400 dark:focus:text-red-400 dark:focus:bg-red-950/40
                      "
                    >
                      <span className="h-4 w-4 inline-flex items-center justify-center opacity-80">❌</span>
                      로그아웃
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* ✅ Desktop+: 기존 UI 그대로 */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden sm:flex gap-2"
                  onClick={() => navigate("/mypage")}
                >
                  <User className="h-4 w-4" />
                  마이페이지
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="hidden sm:flex gap-2"
                  onClick={() => {
                    logout();
                    navigate("/");
                  }}
                >
                  로그아웃
                </Button>
              </div>
            ) : (
              <>
                {/* Mobile: Login icon */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="sm:hidden"
                  onClick={() => navigate("/login")}
                  aria-label="로그인"
                >
                  <User className="h-5 w-5" />
                </Button>

                {/* Desktop+: Login text */}
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden sm:flex gap-2"
                  onClick={() => navigate("/login")}
                >
                  <User className="h-4 w-4" />
                  로그인
                </Button>
              </>
            )}

          </div>
        </div>
      </div>
        </header>

        {/* Mobile search bar placed between header and nav */}
        <div className={`md:hidden ${mobileSearchOpen ? "block" : "hidden"} w-full bg-card/95 border-b border-border`}> 
          <div className="container mx-auto px-4">
            <div className="py-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <input
                  ref={mobileInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="재료나 레시피를 검색하세요"
                  className="w-full h-11 pl-10 pr-10 rounded-xl bg-secondary border border-transparent focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                />
                <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2" onClick={() => setMobileSearchOpen(false)} aria-label="Close search">
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </>
  );
};

export default Header;
