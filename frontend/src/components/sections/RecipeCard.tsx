import { Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

export interface Recipe {
  id: number;
  title: string;
  imageUrl: string;
  cookTime: string;
}

interface RecipeCardProps {
  recipe: Recipe;
}

export default function RecipeCard({ recipe }: RecipeCardProps) {
  const navigate = useNavigate();

  return (
    <div className="group cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md hover:-translate-y-1" onClick={() => navigate(`/recipes/${recipe.id}`)}>
      <div className="relative aspect-[4/3] overflow-hidden">
        <img src={recipe.imageUrl} alt={recipe.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
      </div>

      <div className="p-4">
        <h3 className="line-clamp-2 text-base font-bold text-slate-900 group-hover:text-[#EE792B]">
          {recipe.title}
        </h3>

        <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {recipe.cookTime}
          </span>
        </div>
      </div>
    </div>
  );
}
