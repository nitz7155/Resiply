import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/home/Index";
import Login from "./pages/auth/Login";
import KakaoCallback from "./pages/auth/KakaoCallback";
import ProtectedRoute from "./components/ProtectedRoute";
import MyPageLayout from "./pages/mypage/layout/MyPageLayout";
import CouponsPage from "./pages/mypage/rewards/CouponsPage";
import PointsPage from "./pages/mypage/rewards/PointsPage";
import OrderPage from "./pages/mypage/orders/OrderPage";
import OrderDetailPage from "./pages/mypage/orders/OrderDetailPage";
import OverviewPage from "./pages/mypage/overview/OverviewPage";
import WishlistPage from "./pages/mypage/wishlist/WishlistPage";
import RecipesPage from "./pages/mypage/recipes/RecipesPage";
import ReviewPage from "./pages/mypage/review/Review";
import ReviewWrite from "./pages/mypage/review/ReviewWrite";
import CancelReturnPage from "./pages/mypage/orders/CancelReturnPage";
import FrequentPage from "./pages/mypage/orders/FrequentPage";
import AddressPage from "./pages/mypage/profile/AddressPage";
import CartPage from "./pages/store/Cart";
import Checkout from "./pages/store/Checkout";
import OrderConfirmation from "./pages/store/OrderConfirmation";
import Chat from "./pages/chat/Chat";
import Store from "./pages/store/Store";
import Category from "./pages/store/Category";
import Recipes from "./pages/recipes/Recipes";
import RecipeDetail from "./pages/recipes/RecipeDetail";
import TipDetail from "./pages/recipes/TipDetail";
import SearchResults from "./pages/search/SearchResults";
import SearchFull from "./pages/search/SearchFull";
import ProductDetail from "./pages/store/ProductDetail";
import NotFound from "./pages/common/NotFound";
import { AuthProvider } from "./lib/AuthContext";
import { CategoryProvider } from "./lib/CategoryContext";
import Calender from "./pages/calendar/Calendar";
import ProfileEdit from "./pages/mypage/profile/ProfileEdit";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <CategoryProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/store" element={<Store />} />
              <Route path="/store/category/:id" element={<Category />} />
              <Route path="/recipes" element={<Recipes />} />
              <Route path="/recipes/:id" element={<RecipeDetail />} />
              <Route path="/tips/:id" element={<TipDetail />} />
              <Route path="/product/:id" element={<ProductDetail />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/search" element={<SearchResults />} />
              <Route path="/search/full" element={<SearchFull />} />
              <Route path="/login" element={<Login />} />
              <Route path="/callback" element={<KakaoCallback />} />
              <Route path="/mypage" element={<ProtectedRoute element={<MyPageLayout />} />}>
                {/* /mypage 진입 시 주문내역 */}
                <Route index element={<ProfileEdit />} />
                {/* 개요 페이지는 별도 */}
                <Route path="overview" element={<OverviewPage />} />
                {/* 나머지 페이지들 */}
                <Route path="coupons" element={<CouponsPage />} />
                <Route path="points" element={<PointsPage />} />
                <Route path="order" element={<OrderPage />} />
                <Route path="orders/:orderId" element={<OrderDetailPage />} />
                <Route path="wishlist" element={<WishlistPage />} />
                <Route path="recipes" element={<RecipesPage />} />
                <Route path="cancel-return" element={<CancelReturnPage />} />
                <Route path="review" element={<ReviewPage />} />
                <Route path="review/new" element={<ReviewWrite />} />
                <Route path="frequent" element={<FrequentPage />} />
                <Route path="address" element={<AddressPage />} />
                <Route path="calendar" element={<Calender />} />
                <Route path="edit" element={<ProfileEdit />} />
              </Route>
              <Route path="/cart" element={<CartPage />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/order/:orderId" element={<OrderConfirmation />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </CategoryProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
