import apiClient from './axios'

export interface RecipeSummary {
  id: number
  name: string
  ingredient?: string | null
  time?: string | null
  thumbnail?: string | null
}

export async function fetchRandomRecipes(limit = 4): Promise<RecipeSummary[]> {
  const resp = await apiClient.get<RecipeSummary[]>('recipe/random', { limit })
  return resp || []
}

export async function fetchRecipeList(): Promise<RecipeSummary[]> {
  const resp = await apiClient.get<RecipeSummary[]>('recipe')
  return resp || []
}

export async function fetchRecipeDetail(id: number) {
  const resp = await apiClient.get<any>(`recipe/${id}`)
  return resp
}
