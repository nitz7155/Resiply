import { create } from "zustand";

type PersistedCartState = Pick<CartState, "items" | "selectedIds">;

const CART_STORAGE_KEY = "resiply.cart.v1";
const EMPTY_CART_STATE: PersistedCartState = { items: [], selectedIds: [] };
let cartPersistenceBound = false;

const readCartFromStorage = (): PersistedCartState => {
  if (typeof window === "undefined") return EMPTY_CART_STATE;
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return EMPTY_CART_STATE;
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.items)
      ? parsed.items
          .filter((item) => item && item.id)
          .map((item) => ({
            ...item,
            id: String(item.id),
            quantity:
              typeof item.quantity === "number" && item.quantity > 0
                ? item.quantity
                : 1,
          }))
      : [];
    const selectedIds = Array.isArray(parsed?.selectedIds)
      ? parsed.selectedIds.map((id: unknown) => String(id))
      : [];
    return { items, selectedIds };
  } catch {
    return EMPTY_CART_STATE;
  }
};

const persistCartToStorage = (state: PersistedCartState) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage quota errors
  }
};

export type CartItem = {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl: string;
  price: number;
  originalPrice?: number;
  quantity: number;
  isCold?: boolean;
};

type CartState = {
  items: CartItem[];
  selectedIds: string[];

  // selectors (computed-like helper)
  getCartCount: () => number;
  getSelectedItems: () => CartItem[];

  // actions
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  removeItem: (id: string) => void;
  clear: () => void;

  setQuantity: (id: string, quantity: number) => void;
  inc: (id: string) => void;
  dec: (id: string) => void;

  toggleSelect: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  removeSelected: () => void;
};

const initialCartState = readCartFromStorage();

export const useCartStore = create<CartState>((set, get) => ({
  items: initialCartState.items,
  selectedIds: initialCartState.selectedIds,

  getCartCount: () => get().items.reduce((acc, it) => acc + it.quantity, 0),

  getSelectedItems: () => {
    const { items, selectedIds } = get();
    const sel = new Set(selectedIds);
    return items.filter((i) => sel.has(i.id));
  },

  addItem: (item, quantity = 1) => {
    set((state) => {
      const exists = state.items.find((x) => x.id === item.id);
      if (exists) {
        const next = state.items.map((x) =>
          x.id === item.id ? { ...x, quantity: x.quantity + quantity } : x
        );
        // 이미 선택되어 있으면 그대로, 아니면 선택에 포함
        const selected = state.selectedIds.includes(item.id)
          ? state.selectedIds
          : [...state.selectedIds, item.id];
        return { items: next, selectedIds: selected };
      }

      return {
        items: [...state.items, { ...item, quantity }],
        selectedIds: [...state.selectedIds, item.id], // 새로 담으면 기본 선택
      };
    });
  },

  removeItem: (id) => {
    set((state) => ({
      items: state.items.filter((x) => x.id !== id),
      selectedIds: state.selectedIds.filter((x) => x !== id),
    }));
  },

  clear: () => set({ items: [], selectedIds: [] }),

  setQuantity: (id, quantity) => {
    if (quantity < 1) return;
    set((state) => ({
      items: state.items.map((x) => (x.id === id ? { ...x, quantity } : x)),
    }));
  },

  inc: (id) => {
    const { items, setQuantity } = get();
    const it = items.find((x) => x.id === id);
    if (!it) return;
    setQuantity(id, it.quantity + 1);
  },

  dec: (id) => {
    const { items, setQuantity } = get();
    const it = items.find((x) => x.id === id);
    if (!it) return;
    setQuantity(id, it.quantity - 1);
  },

  toggleSelect: (id) => {
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((x) => x !== id)
        : [...state.selectedIds, id],
    }));
  },

  selectAll: () => {
    const ids = get().items.map((x) => x.id);
    set({ selectedIds: ids });
  },

  clearSelection: () => set({ selectedIds: [] }),

  removeSelected: () => {
    set((state) => {
      const sel = new Set(state.selectedIds);
      return {
        items: state.items.filter((x) => !sel.has(x.id)),
        selectedIds: [],
      };
    });
  },
}));

if (typeof window !== "undefined" && !cartPersistenceBound) {
  cartPersistenceBound = true;
  useCartStore.subscribe((state) => {
    persistCartToStorage({ items: state.items, selectedIds: state.selectedIds });
  });
}
