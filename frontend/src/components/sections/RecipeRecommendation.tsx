import { useEffect, useState } from "react";
import { Utensils } from "lucide-react";
import RecipeCard from "./RecipeCard";

interface CartItem {
  id: string;
  title: string;
}

interface RecommendRecipe {
  id: number,
  title: string,
  imageUrl: string,
  cookTime: string,
}

interface RecipeRecommendationProps {
  cartItems: CartItem[];
}

function RecipeRecommendation({ cartItems }: RecipeRecommendationProps) {

  const [recommendedRecipes, setRecommendedRecipes] = useState<RecommendRecipe[]>([]);

  useEffect(() => {
    const getRecommendRecipe = async () => {
      if (cartItems.length === 0) return null;
      const productIds = cartItems.map(i => i.id);

      const params = new URLSearchParams();
      productIds.forEach(id => params.append("ids", id.toString()));

      try {
        const res = await fetch(`/api/recipe/recommend?${params.toString()}`);
        const data = await res.json();
        setRecommendedRecipes(data);
      } catch (err) {
        console.error(err);
      }
    }

    getRecommendRecipe();
  }, [cartItems])

  return (
    <section className="mt-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">
              추천 레시피
            </h2>
            <p className="mt-0.5 text-md text-slate-500">
              오늘은 이런 요리 어때요?
            </p>
          </div>
        </div>
      </div>

      {cartItems.length === 0 ? (
        // 장바구니가 비었을 때는 인기 레시피나 빈 상태 UI
        <div className="mt-10 rounded-2xl border border-dashed border-slate-200 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-50">
            <Utensils className="h-6 w-6 text-slate-300" />
          </div>
          <p className="mt-4 text-md text-slate-500">장바구니에 재료를 담으면 레시피를 추천받을 수 있습니다.</p>
        </div>
      ) : (
        <div className="mt-8">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recommendedRecipes.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        </div>
      )}

    </section>
  );
}

export default RecipeRecommendation;