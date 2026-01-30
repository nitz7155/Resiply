import { useNavigate } from "react-router-dom";
import { ChefHat } from "lucide-react";

const ChatbotButton = () => {
  const navigate = useNavigate();

  return (
    <button
      aria-label="Open chatbot"
      onClick={() => navigate("/chat", { state: { newChat: true } })}
      className="
        fixed right-6 z-50 flex items-center justify-center
        w-14 h-14 rounded-full bg-primary text-primary-foreground
        shadow-lg hover:scale-105 transition-transform
        bottom-[calc(env(safe-area-inset-bottom)+80px)] sm:bottom-6
      "
    >
    <ChefHat className="w-6 h-6 text-white" />
    </button>
  );
};

export default ChatbotButton;
