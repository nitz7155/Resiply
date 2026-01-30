import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroBanner from "@/assets/hero-banner.jpg";
import { useNavigate } from "react-router-dom";


const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <section className="relative overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src={heroBanner}
          alt="신선한 식자재들"
          className="w-full h-full object-cover"
        />

        {/* ✅ 모바일에서만 오버레이 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent sm:hidden" />
      </div>

      {/* Content */}
      <div className="relative container mx-auto px-4 lg:px-8 py-16 md:py-24 lg:py-32">
        <div className="flex flex-col items-center sm:flex-row sm:justify-end">
          <div className="hidden sm:block max-w-xl text-right">

            {/* Headline */}
            <h1
              className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4 animate-fade-in"
              style={{ animationDelay: "0.1s", lineHeight: 1.2 }}
            >
              1인 가구를 위한
              <br />
              <span className="text-primary">스마트 식자재</span>,
              <br />
              오늘의 추천 레시피와 함께
            </h1>

            {/* Subtitle */}
            <p className="text-lg md:text-xl text-foreground sm:text-muted-foreground mb-8 animate-fade-in" style={{ animationDelay: "0.2s" }}>
              간편하게 요리하고, 똑똑하게 주문하세요
            </p>

            {/* CTA Button */}
            <div className="flex gap-4 justify-end flex-col sm:flex-row animate-fade-in" style={{ animationDelay: "0.3s" }}>
              <Button variant="outline" size="xl" className="order-2" onClick={() => navigate("/store")}>
                식자재 둘러보기
              </Button>
              <Button variant="hero" size="xl" className="group order-1" onClick={() => navigate("#ai-recommendation")}>
                <Sparkles className="h-5 w-5 group-hover:animate-pulse" />
                AI 식단 추천 받기
              </Button>
            </div>
          </div>
          {/* ✅ 모바일 전용(카드형) */}
          <div className="w-full sm:hidden">
            <div className="bg-white/85 backdrop-blur-md rounded-2xl p-5 shadow-sm text-center">
            <div className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-[12px] font-medium text-primary mb-3">
              오늘의 추천 레시피와 함께
            </div>
            <h1 className="text-[21px] font-extrabold tracking-tight leading-snug text-foreground mb-2">
              1인 가구도 <span className="text-primary">든든하게</span>
            </h1>

              <p className="text-sm text-muted-foreground mb-5">
                오늘은 뭐 해먹을지 고민 말고, 여기서 골라요
              </p>

              <div className="flex flex-col gap-2 animate-fade-in" style={{ animationDelay: "0.3s" }}>
                <Button variant="hero" size="xl" className="h-11 w-full text-sm font-semibold" onClick={() => navigate("#ai-recommendation")}>
                  <Sparkles className="h-5 w-5 group-hover:animate-pulse" />
                  AI 식단 추천 받기
                </Button>
                <Button variant="outline" size="xl" className="h-11 w-full text-sm font-semibold" onClick={() => navigate("/store")}>
                  식자재 둘러보기
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
