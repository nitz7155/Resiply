import apiClient from "@/api/axios";

export type RecipeBookmarkItem = {
  id: string;
  recipe_id: number;
  savedAt?: string;
  created_at?: string;

  recipe?: {
    id: number;
    name: string;
    time: string;
    thumbnail: string;
  };
};

export function fetchRecipeBookmarks(options?: { signal?: AbortSignal }) {
  return apiClient.get<RecipeBookmarkItem[]>("recipe/bookmarks", undefined, {
    signal: options?.signal,
    credentials: "include",
  });
}

export function addRecipeBookmark(recipeId: string | number) {
  return apiClient.post<{ bookmarked: boolean }>(`recipe/bookmarks/${recipeId}`, undefined, {
    credentials: "include",
  });
}

export function removeRecipeBookmark(recipeId: string | number) {
  return apiClient.delete<{ bookmarked: boolean }>(`recipe/bookmarks/${recipeId}`, undefined, {
    credentials: "include",
  });
}
