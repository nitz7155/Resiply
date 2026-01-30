import { create } from "zustand";
import type { WishlistItem } from "@/api/wishlist";

export type Order = {
  id: string;
  productName: string;
  date: string;
  total: string;
  status: string;
  items?: Array<{ id: number; product_id?: number; name?: string }>;
};

export type Product = {
  id: string;
  name: string;
  price: string;
  image?: string;
};

export type Recipe = {
  id: string;
  title: string;
  time?: string;
  thumbnail?: string;
  savedAt?: string;
};

export type Address = {
  id: string;
  label: string;
  receiver: string;
  phone?: string | null;
  addressLine: string;
  deliveryType?: string | null;
  isDefault: boolean;
};

type MyStore = {
  user: { id: string; name?: string; email?: string; provider?: string } | null;
  orders: Order[];
  wishlist: WishlistItem[];
  recipes: Recipe[];
  addresses: Address[];

  // ✅ wishlist
  setWishlist: (items: WishlistItem[]) => void;
  toggleWishlist: (p: WishlistItem) => void;
  isWishlisted: (id: string) => boolean;

  // ✅ recipe bookmark
  setSavedRecipes: (items: Recipe[]) => void;
  toggleSavedRecipe: (r: Recipe) => void;
  isRecipeSaved: (id: string | number) => boolean;

  // ✅ address
  setAddresses: (items: Address[]) => void;
  setDefaultAddress: (id: string) => void;
  addAddress: (a: Address) => void;
  updateAddress: (a: Address) => void;
  removeAddress: (id: string) => void;

  // ✅ user
  setUser: (u: { id: string; name?: string; email?: string; provider?: string } | null) => void;
  clearUser: () => void;

  // ✅ orders
  setOrders: (orders: Order[]) => void;
};

export const useStore = create<MyStore>((set, get) => ({
  user: null,
  orders: [],

  wishlist: [],

  recipes: [],

  addresses: [],

  // ===== user =====
  setUser: (u) => set(() => ({ user: u })),
  clearUser: () => set(() => ({ user: null })),

  // ===== orders =====
  setOrders: (orders) => set(() => ({ orders })),

  // ===== wishlist =====
  setWishlist: (items) =>
    set(() => ({
      wishlist: (items ?? []).map((x) => ({
        ...x,
        id: String(x.id),
      })),
    })),

  isWishlisted: (id: string) => {
    return get().wishlist.some((x) => String(x.id) === String(id));
  },

  toggleWishlist: (p: WishlistItem) => {
    set((state) => {
      const pid = String(p.id);
      const exists = state.wishlist.some((x) => String(x.id) === pid);
      return {
        wishlist: exists
          ? state.wishlist.filter((x) => String(x.id) !== pid)
          : [{ ...p, id: pid }, ...state.wishlist],
      };
    });
  },

  // recipe bookmarks =====
  setSavedRecipes: (items) =>
    set(() => ({
      recipes: (items ?? []).map((x) => ({
        ...x,
        id: String(x.id),
      })),
    })),

  isRecipeSaved: (id) => {
    const rid = String(id);
    return get().recipes.some((x) => String(x.id) === rid);
  },

  toggleSavedRecipe: (r: Recipe) => {
    set((state) => {
      const rid = String(r.id);
      const exists = state.recipes.some((x) => String(x.id) === rid);
      return {
        recipes: exists
          ? state.recipes.filter((x) => String(x.id) !== rid)
          : [{ ...r, id: rid }, ...state.recipes],
      };
    });
  },

  // ===== address =====
  setAddresses: (items) =>
    set(() => ({
      addresses: (items ?? []).map((a) => ({ ...a, id: String(a.id) })),
    })),
  setDefaultAddress: (id: string) =>
    set((state) => ({
      addresses: state.addresses.map((a) => ({ ...a, isDefault: a.id === id })),
    })),
  addAddress: (a: Address) => set((state) => ({ addresses: [a, ...state.addresses] })),
  updateAddress: (a: Address) =>
    set((state) => ({ addresses: state.addresses.map((x) => (x.id === a.id ? a : x)) })),
  removeAddress: (id: string) =>
    set((state) => ({ addresses: state.addresses.filter((x) => x.id !== id) })),
}));

export default useStore;
