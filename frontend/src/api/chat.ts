export type RecipeInfo = {
  id?: number | null;
  name: string;
  ingredient?: string | null;
  thumbnail?: string | null;
  price?: number;
};

export type DailyPlan = {
  day: number;
  date_str?: string | null;
  meals: Record<string, RecipeInfo>;
};

export type BackendCartItem = {
  id: string;
  title: string;
  price: number;
  imageUrl?: string | null;
  quantity?: number;
};

export type ChatResponse = {
  response_type: "chat" | "plan_update" | "cart_add" | "checkout" | "calendar_conflict";
  message: string;
  updated_plan?: DailyPlan[] | null;
  cart_items?: BackendCartItem[] | null;
  assistant_message_id?: number;
  plan_kind?: "current" | "preview";
  chat_log_id?: number;
};

export type Message = {
  role: "user" | "assistant";
  text?: string;
  recipe?: RecipeInfo;
  plan?: DailyPlan[];
  cartItems?: BackendCartItem[];
  assistant_message_id?: number;
  planKind?: "current" | "preview";
};

export type Thread = {
  id: string;
  title?: string;
  messages: Message[];
  chatLogId?: number;
};

export type RecommendationResponse = {
  query: string;
  best_match: RecipeInfo;
  meal_plan: DailyPlan[];
  candidates: RecipeInfo[];
  assistant_message_id?: number;
};

export type NavState = {
  period: string;
  meals?: string[];
  ingredients?: string[];
  request?: string | null;
  recommendation?: RecommendationResponse | null;
  newChat?: boolean;
};

export default {} as const;
