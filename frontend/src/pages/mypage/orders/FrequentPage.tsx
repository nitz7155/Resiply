import React from "react";

const FrequentPage: React.FC = () => {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="text-lg font-bold">자주 구매한 상품</h2>
        <p className="mt-2 text-sm text-slate-500">자주 구매한 상품을 모아볼 수 있어요.</p>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center">
        <div className="text-sm text-slate-500">준비중입니다.</div>
      </div>
    </div>
  );
};

export default FrequentPage;