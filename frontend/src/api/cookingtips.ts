import apiClient from './axios'

export interface CookingStep {
  id: number
  step_number: number
  content: string
  url?: string | null
}

export interface CookingTip {
  id: number
  title: string
  main_thumbnail: string | null
  intro_summary: string | null
  created_at: string | null
  updated_at: string | null
  steps: CookingStep[]
}

export interface PaginatedCookingTips {
  items: CookingTip[]
  total_count: number
  page: number
  size: number
}

export async function fetchCookingTipsList(
  params: { page?: number; size?: number; sort?: string } = {}
): Promise<PaginatedCookingTips> {
  const { page = 1, size = 100, sort } = params

  // In local development, call backend directly to avoid proxy rewrite changes
  const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  if (isLocal) {
    const url = new URL(`http://localhost:8000/cookingtips/`)
    url.searchParams.append('page', String(page))
    url.searchParams.append('size', String(size))
    if (sort) url.searchParams.append('sort', String(sort))
    const res = await fetch(url.toString(), { credentials: 'omit' })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || `Request failed: ${res.status}`)
    }
    return res.json() as Promise<PaginatedCookingTips>
  }

  const res = await apiClient.get<PaginatedCookingTips>('/cookingtips/', { page, size, sort })
  return res
}

export async function fetchCookingTipDetail(id: number): Promise<CookingTip> {
  const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  if (isLocal) {
    const url = `http://localhost:8000/cookingtips/${id}`
    const res = await fetch(url, { credentials: 'omit' })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || `Request failed: ${res.status}`)
    }
    return res.json() as Promise<CookingTip>
  }

  const res = await apiClient.get<CookingTip>(`/cookingtips/${id}`)
  return res
}

export default { fetchCookingTipsList, fetchCookingTipDetail }
