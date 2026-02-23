from typing import List, Optional, Dict, Any, TypedDict
from pydantic import BaseModel, Field, model_validator

class CartItem(BaseModel):
    id: str
    title: str
    price: int
    imageUrl: Optional[str] = None
    quantity: int = 1

class RecommendationRequest(BaseModel):
    period: str
    meals: List[str] = Field(default_factory=list)
    ingredients: List[str] = Field(default_factory=list)
    request: Optional[str] = None

class MealSlot(BaseModel):
    meal_type: str = Field(description="Must be one of: '아침', '점심', '저녁'.")
    recipe_name: str = Field(description="Exact name of the recipe.")

    @model_validator(mode='before')
    @classmethod
    def fix_llm_keys(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # 1. 키 이름 보정 (기존 코드)
            if 'meal_type' not in data:
                if 'time' in data: data['meal_type'] = data.pop('time')
                elif 'type' in data: data['meal_type'] = data.pop('type')

            if 'recipe_name' not in data:
                if 'name' in data: data['recipe_name'] = data.pop('name')
                elif 'menu' in data: data['recipe_name'] = data.pop('menu')
                elif 'food' in data: data['recipe_name'] = data.pop('food')

            # 2. [추가] 값(Value) 보정: 'main' -> '점심' 강제 변환
            current_type = data.get('meal_type', '')
            if isinstance(current_type, str):
                if current_type.lower() in ['main', '메인', 'lunch']:
                    data['meal_type'] = '점심'
                elif current_type.lower() in ['dinner', '저녁']:
                    data['meal_type'] = '저녁'
                elif current_type.lower() in ['breakfast', '아침']:
                    data['meal_type'] = '아침'

        return data

class DailyPlan(BaseModel):
    day: int = Field(description="Day number.")
    meals: List[MealSlot] = Field(description="List of meals.")

class MealPlanOutput(BaseModel):
    meal_plan: List[DailyPlan]

class RecipeCandidate(BaseModel):
    id: int
    name: str
    ingredient: Optional[str] = None
    thumbnail: Optional[str] = None
    price: Optional[int] = 0

class PlanRecipeInfo(BaseModel):
    id: Optional[int] = None
    name: str
    thumbnail: Optional[str] = None
    ingredient: Optional[str] = None
    price: Optional[int] = 0

class DailyPlanResponse(BaseModel):
    day: int
    # [NEW] LLM이 특정 날짜를 인식했다면 "YYYY-MM-DD" 형태로 반환하도록 필드 추가
    date_str: Optional[str] = Field(None, description="YYYY-MM-DD format if specific date is mentioned.")
    meals: Dict[str, PlanRecipeInfo]

class ChatRequest(BaseModel):
    member_id: int = Field(description="Member ID of the user sending the chat")
    user_message: str
    current_plan: List[DailyPlanResponse] = Field(default_factory=list, description="현재 화면에 표시된 식단 데이터")
    new_chat: bool = Field(default=False, description="If true, backend should create a new ChatLog instead of reusing the latest one")
    plan_message_id: Optional[int] = Field(default=None, description="assistant_message_id of the latest plan_update message")
    chat_log_id: Optional[int] = Field(default=None, description="Existing chat log/thread ID to continue")

class ChatResponse(BaseModel):
    response_type: str = Field(description="'chat', 'plan_update', 'cart_add', 'checkout', 'calendar_conflict'")
    message: str = Field(description="AI의 답변 텍스트")
    updated_plan: Optional[List[DailyPlanResponse]] = Field(default=None, description="수정된 식단 데이터")
    cart_items: Optional[List[CartItem]] = Field(default=None, description="장바구니 추가용 상품 리스트")
    assistant_message_id: Optional[int] = Field(default=None, description="DB id of assistant ChatMessage when created")
    plan_kind: Optional[str] = Field(default=None, description="'current' or 'preview' when updated_plan is provided")
    chat_log_id: Optional[int] = Field(default=None, description="ChatLog thread ID for this conversation")

class RecommendationResponse(BaseModel):
    query: str
    best_match: Dict[str, Any]
    meal_plan: List[DailyPlanResponse] = []
    candidates: List[RecipeCandidate]
    assistant_message_id: Optional[int] = Field(None, description="DB saved assistant message ID")

class IntentAnalysis(BaseModel):
    intent_type: str = Field(description="'chat', 'delete', 'modify', 'cart_add', 'checkout', 'show_plan', 'show_calendar', 'show_calendar_range', 'plan_delete', 'calendar_delete', 'ask_plan_details', 'calendar_register'")
    requires_search: bool
    is_new_session: bool = Field(default=False, description="True if user wants a BRAND NEW recommendation ignoring previous plan.")
    reason: str

class AgentResponse(BaseModel):
    action: str = Field(description="'chat' or 'update'")
    reply_message: str
    new_plan: Optional[List[DailyPlan]] = None

class ChatState(TypedDict):
    user_message: str
    current_plan_context: str
    requires_search: bool
    retrieved_recipes: List[dict]
    agent_response: Optional[AgentResponse]

class RecState(TypedDict):
    user_query: str
    period_days: int
    target_meals: List[str]
    candidate_limit: int
    retrieved_recipes: List[dict]
    final_plan: Optional[MealPlanOutput]

class AgentState(TypedDict):
    # Input Data
    user_message: str
    current_plan: List[DailyPlanResponse]
    db_session: Any  # Session 객체
    member_id: int
    calendar_date: Optional[str]
    calendar_range: Optional[Any]
    delete_meals: Optional[List[str]]
    plan_delete_day_map: Optional[Dict[int, List[str]]]
    plan_delete_days: Optional[List[int]]
    plan_delete_meals: Optional[List[str]]
    chat_log_id: Optional[int]
    plan_message_id: Optional[int]
    chat_history: Optional[List[Dict[str, str]]]

    # Internal Logic Data
    intent: Optional[IntentAnalysis]
    retrieved_recipes: List[dict]

    # Control Flow Data
    retry_count: int  # [NEW] 재시도 횟수

    # Final Output
    final_response: Optional[ChatResponse]

class AnalyzeReq(BaseModel):
    product_id: int
