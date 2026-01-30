import React from "react";
import { Link } from "react-router-dom";
import useStore from "@/lib/useStore";
import OrderCard from "@/pages/mypage/components/OrderCard";

const KRW = (n: number) => n.toLocaleString("ko-KR");

const OverviewPage: React.FC = () => {
  const user = useStore((s) => s.user);
  const orders = useStore((s) => s.orders);
  const wishlist = useStore((s) => s.wishlist);
  const recipes = useStore((s) => s.recipes);

  const recentOrders = orders?.slice(0, 3) ?? [];

  return (
    <div className="space-y-6">
      {/* Kurly-like greeting card */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              반가워요! {user?.name ?? "고객"}님
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              최근 주문내역과 저장한 항목들을 한 번에 확인하세요.
            </p>
          </div>

          <div className="hidden sm:flex gap-2">
            <Link
              to="/mypage/order"
              className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
            >
              주문내역 보기
            </Link>
            <Link
              to="/mypage/address"
              className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-semibold"
            >
              배송지 관리
            </Link>
          </div>
        </div>

        {/* quick summary strip */}
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
            <div className="text-xs text-slate-500">최근 3건</div>
            <div className="mt-1 font-bold text-slate-900 dark:text-white">
              주문 {recentOrders.length}건
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
            <div className="text-xs text-slate-500">찜</div>
            <div className="mt-1 font-bold text-slate-900 dark:text-white">
              {wishlist?.length ?? 0}개
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
            <div className="text-xs text-slate-500">저장 레시피</div>
            <div className="mt-1 font-bold text-slate-900 dark:text-white">
              {recipes?.length ?? 0}개
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
            <div className="text-xs text-slate-500">총 주문금액(최근3)</div>
            <div className="mt-1 font-bold text-slate-900 dark:text-white">
              {KRW(
                (recentOrders ?? []).reduce(
                  (acc: number, o: any) => acc + (o.total ?? 0),
                  0
                )
              )}
              원
            </div>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            최근 주문내역
          </h3>
          <Link
            to="/mypage/order"
            className="text-sm font-semibold text-primary hover:underline"
          >
            전체보기
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3">
          {recentOrders.length === 0 ? (
            <div className="text-sm text-slate-500">최근 주문이 없어요.</div>
          ) : (
            recentOrders.map((o: any) => <OrderCard key={o.id} order={o} />)
          )}
        </div>
      </section>

      {/* Placeholder sections (Kurly 느낌만) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            찜한 상품
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            (mock) 카드 UI는 기존 ProductCard 페이지로 확장 가능
          </p>
          <div className="mt-4 text-sm text-slate-500">
            총 {wishlist?.length ?? 0}개
          </div>
        </section>

        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            저장한 레시피
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            (mock) RecipeCard 리스트로 확장 가능
          </p>
          <div className="mt-4 text-sm text-slate-500">
            총 {recipes?.length ?? 0}개
          </div>
        </section>
      </div>
    </div>
  );
};

export default OverviewPage;
