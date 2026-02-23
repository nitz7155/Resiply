import apiClient from './axios'
import { SortOption } from './product_sort'

export interface Product {
  id: number
  category_id: number
  name: string
  title?: string | null
  price: number
  main_thumbnail?: string | null
  detail_images?: string | null
  stock: number
  is_active: boolean
  created_at?: string | null
  updated_at?: string | null
  avg_rating?: number | null
  review_count?: number | null
  monthly_buyers?: number | null
}

export interface PaginatedProductResponse {
  items: Product[]
  total_count: number
  page: number
  size: number
}

export interface ProductListParams {
  page?: number
  size?: number
  keyword?: string
  category_id?: number
  category_ids?: number[]
  sort?: SortOption
}

export async function fetchProductList(
  params: ProductListParams = {},
  options?: { signal?: AbortSignal }
): Promise<Product[] | PaginatedProductResponse> {
  const {
    page = 1,
    size = 10,
    keyword,
    category_id,
    category_ids,
    sort,
  } = params

  const response = await apiClient.get<Product[]>('/products/', {
    page,
    size,
    keyword,
    category_id,
    category_ids,
    sort,
  }, options)

  return response
}

export async function fetchProductDetail(
  productId: number,
  options?: { signal?: AbortSignal }
): Promise<Product> {
  const response = await apiClient.get<Product>(`/products/${productId}`, undefined, options)
  return response
}

export async function fetchRecommendedProducts(
  options?: { signal?: AbortSignal }
): Promise<Product[]> {
  const response = await apiClient.get<Product[]>(`/products/recommended`, undefined, options)
  return response
}

export async function fetchSearchProducts(
  keyword: string,
  options?: { limit?: number; offset?: number; signal?: AbortSignal }
): Promise<Product[]> {
  if (!keyword) return []
  const { limit = 20, offset = 0, signal } = options || {}
  // This endpoint now returns a mixed list of products and recipes.
  const response = await apiClient.get<any[]>('/search', { keyword, limit, offset }, { signal })
  return response
}

export const fetchAnalyzeProductImage = async (
    productId: number,
    options?: { signal?: AbortSignal }
): Promise<string> => {
  return apiClient.post<string>('/recommendations/analyze-product-image', { product_id: productId }, options)
}

// Added: product reviews API helpers
export interface ProductReviewOut {
  id: number
  product_id: number
  member_id?: number | null
  order_detail_id?: number | null
  nickname?: string | null
  content: string
  rating: number
  created_at?: string | null
  images?: string[]
}

export interface PaginationReview {
  items: ProductReviewOut[]
  total_count: number
  page: number
  size: number
}

export async function fetchProductReviews(
  productId: number,
  params: { page?: number; size?: number } = {},
  options?: { signal?: AbortSignal }
): Promise<PaginationReview> {
  const { page = 1, size = 10 } = params
  const response = await apiClient.get<PaginationReview>(`/products/${productId}/reviews`, { page, size }, options)
  return response
}

export async function postProductReview(
  productId: number,
  payload: { member_id: number; content: string; rating: number; url?: string; order_detail_id?: number },
  options?: { signal?: AbortSignal }
): Promise<ProductReviewOut> {
  const response = await apiClient.post<ProductReviewOut>(`/products/${productId}/reviews`, payload, options)
  return response
}
