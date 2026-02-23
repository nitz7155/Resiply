import Header from "@/components/layout/Header";
import Navigation from "@/components/layout/Navigation";
import Footer from "@/components/layout/Footer";
import HeroSection from "@/components/sections/HeroSection";
import FeaturedProducts from "@/components/sections/FeaturedProducts";
import PopularRecipes from "@/components/sections/PopularRecipes";
import AIMealPlanner from "@/components/sections/AIMealPlanner";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import ChatbotButton from "@/components/ui/ChatbotButton";

const Index = () => {
  const location = useLocation();
  const [tab, setTab] = useState<"home" | "ai">("home");

  useEffect(() => {
    if (location.hash === "#ai-recommendation") setTab("ai");
    else setTab("home");
  }, [location.hash]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Navigation />

      <main>
        {tab === "home" ? (
          <>
            <HeroSection />
            <FeaturedProducts />
            <PopularRecipes />
          </>
        ) : (
          <div className="mt-6">
            <AIMealPlanner />
          </div>
        )}
      </main>
      <Footer />
      <ChatbotButton />
    </div>
  );
};

export default Index;
