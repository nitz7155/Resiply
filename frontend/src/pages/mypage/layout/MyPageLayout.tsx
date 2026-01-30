import React, { useState } from "react";
import { Outlet, NavLink, Navigate } from "react-router-dom";
import Header from "@/components/layout/Header";
import Navigation from "@/components/layout/Navigation";
import Footer from "@/components/layout/Footer";
import Sidebar from "@/pages/mypage/components/Sidebar";
import { useAuth } from "@/lib/AuthContext";
import useStore from "@/lib/useStore";
import ChatbotButton from "@/components/ui/ChatbotButton.tsx";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle,} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

const tabBase = "px-3 py-2 rounded-full text-sm whitespace-nowrap border";
const tabActive = "bg-primary/10 border-primary text-primary font-semibold";
const tabInactive =
  "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200";

const MyPageLayout: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const user = useStore((s) => s.user);
  const [menuOpen, setMenuOpen] = useState(false);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950">
      <Header />
      <Navigation />

      <div className="p-4 lg:p-8">
        <div className="container mx-auto">
          <div className="lg:flex gap-6">
            {/* Left (Desktop only) */}
            <div className="hidden lg:block w-80 shrink-0">
              <Sidebar />
            </div>

            {/* Right */}
            <div className="flex-1">
              {/* Mobile top greeting + tabs + hamburger */}
              <div className="lg:hidden mb-4">
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-slate-900 dark:text-white">
                        반가워요! {user?.name ?? "고객"}님
                      </div>
                      <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        마이페이지에서 주문/배송 현황을 확인하세요.
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1">
                    <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                      <SheetTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 rounded-full shrink-0"
                          aria-label="전체 메뉴"
                        >
                          <Menu className="h-4 w-4" />
                        </Button>
                      </SheetTrigger>

                      <SheetContent
                        side="left"
                        className="w-[88vw] max-w-sm p-0 flex flex-col h-[100dvh]"
                      >
                        <SheetHeader className="shrink-0 p-4 border-b border-slate-200 dark:border-slate-800">
                          <SheetTitle>마이페이지 메뉴</SheetTitle>
                        </SheetHeader>

                        {/* ✅ 여기서 스크롤 */}
                        <div className="flex-1 overflow-y-auto p-3">
                          <Sidebar onNavigate={() => setMenuOpen(false)} className="w-full" />
                        </div>
                      </SheetContent>
                    </Sheet>

                    <NavLink
                      to="/mypage"
                      end
                      className={({ isActive }) =>
                        `${tabBase} ${isActive ? tabActive : tabInactive}`
                      }
                    >
                      마이페이지
                    </NavLink>

                    <NavLink
                      to="/mypage/order"
                      className={({ isActive }) =>
                        `${tabBase} ${isActive ? tabActive : tabInactive}`
                      }
                    >
                      주문 내역
                    </NavLink>

                    <NavLink
                      to="/mypage/address"
                      className={({ isActive }) =>
                        `${tabBase} ${isActive ? tabActive : tabInactive}`
                      }
                    >
                      배송지
                    </NavLink>
                  </div>
                </div>
              </div>

              <Outlet />
            </div>
          </div>
        </div>
      </div>

      <ChatbotButton />
      <Footer />
    </div>
  );
};

export default MyPageLayout;
