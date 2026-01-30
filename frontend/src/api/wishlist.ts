import apiClient from "@/api/axios";

export type WishlistItem = {
  id: string;
  title: string;
  name?: string;
  price: number;
  imageUrl?: string;
  image?: string;
  thumbnail?: string;
  likedAt?: string;
  savedAt?: string;
};

export function fetchWishlist(options?: { signal?: AbortSignal }) {
  return apiClient.get<WishlistItem[]>("wishlist", undefined, {
    signal: options?.signal,
    credentials: "include",
  });
}

export function addWishlist(productId: string | number) {
  return apiClient.post<{ liked: boolean }>(`wishlist/${productId}`, undefined, {
    credentials: "include",
  });
}

export function removeWishlist(productId: string | number) {
  return apiClient.delete<{ liked: boolean }>(`wishlist/${productId}`, undefined, {
    credentials: "include",
  });
}