import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import apiClient from "@/api/axios";
import useStore from "@/lib/useStore";

type ReviewItem = {
  id: string;
  productName: string;
  option?: string;
  createdAt: string;
  content: string;
  rating: number; // 1~5
};

function Stars({
  value,
  onChange,
}: {
  value: number;
  onChange?: (next: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => {
        const score = i + 1;
        const active = score <= value;

        return (
          <button
            key={score}
            type="button"
            onClick={() => onChange?.(score)}
            className="p-0.5"
            aria-label={`별점 ${score}점`}
          >
            <Star
              className={`h-5 w-5 ${
                active ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
              }`}
            />
          </button>
        );
      })}
      <span className="ml-2 text-sm text-gray-500">{value}/5</span>
    </div>
  );
}

export default function ReviewPage() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const user = useStore((s) => s.user);

  useEffect(() => {
    const fetchMyReviews = async () => {
      try {
        if (!user?.id) return;
        const res = await apiClient.get<any[]>("reviews/", { member_id: user.id });
        const mapped = (res || []).map((r) => ({
          id: String(r.id),
          productName: r.product?.name ?? r.product?.title ?? `상품 ${r.product_id}`,
          createdAt: r.created_at ? r.created_at.split("T")[0] : "",
          content: r.content,
          rating: r.rating || 0,
        }));
        setReviews(mapped);
      } catch (err) {
        console.error("Failed to fetch my reviews:", err);
      }
    };

    fetchMyReviews();
  }, [user?.id]);

  const updateRating = (id: string, next: number) => {
    setReviews((prev) =>
      prev.map((r) => (r.id === id ? { ...r, rating: next } : r))
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="text-lg font-bold">상품 후기</h2>
        <p className="mt-2 text-sm text-slate-500">
          구매한 상품에 대한 후기를 확인하고 별점을 수정할 수 있어요.
        </p>
      </div>

      {reviews.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-500">
          아직 작성한 후기가 없어요.
        </div>
      ) : (
        <ul className="space-y-4">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-base font-bold text-gray-900">
                    {r.productName}
                    {r.option ? (
                      <span className="ml-2 text-sm font-medium text-gray-500">
                        · {r.option}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">{r.createdAt}</div>
                </div>

                {/* ✅ 5개 만점 별점 */}
                <Stars value={r.rating} onChange={(n) => updateRating(r.id, n)} />
              </div>

              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-gray-700">
                {r.content}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
