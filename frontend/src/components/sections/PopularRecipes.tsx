import { Clock, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { fetchRandomRecipes, RecipeSummary } from "@/api/recipe";
import { Link } from 'react-router-dom';
import { useNavigate } from "react-router-dom";

// Popular recipes are loaded from backend randomly (4 items)
// Component shows backend thumbnail if available.

const PopularRecipes = () => {
  const navigate = useNavigate()

  const [recipes, setRecipes] = useState<RecipeSummary[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      try {
        const items = await fetchRandomRecipes(4)
        if (mounted) setRecipes(items)
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to load random recipes', e)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [])
  return (
    <section className="py-12 lg:py-16 bg-cream-dark" id="recipes">
      <div className="container mx-auto px-4 lg:px-8">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl lg:text-3xl font-bold text-foreground mb-2">
              인기 레시피
            </h2>
            <p className="text-muted-foreground">혼밥에 딱 맞는 1인분 레시피</p>
          </div>
          <Button variant="ghost" className="hidden sm:flex gap-1 text-primary" onClick={() => { navigate(`/recipes`) }}>
            전체보기 <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Recipes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {recipes.length === 0 && !loading && (
            <div className="text-sm text-muted-foreground">레시피가 없습니다.</div>
          )}
          {recipes.map((recipe, index) => (
            <div
              key={recipe.id}
              className="group bg-card rounded-2xl border border-border overflow-hidden shadow-card hover:shadow-soft transition-all duration-300 animate-fade-in cursor-pointer"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <Link to={`/recipes/${recipe.id}`}>
                <div className="flex flex-col sm:flex-row">
                  {/* Image */}
                  <div className="relative w-full sm:w-48 lg:w-56 aspect-video sm:aspect-square overflow-hidden shrink-0">
                    {recipe.thumbnail ? (
                      <img src={recipe.thumbnail} alt={recipe.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full bg-muted" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 p-5 flex flex-col justify-center">
                    <h3 className="text-lg lg:text-xl font-semibold text-foreground mb-3 group-hover:text-primary transition-colors">
                      {recipe.name}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />
                        {recipe.time || ''}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>

        {/* Mobile View All */}
        <Button variant="outline" className="w-full mt-6 sm:hidden gap-1">
          전체보기 <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
};

export default PopularRecipes;
