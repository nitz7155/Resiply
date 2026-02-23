import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import useStore from "@/lib/useStore";
import { ClipboardList, Heart, BookMarked, CalendarDays, CircleUser } from "lucide-react";

type SidebarProps = {
  onNavigate?: () => void;
  className?: string;
};

type FrequentItem = {
  to: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
};

type SectionItem = {
  to: string;
  label: string;
};

type Section = {
  title: string;
  items: SectionItem[];
};

const frequentMenu: FrequentItem[] = [
  { to: "", label: "내 정보 수정", Icon: CircleUser},
  { to: "calendar", label: "식단표", Icon: CalendarDays },
  { to: "order", label: "최근 주문내역", Icon: ClipboardList },
  { to: "wishlist", label: "찜한 상품", Icon: Heart },
  { to: "recipes", label: "저장한 레시피", Icon: BookMarked },
];

const sections: Section[] = [
  {
    title: "쇼핑",
    items: [
      { to: "cancel-return", label: "취소 · 반품 내역" },
      { to: "review", label: "상품 후기" },
      { to: "frequent", label: "자주 구매한 상품" },
    ],
  },
  {
    title: "내 정보관리",
    items: [{ to: "address", label: "배송지 관리" }],
  },
];

const frequentBase =
  "flex items-center justify-between w-full rounded-2xl px-4 py-4 transition";
const frequentActive = "bg-primary/10 text-primary";
const frequentInactive =
  "bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-950 text-slate-900 dark:text-white";

const sectionLinkBase = "block py-3 text-[15px] leading-none transition";
const sectionLinkActive = "text-primary font-semibold";
const sectionLinkInactive =
  "text-slate-900 dark:text-white hover:text-primary";

const Sidebar: React.FC<SidebarProps> = ({ onNavigate, className }) => {
  const user = useStore((s) => s.user);
  const [openWithdraw, setOpenWithdraw] = useState(false);

  // TODO: Connect to backend API to fetch user coupons and points
  const couponCount = 0;
  const pointAmount = 0;

  const handleWithdraw = async () => {
    // TODO: 실제 탈퇴 API 호출 연결
    // await authApi.withdraw() 등
    setOpenWithdraw(false);
  };

  return (
    <aside className={`w-full lg:w-80 ${className ?? ""}`}>
      {/* Outer border only */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
        {/* Profile */}
        <div>
          <div className="text-sm text-slate-500">반가워요!</div>
          <div className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">
            {user?.name ?? "고객"}님
          </div>

          {/* 혜택 안내 */}
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                혜택 안내
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="p-4">
                <div className="text-xs text-slate-500">쿠폰</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                    {couponCount}
                  </span>
                  <span className="text-xs text-slate-500">장</span>
                </div>
                <div className="mt-2 text-[11px] text-slate-400">
                  사용 가능 쿠폰
                </div>
              </div>

              <div className="p-4 border-l border-slate-200 dark:border-slate-800">
                <div className="text-xs text-slate-500">적립금</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                    {pointAmount.toLocaleString("ko-KR")}
                  </span>
                  <span className="text-xs text-slate-500">원</span>
                </div>
                <div className="mt-2 text-[11px] text-slate-400">
                  사용 가능 적립금
                </div>
              </div>
            </div>

            {/* CTA 링크 */}
            <div className="mt-3 flex gap-2">
              <NavLink
                to="/mypage/coupons"
                onClick={onNavigate}
                className="flex-1 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 py-2 text-center text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900"
              >
                내 쿠폰함
              </NavLink>
              <NavLink
                to="/mypage/points"
                onClick={onNavigate}
                className="flex-1 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 py-2 text-center text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900"
              >
                적립금 안내
              </NavLink>
            </div>
          </div>
        </div>

        {/* 자주 찾는 메뉴 */}
        <div className="mt-6">
          <div className="px-1 pb-3 text-xs font-bold text-slate-500">
            자주 찾는 메뉴
          </div>

          {/* only one divider under this section */}
          <nav className="flex flex-col gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
            {frequentMenu.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === ""}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `${frequentBase} ${isActive ? frequentActive : frequentInactive}`
                }
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5" />
                  <span className="text-[15px] font-semibold">{label}</span>
                </div>
                <span className="text-slate-300">›</span>
              </NavLink>
            ))}
          </nav>
        </div>

        {/* 쇼핑 / 내 정보관리 */}
        <div className="mt-6">
          {sections.map((section, idx) => (
            <div key={section.title} className={idx === 0 ? "" : "mt-6"}>
              <div className="px-1 text-xs font-bold text-slate-400">
                {section.title}
              </div>

              {/* removed internal borders; simple vertical list */}
              <div className="mt-2 space-y-1">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `${sectionLinkBase} ${isActive ? sectionLinkActive : sectionLinkInactive
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 탈퇴하기 */}
        <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setOpenWithdraw(true)}
            className="text-xs text-slate-400 hover:text-red-500 underline underline-offset-2"
          >
            탈퇴하기
          </button>
        </div>

        {/* 간단 모달 */}
        {openWithdraw && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <button
              className="absolute inset-0 bg-black/40"
              onClick={() => setOpenWithdraw(false)}
              aria-label="close"
            />
            <div className="relative w-[360px] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
              <div className="text-lg font-extrabold text-slate-900 dark:text-white">
                정말 탈퇴하시겠어요?
              </div>
              <p className="mt-2 text-sm text-slate-500">
                탈퇴 시 계정 정보가 삭제되며 복구가 어려울 수 있어요.
              </p>

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-xl border border-slate-200 dark:border-slate-800 py-2 text-sm"
                  onClick={() => setOpenWithdraw(false)}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-red-500 py-2 text-sm font-bold text-white hover:bg-red-600"
                  onClick={handleWithdraw}
                >
                  탈퇴 진행
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside >
  );
};

export default Sidebar;
