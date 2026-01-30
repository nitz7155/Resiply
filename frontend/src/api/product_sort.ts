// 제품 정렬 옵션 타입 (API에 전달되는 값)
export type SortOption = 'price_asc' | 'price_desc' | 'sales' | 'rating'

// UI 라벨과 API 값 매핑
export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'price_asc', label: '낮은가격순' },
  { value: 'price_desc', label: '높은가격순' },
  { value: 'sales', label: '판매량순' },
  { value: 'rating', label: '평점순' },
]

export function getSortLabel(value: SortOption) {
  return SORT_OPTIONS.find((s) => s.value === value)?.label ?? value
}