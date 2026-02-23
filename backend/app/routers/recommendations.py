import base64
import os
import json
import re
import random
from collections import defaultdict
import httpx
import voyageai
import requests
from datetime import date, timedelta, datetime
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Literal, Dict, Optional, Tuple, Any
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, BaseMessage
from langchain_community.chat_message_histories import ChatMessageHistory
from langgraph.graph import StateGraph, END
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from pydantic import SecretStr
from database import get_db
from models import Recipe, RecipeProduct, Member, ChatLog, ChatMessage, AiMeal, MealCalendar, Product
from schemas.recommendations import (
    RecommendationRequest, RecommendationResponse, ChatRequest, ChatResponse, DailyPlanResponse,
    CartItem, PlanRecipeInfo, MealPlanOutput, IntentAnalysis, AgentState, RecState, AnalyzeReq
)

# 라우터 설정
router = APIRouter(prefix="/api/recommendations", tags=["Recommendations"])

# Voyage 임베딩 설정
VOYAGE_API_KEY = os.getenv("EMBEDDING_API_KEY")
voyage_client = voyageai.Client(api_key=VOYAGE_API_KEY)

###########################################################
# 기존 OpenAPI 방식
###########################################################
# CUSTOM_API_KEY = os.getenv("LLM_API_KEY")
# CUSTOM_BASE_URL = os.getenv("LLM_BASE_URL")
# CUSTOM_MODEL_NAME = "gemini-3-flash-preview"
# llm = ChatOpenAI(
#     api_key=CUSTOM_API_KEY,
#     base_url=CUSTOM_BASE_URL,
#     model=CUSTOM_MODEL_NAME,
#     temperature=0
# )

###########################################################
# 깃헙 코파일럿 기반 및 스케줄러
###########################################################
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
ACCESS_TOKEN = SecretStr("")
llm = None

async def get_copilot_token():
    global ACCESS_TOKEN, llm
    url = "https://api.github.com/copilot_internal/v2/token"
    headers = {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Editor-Version": "vscode/1.85.0",
        "Editor-Plugin-Version": "copilot/1.143.0",
        "User-Agent": "GitHubCopilot/1.143.0"
    }
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            ACCESS_TOKEN = data.get("token")

            llm = ChatOpenAI(
                api_key=ACCESS_TOKEN,
                model="gpt-4.1",
                base_url="https://api.githubcopilot.com",
                temperature=0,
                default_headers={
                    "Authorization": f"Bearer {ACCESS_TOKEN}",
                    "Editor-Version": "vscode/1.85.0",
                    "Editor-Plugin-Version": "copilot/1.143.0",
                    "User-Agent": "GitHubCopilot/1.143.0",
                    "Copilot-Vision-Request": "true"
                }
            )
            print(f"✅ 토큰 갱신 및 LLM 객체 재생성 완료!")
        else:
            print(f"❌ 토큰 발급 실패: {response.status_code}")
    except Exception as e:
        print(f"❌ 에러 발생: {e}")

scheduler = AsyncIOScheduler(timezone="Asia/Seoul")

def start_scheduler():
    scheduler.add_job(get_copilot_token, 'date')
    scheduler.add_job(
        get_copilot_token,
        CronTrigger(minute='*/50'),
        id="get_token_scheduler",
        replace_existing=True
    )
    scheduler.start()

def shutdown_scheduler():
    scheduler.shutdown()

###########################################################
def llm_invoke_json(
    prompt: str,
    system: Optional[str] = "Output JSON only.",
    history_messages: Optional[List[BaseMessage]] = None
) -> Optional[dict]:
    try:
        msgs: List[BaseMessage] = []
        if system:
            msgs.append(SystemMessage(content=system))
        if history_messages:
            msgs.extend(history_messages)
        msgs.append(HumanMessage(content=prompt))
        response = llm.invoke(msgs)
        return parse_json_garbage(response.content)
    except Exception as e:
        print(f"LLM invoke error: {e}")
        return None


def llm_invoke_raw(
    prompt: str,
    system: Optional[str] = None,
    history_messages: Optional[List[BaseMessage]] = None
) -> Optional[str]:
    try:
        msgs: List[BaseMessage] = []
        if system:
            msgs.append(SystemMessage(content=system))
        if history_messages:
            msgs.extend(history_messages)
        msgs.append(HumanMessage(content=prompt))
        response = llm.invoke(msgs)
        return response.content
    except Exception as e:
        print(f"LLM invoke raw error: {e}")
        return None


async def llm_ainvoke_raw(
    prompt: str,
    system: Optional[str] = None,
    history_messages: Optional[List[BaseMessage]] = None
) -> Optional[str]:
    try:
        msgs: List[BaseMessage] = []
        if system:
            msgs.append(SystemMessage(content=system))
        if history_messages:
            msgs.extend(history_messages)
        msgs.append(HumanMessage(content=prompt))
        response = await llm.ainvoke(msgs)
        return response.content
    except Exception as e:
        print(f"LLM async invoke error: {e}")
        return None


CHAT_MEMORY_LIMIT = 12

def load_chat_history_payload(
    db: Session,
    chat_log_id: Optional[int],
    limit: int = CHAT_MEMORY_LIMIT
) -> List[Dict[str, str]]:
    if not db or not chat_log_id:
        return []

    messages = db.query(ChatMessage) \
        .filter(ChatMessage.chat_log_id == chat_log_id) \
        .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc()) \
        .all()

    serialized = [
        {
            "role": (msg.role or "user"),
            "content": msg.content or ""
        }
        for msg in messages
    ]

    if serialized and serialized[-1]["role"] == "user":
        serialized = serialized[:-1]

    if limit and len(serialized) > limit:
        serialized = serialized[-limit:]

    return serialized


def to_langchain_history_messages(
    history_payload: Optional[List[Dict[str, str]]],
    limit: int = CHAT_MEMORY_LIMIT
) -> List[BaseMessage]:
    if not history_payload:
        return []

    history = ChatMessageHistory()
    trimmed = history_payload[-limit:] if limit else history_payload

    for item in trimmed:
        role = (item.get("role") or "user").lower()
        content = item.get("content") or ""
        if role == "assistant":
            history.add_ai_message(content)
        else:
            history.add_user_message(content)

    return history.messages

# ==========================================
# [Helpers] Common Logic
# ==========================================

def extract_calendar_date(user_msg: str, today: date) -> Optional[date]:
    if not user_msg or "식단" not in user_msg:
        return None

    if re.search(r"\d+\s*일\s*치", user_msg):
        return None

    return _parse_date_core(user_msg, today)
    
def get_week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())

def extract_calendar_range(user_msg: str, today: date) -> Optional[Tuple[date, date]]:
    if not user_msg:
        return None

    if "오늘" in user_msg:
        return (today, today)
    if "내일" in user_msg:
        t = today + timedelta(days=1)
        return (t, t)

    if re.search(r"지난\s*주|저번\s*주", user_msg):
        start = get_week_start(today) - timedelta(days=7)
        end = start + timedelta(days=6)
        return (start, end)
    if re.search(r"이번\s*주|금주", user_msg):
        start = get_week_start(today)
        end = start + timedelta(days=6)
        return (start, end)
    if re.search(r"다음\s*주|차주", user_msg):
        start = get_week_start(today) + timedelta(days=7)
        end = start + timedelta(days=6)
        return (start, end)

    m = re.search(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s*(?:~|–|—|-|부터)\s*(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})", user_msg)
    if m:
        y1, mo1, d1, y2, mo2, d2 = map(int, m.groups())
        try:
            return (date(y1, mo1, d1), date(y2, mo2, d2))
        except ValueError:
            return None

    m = re.search(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s*부터\s*(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s*까지", user_msg)
    if m:
        y1, mo1, d1, y2, mo2, d2 = map(int, m.groups())
        try:
            return (date(y1, mo1, d1), date(y2, mo2, d2))
        except ValueError:
            return None

    m = re.search(r"(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:~|–|—|-|부터)\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일", user_msg)
    if m:
        mo1, d1, mo2, d2 = map(int, m.groups())
        try:
            return (date(today.year, mo1, d1), date(today.year, mo2, d2))
        except ValueError:
            return None

    m = re.search(r"(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:~|–|—|-|부터)\s*(\d{1,2})\s*일", user_msg)
    if m:
        mo, d1, d2 = map(int, m.groups())
        try:
            return (date(today.year, mo, d1), date(today.year, mo, d2))
        except ValueError:
            return None

    m = re.search(r"(\d{1,2})\s*일\s*(?:~|–|—|-|부터)\s*(\d{1,2})\s*일", user_msg)
    if m:
        d1, d2 = map(int, m.groups())
        try:
            return (date(today.year, today.month, d1), date(today.year, today.month, d2))
        except ValueError:
            return None

    if "식단" in user_msg:
        m = re.search(r"(?<!\d)(\d{1,2})\s*(?:~|–|—|-)\s*(\d{1,2})(?!\d)", user_msg)
        if m:
            d1, d2 = map(int, m.groups())
            try:
                return (date(today.year, today.month, d1), date(today.year, today.month, d2))
            except ValueError:
                return None

    single = extract_calendar_date(user_msg, today)
    if single:
        return (single, single)

    return None

def parse_calendar_range_with_llm(user_msg: str, today: date) -> Optional[Tuple[date, date]]:
    if not user_msg:
        return None

    prompt = f"""
    Today is {today.isoformat()}.
    Extract a date range from the user's message.

    Rules:
    - If the user mentions a single date (e.g., "오늘", "1월 16일"), return the same start_date and end_date.
    - If the user mentions "지난주", "이번주", "다음주", map it to Monday-Sunday of that week.
    - If only day numbers are given (e.g., "16~20" or "16일~20일"), use the current month/year.
    - If only month/day is given, use the current year.
    - If no valid date range is mentioned, return nulls.

    Output JSON only with schema:
    {{ "start_date": "YYYY-MM-DD" | null, "end_date": "YYYY-MM-DD" | null }}

    User: "{user_msg}"
    """

    try:
        data = llm_invoke_json(prompt)
        if not isinstance(data, dict):
            return None
        start_str = data.get("start_date")
        end_str = data.get("end_date")
        if not start_str or not end_str:
            return None
        try:
            start = datetime.strptime(start_str, "%Y-%m-%d").date()
            end = datetime.strptime(end_str, "%Y-%m-%d").date()
            return (start, end)
        except ValueError:
            return None
    except Exception as e:
        print(f"LLM range parse error: {e}")
        return None

def extract_date_from_text(user_msg: str, today: date) -> Optional[date]:
    if not user_msg:
        return None
    # avoid interpreting duration as date
    if re.search(r"\d+\s*일\s*치", user_msg) or re.search(r"(하루|이틀|사흘|나흘|닷새|엿새|이레)\s*치", user_msg):
        return None

    return _parse_date_core(user_msg, today)


def _parse_date_core(user_msg: str, today: date) -> Optional[date]:
    """Core date parsing shared by calendar/date extractors.

    Handles:
    - "오늘", "내일"
    - YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD
    - MM.DD / M/D without year -> current year
    - "DD일" with optional year/month -> fallback to current year/month
    """
    if not user_msg:
        return None

    if "오늘" in user_msg:
        return today
    if "내일" in user_msg:
        return today + timedelta(days=1)

    # YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD
    m = re.search(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})", user_msg)
    if m:
        y, mo, d = map(int, m.groups())
        try:
            return date(y, mo, d)
        except ValueError:
            return None

    # MM.DD or M/D without year
    md = re.search(r"(?<!\d)(\d{1,2})[-/.](\d{1,2})(?!\d)", user_msg)
    if md:
        mo, d = map(int, md.groups())
        try:
            return date(today.year, mo, d)
        except ValueError:
            return None

    day_match = re.search(r"(\d{1,2})\s*일(?!치)", user_msg)
    if not day_match:
        return None

    day_num = int(day_match.group(1))
    year_match = re.search(r"(\d{4})\s*년", user_msg)
    month_match = re.search(r"(\d{1,2})\s*월", user_msg)

    year_num = int(year_match.group(1)) if year_match else today.year
    month_num = int(month_match.group(1)) if month_match else today.month

    try:
        return date(year_num, month_num, day_num)
    except ValueError:
        return None

def parse_date_with_llm(user_msg: str, today: date) -> Optional[date]:
    if not user_msg:
        return None

    prompt = f"""
    Today is {today.isoformat()}.
    Extract a date from the user's message.

    Rules:
    - If only a day number is given (e.g., "16"), use the current month/year.
    - If only month/day is given (e.g., "5/16" or "5.16" or "5-16"), use the current year.
    - If a full date is given, use it as-is.
    - If no valid date is mentioned, return null.

    Output JSON only with schema:
    {{ "date_str": "YYYY-MM-DD" | null }}

    User: "{user_msg}"
    """

    try:
        data = llm_invoke_json(prompt)
        date_str = data.get("date_str") if isinstance(data, dict) else None
        if not date_str:
            return None
        try:
            return datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return None
    except Exception as e:
        print(f"LLM date parse error: {e}")
        return None

def parse_plan_days(user_msg: str) -> Optional[int]:
    if not user_msg:
        return None

    korean_map = {
        "하루": 1,
        "이틀": 2,
        "사흘": 3,
        "나흘": 4,
        "닷새": 5,
        "엿새": 6,
        "이레": 7,
        "일주일": 7
    }
    for k, v in korean_map.items():
        if k in user_msg:
            return v

    m = re.search(r"(\d+)\s*일\s*(치|간|동안)", user_msg)
    if m:
        return int(m.group(1))

    if re.search(r"(\d+)\s*일(?!치)", user_msg) and re.search(r"끼니|식단|아침|점심|저녁", user_msg):
        m2 = re.search(r"(\d+)\s*일(?!치)", user_msg)
        if m2:
            return int(m2.group(1))

    meal_count = parse_meal_count_with_llm(user_msg)
    if meal_count in [1, 2, 3, 4]:
        return 1

    return None

def parse_plan_meals(user_msg: str) -> List[str]:
    if not user_msg:
        return []

    meals = []
    for m in ["아침", "점심", "저녁"]:
        if m in user_msg:
            meals.append(m)

    if meals:
        return meals

    if re.search(r"세\s*끼|모든\s*끼니|전체\s*끼니|전부|전체", user_msg):
        return ["아침", "점심", "저녁"]

    if re.search(r"(\d+|n)\s*일\s*치", user_msg, re.IGNORECASE):
        return ["아침", "점심", "저녁"]

    return []

def parse_meal_count_with_llm(user_msg: str) -> Optional[int]:
    if not user_msg or "끼" not in user_msg:
        return None

    prompt = f"""
    Extract the meal count if the user mentions it (e.g., 한끼, 두끼, 세끼, 네끼, 1끼, 2끼, 3끼, 4끼).
    User: "{user_msg}"

    Output JSON only with schema:
    {{ "meal_count": 1|2|3|4|null }}

    Rules:
    - If the text does not specify a meal count, return null.
    - Only return 1, 2, 3, or 4 for meal_count.
    """

    try:
        data = llm_invoke_json(prompt)
        if isinstance(data, dict):
            count = data.get("meal_count")
            if isinstance(count, int) and count in [1, 2, 3, 4]:
                return count
        return None
    except Exception as e:
        print(f"LLM meal count parse error: {e}")
        return None

def parse_day_specific_meals(user_msg: str) -> Dict[int, List[str]]:
    if not user_msg:
        return {}

    if not ("일" in user_msg or "째" in user_msg or "하루" in user_msg):
        return {}

    prompt = f"""
    Extract day-specific meal constraints from the user's request.
    User: "{user_msg}"

    Output JSON only with schema:
    {{
      "day_meals": [
        {{ "day": 1, "meals": ["아침"] }}
      ]
    }}

    Rules:
    - Recognize expressions like: "1일차", "첫째날", "둘째날", "하루는", "다음날".
    - If a day is mentioned without meals, omit it.
    - Meals must be among: "아침", "점심", "저녁".
    - If nothing can be extracted, return {{"day_meals": []}}.
    """

    try:
        data = llm_invoke_json(prompt)
        items = data.get("day_meals", []) if isinstance(data, dict) else []

        result: Dict[int, List[str]] = {}
        for it in items:
            day_num = int(it.get("day", 0)) if isinstance(it, dict) else 0
            meals = [m for m in (it.get("meals") or []) if m in ["아침", "점심", "저녁"]]
            if day_num > 0 and meals:
                result[day_num] = meals

        return result
    except Exception as e:
        print(f"LLM day-specific parse error: {e}")
        return {}

def parse_plan_delete_targets(user_msg: str) -> Tuple[Dict[int, List[str]], List[int], List[str]]:
    """Use LLM to extract plan-day meal deletions, whole-day deletions, and global meal deletions."""
    if not user_msg:
        return {}, [], []

    prompt = f"""
    Analyze the user's request about removing meals from the CURRENTLY RECOMMENDED meal plan (not the saved calendar).
    Output JSON only with schema:
    {{
      "day_meals": [ {{ "day": 1, "meals": ["아침", "저녁"] }} ],
      "full_days": [2],
      "global_meals": ["저녁"]
    }}

    Rules:
    - Recognize Korean ordinals (첫째날, 둘째날, etc.) and numeric forms ("1일차", "2일째"). Convert them to 1-based integers.
    - `day_meals`: use when the user specifies particular meals for specific days. Example: "1일차 저녁만 삭제" => {{"day":1,"meals":["저녁"]}}.
    - `full_days`: include a day only if the user clearly wants the ENTIRE day removed (keywords like 전체, 전부, 다, 모두, 통째로, all day, whole day).
    - `global_meals`: use when the user wants a meal removed from ALL days (e.g., "저녁은 다 빼줘").
    - Meals must be chosen from ["아침", "점심", "저녁"]. Ignore anything else.
    - If nothing applies, return empty arrays.

    User message: "{user_msg}"
    """

    try:
        data = llm_invoke_json(prompt)
        day_meals_raw = data.get("day_meals", []) if isinstance(data, dict) else []
        full_days_raw = data.get("full_days", []) if isinstance(data, dict) else []
        global_meals_raw = data.get("global_meals", []) if isinstance(data, dict) else []

        allowed = {"아침", "점심", "저녁"}
        day_map: Dict[int, List[str]] = {}
        for item in day_meals_raw:
            if not isinstance(item, dict):
                continue
            day = item.get("day")
            meals = [m for m in item.get("meals", []) if isinstance(m, str) and m in allowed]
            try:
                day_int = int(day)
            except (TypeError, ValueError):
                continue
            if day_int <= 0 or not meals:
                continue
            day_map[day_int] = meals

        full_days: List[int] = []
        for value in full_days_raw:
            try:
                d = int(value)
            except (TypeError, ValueError):
                continue
            if d > 0:
                full_days.append(d)

        global_meals = [m for m in global_meals_raw if isinstance(m, str) and m in allowed]
        return day_map, full_days, global_meals
    except Exception as e:
        print(f"LLM plan delete parse error: {e}")
        return {}, [], []

def is_plan_request_message(user_msg: str) -> bool:
    if not user_msg:
        return False
    return bool(re.search(r"식단\s*추천|식단\s*짜|식단\s*부탁|식단\s*추천해줘|식단\s*추천해\s*줘", user_msg)) or "식단" in user_msg

def is_calendar_show_request(user_msg: str) -> bool:
    if not user_msg:
        return False
    if re.search(r"추천|짜|만들어|구성|계획", user_msg):
        return False
    if re.search(r"(등록된|저장된)\s*식단", user_msg):
        return True
    if re.search(r"(식단|캘린더|달력)\s*(보여|조회|확인|열람|알려|보고)", user_msg):
        return True
    if re.search(r"(지난\s*주|저번\s*주|이번\s*주|다음\s*주)\s*(식단|캘린더|달력)", user_msg):
        return True
    if "오늘" in user_msg and "식단" in user_msg:
        return True
    if "식단" in user_msg and re.search(r"\d{1,2}\s*일", user_msg):
        return True
    return False

def last_assistant_asked_plan_details(last_text: Optional[str]) -> bool:
    if not last_text:
        return False
    return "며칠" in last_text and "끼니" in last_text

def is_calendar_register_request(user_msg: str, last_text: Optional[str]) -> bool:
    if not user_msg:
        return False
    if re.search(r"캘린더\s*등록|달력\s*등록|식단\s*등록", user_msg):
        return True
    if "등록" in user_msg and ("캘린더" in user_msg or "달력" in user_msg):
        return True
    if "등록" in user_msg and last_text and "캘린더" in last_text:
        return True
    if last_text and "교체" in last_text and is_replace_confirm(user_msg):
        return True
    if last_text and "교체" in last_text and is_cancel_message(user_msg):
        return True
    if last_text and ("어느 날짜" in last_text or "등록할까요" in last_text) and extract_date_from_text(user_msg, datetime.now().astimezone().date()):
        return True
    return False

def is_replace_confirm(user_msg: str) -> bool:
    if not user_msg:
        return False
    return bool(re.search(r"교체|바꿔|변경|덮어", user_msg)) or user_msg.strip() in ["응", "네", "좋아요", "좋아", "그래", "예"]

def is_cancel_message(user_msg: str) -> bool:
    if not user_msg:
        return False
    return bool(re.search(r"아니|아니요|아니오|취소|그만", user_msg))

def get_last_assistant_message(db: Session, chat_log_id: Optional[int]) -> Optional[ChatMessage]:
    if not db or not chat_log_id:
        return None
    return db.query(ChatMessage).filter(
        ChatMessage.chat_log_id == chat_log_id,
        ChatMessage.role == 'assistant'
    ).order_by(ChatMessage.created_at.desc()).first()

def get_plan_day_count(plan: List[DailyPlanResponse]) -> int:
    if not plan:
        return 0
    return max([int(getattr(p, 'day', 1)) for p in plan] or [0])

def build_plan_from_candidates(candidates: List[dict], days: int, meals: List[str]) -> List[DailyPlanResponse]:
    if not candidates or not days or not meals:
        return []

    structured = []
    idx = 0
    for day in range(1, days + 1):
        d_meals: Dict[str, PlanRecipeInfo] = {}
        for meal_type in meals:
            r = candidates[idx % len(candidates)]
            idx += 1
            d_meals[meal_type] = PlanRecipeInfo(
                id=r.get("id"),
                name=r.get("name"),
                thumbnail=r.get("thumbnail"),
                ingredient=r.get("ingredient"),
                price=r.get("price", 0)
            )
        structured.append(DailyPlanResponse(day=day, meals=d_meals))
    return structured

def build_plan_from_day_meals(candidates: List[dict], day_meals: Dict[int, List[str]]) -> List[DailyPlanResponse]:
    if not candidates or not day_meals:
        return []

    structured = []
    idx = 0
    for day in sorted(day_meals.keys()):
        meals = day_meals[day]
        d_meals: Dict[str, PlanRecipeInfo] = {}
        for meal_type in meals:
            r = candidates[idx % len(candidates)]
            idx += 1
            d_meals[meal_type] = PlanRecipeInfo(
                id=r.get("id"),
                name=r.get("name"),
                thumbnail=r.get("thumbnail"),
                ingredient=r.get("ingredient"),
                price=r.get("price", 0)
            )
        structured.append(DailyPlanResponse(day=day, meals=d_meals))
    return structured

def build_conflict_plan(rows: List[tuple], start_date: date) -> List[DailyPlanResponse]:
    # Deprecated: use `build_plan_from_rows` instead. Kept for backward compatibility.
    return build_plan_from_rows(rows, start_date)

def normalize_calendar_range(range_info) -> Optional[Tuple[date, date]]:
    if not range_info:
        return None

    start = None
    end = None

    if isinstance(range_info, (tuple, list)) and len(range_info) >= 2:
        start, end = range_info[0], range_info[1]
    elif isinstance(range_info, dict):
        start = range_info.get("start_date") or range_info.get("start")
        end = range_info.get("end_date") or range_info.get("end")

    if isinstance(start, str):
        try:
            start = datetime.strptime(start, "%Y-%m-%d").date()
        except ValueError:
            start = None
    if isinstance(end, str):
        try:
            end = datetime.strptime(end, "%Y-%m-%d").date()
        except ValueError:
            end = None

    if not start or not end:
        return None

    if start > end:
        start, end = end, start
    return (start, end)

def build_calendar_plan_from_rows(rows: List[tuple], start_date: date) -> List[DailyPlanResponse]:
    # Deprecated: use `build_plan_from_rows` instead. Kept for backward compatibility.
    return build_plan_from_rows(rows, start_date)


def build_plan_from_rows(rows: List[tuple], start_date: date) -> List[DailyPlanResponse]:
    """Build a DailyPlanResponse list from DB rows of (MealCalendar, AiMeal, Recipe).

    This consolidates the previous `build_conflict_plan` and
    `build_calendar_plan_from_rows` implementations.
    """
    meals_by_date: Dict[date, Dict[str, PlanRecipeInfo]] = {}
    for cal, ai, recipe in rows:
        meals_by_date.setdefault(cal.meal_date, {})[cal.meal_type] = PlanRecipeInfo(
            id=recipe.id,
            name=recipe.name,
            thumbnail=recipe.thumbnail,
            ingredient=recipe.ingredient,
            price=calculate_recipe_cost(recipe)
        )

    plan: List[DailyPlanResponse] = []
    for d in sorted(meals_by_date.keys()):
        day_index = (d - start_date).days + 1
        plan.append(DailyPlanResponse(day=day_index, date_str=d.isoformat(), meals=meals_by_date[d]))
    return plan

def register_plan_to_calendar(
    db: Session,
    request_id: int,
    plan: List[DailyPlanResponse],
    start_date: date,
    member_id: int
) -> int:
    now = datetime.utcnow()
    total = 0

    db.query(AiMeal).filter(AiMeal.request_id == request_id).delete()

    for day_entry in plan:
        day_index = int(getattr(day_entry, 'day', 1))
        meals = day_entry.meals if isinstance(day_entry.meals, dict) else {}

        for meal_type, info in meals.items():
            # [수정] meal_type 유효성 검사 및 매핑
            # DB 제약조건: '아침', '점심', '저녁'만 허용됨
            valid_meal_type = meal_type

            if valid_meal_type not in ["아침", "점심", "저녁"]:
                if valid_meal_type.lower() in ["main", "메인", "lunch"]:
                    valid_meal_type = "점심"
                elif valid_meal_type.lower() in ["dinner", "supper"]:
                    valid_meal_type = "저녁"
                elif valid_meal_type.lower() in ["breakfast", "morning"]:
                    valid_meal_type = "아침"
                else:
                    # 매핑되지 않는 이상한 타입(snack 등)은 캘린더 등록에서 제외
                    print(f"Skipping invalid meal_type: {meal_type}")
                    continue

            recipe_id = getattr(info, 'id', None) or (info.get('id') if isinstance(info, dict) else None)
            if not recipe_id:
                r_name = getattr(info, 'name', None) or (info.get('name') if isinstance(info, dict) else None)
                if r_name:
                    r_obj = db.query(Recipe).filter(Recipe.name == r_name).first()
                    if r_obj:
                        recipe_id = r_obj.id

            if not recipe_id:
                continue

            meal_date = start_date + timedelta(days=max(0, day_index - 1))

            # 기존 중복 삭제
            db.query(AiMeal).filter(
                AiMeal.request_id == request_id,
                AiMeal.meal_date == meal_date,
                AiMeal.meal_type == valid_meal_type # [수정] 변환된 valid_meal_type 사용
            ).delete()

            ai_meal = AiMeal(
                request_id=request_id,
                recipe_id=recipe_id,
                meal_date=meal_date,
                meal_type=valid_meal_type, # [수정] 변환된 valid_meal_type 사용
                status='pending'
            )
            db.add(ai_meal)
            db.flush()

            ai_meal.status = 'approved'
            ai_meal.approved_at = now
            upsert_calendar_entry(
                db=db,
                member_id=member_id,
                meal_date=meal_date,
                meal_type=valid_meal_type, # [수정] 변환된 valid_meal_type 사용
                ai_meal_id=ai_meal.id,
                timestamp=datetime.utcnow()
            )
            total += 1

    db.commit()
    return total

def upsert_calendar_entry(
    db: Session,
    member_id: int,
    meal_date: date,
    meal_type: str,
    ai_meal_id: int,
    timestamp: Optional[datetime] = None
) -> None:
    if not member_id:
        return

    ts = timestamp or datetime.utcnow()
    entry = db.query(MealCalendar).filter(
        MealCalendar.user_id == member_id,
        MealCalendar.meal_date == meal_date,
        MealCalendar.meal_type == meal_type
    ).one_or_none()

    if entry:
        entry.ai_meal_id = ai_meal_id
        entry.updated_at = ts
    else:
        db.add(MealCalendar(
            user_id=member_id,
            meal_date=meal_date,
            meal_type=meal_type,
            ai_meal_id=ai_meal_id,
            created_at=ts,
            updated_at=ts
        ))


def fetch_calendar_rows(
    db: Session,
    member_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    exact_date: Optional[date] = None,
    in_dates: Optional[List[date]] = None
) -> List[tuple]:
    """Helper to fetch (MealCalendar, AiMeal, Recipe) rows for a user.

    Filters (mutually combinable): exact_date, start_date/end_date, or in_dates list.
    """
    q = db.query(MealCalendar, AiMeal, Recipe) \
        .join(AiMeal, MealCalendar.ai_meal_id == AiMeal.id) \
        .join(Recipe, AiMeal.recipe_id == Recipe.id) \
        .filter(MealCalendar.user_id == member_id)

    if exact_date:
        q = q.filter(MealCalendar.meal_date == exact_date)
    if start_date and end_date:
        q = q.filter(MealCalendar.meal_date >= start_date).filter(MealCalendar.meal_date <= end_date)
    if in_dates:
        q = q.filter(MealCalendar.meal_date.in_(in_dates))

    return q.all()

def parse_json_garbage(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    pattern = r"```(?:json)?\s*(\{.*?\})\s*```"
    match = re.search(pattern, text, re.DOTALL)
    if match:
        return json.loads(match.group(1))

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        return json.loads(text[start : end + 1])

    raise ValueError(f"No JSON found in response")

def calculate_recipe_cost(recipe: Recipe) -> int:
    total_price = 0
    if not recipe.product_links:
        return 0
    for rp in recipe.product_links:
        if rp.product and rp.product.price:
            total_price += int(rp.product.price)
    return total_price

def get_products_from_plan(current_plan: List[DailyPlanResponse], db: Session) -> List[CartItem]:
    """
    [장바구니 로직]
    1. 식단에서 레시피 ID 추출
    2. DB 조회
    3. 중복된 상품은 수량을 합산(Aggregation)
    """
    print(f"\n========== [CART LOGIC] ==========")

    target_recipe_ids = set()
    for day in current_plan:
        if not day.meals: continue
        # Pydantic 모델이나 dict 모두 처리 가능하도록
        meals = day.meals if isinstance(day.meals, dict) else day.meals.dict() if hasattr(day.meals, 'dict') else {}

        for info in meals.values():
            # info가 객체일수도 dict일수도 있음
            r_id = getattr(info, 'id', None) or (info.get('id') if isinstance(info, dict) else None)
            if r_id:
                target_recipe_ids.add(r_id)

    if not target_recipe_ids:
        print("❌ 유효한 레시피 ID 없음")
        return []

    # DB 조회
    recipes = db.query(Recipe) \
        .options(joinedload(Recipe.product_links).joinedload(RecipeProduct.product)) \
        .filter(Recipe.id.in_(target_recipe_ids)).all()

    # 중복 합산을 위한 딕셔너리
    cart_map: Dict[str, CartItem] = {}

    for r in recipes:
        if not r.product_links: continue
        for rp in r.product_links:
            if rp.product and rp.product.is_active:
                p_id = str(rp.product.id)

                if p_id in cart_map:
                    cart_map[p_id].quantity += 1
                    print(f"   ➕ 수량 증가: {rp.product.name} ({cart_map[p_id].quantity}개)")
                else:
                    cart_map[p_id] = CartItem(
                        id=p_id,
                        title=rp.product.title or rp.product.name,
                        price=int(rp.product.price or 0),
                        imageUrl=rp.product.main_thumbnail,
                        quantity=1
                    )
                    print(f"   🆕 신규 추가: {rp.product.name}")

    result = list(cart_map.values())
    print(f"✅ 최종 반환 품목 수: {len(result)}개")
    return result

# ==========================================
# [Nodes]
# ==========================================

def _build_router_response(
    intent: IntentAnalysis,
    current_plan: List[DailyPlanResponse],
    calendar_date: Optional[date] = None,
    calendar_range: Optional[Tuple[date, date]] = None,
    delete_meals: Optional[List[str]] = None,
    plan_delete_day_map: Optional[Dict[int, List[str]]] = None,
    plan_delete_days: Optional[List[int]] = None,
    plan_delete_meals: Optional[List[str]] = None
) -> Dict[str, Any]:
    return {
        "intent": intent,
        "current_plan": current_plan,
        "calendar_date": calendar_date,
        "calendar_range": calendar_range,
        "delete_meals": delete_meals,
        "plan_delete_day_map": plan_delete_day_map,
        "plan_delete_days": plan_delete_days,
        "plan_delete_meals": plan_delete_meals,
        "retry_count": 0
    }

# 1. Router Node: 사용자 의도 파악
def router_node(state: AgentState):
    user_msg = state["user_message"]
    print(f"📡 [Router] Analyzing: {user_msg}")

    db: Session = state.get("db_session")
    chat_log_id = state.get("chat_log_id")
    history_messages = to_langchain_history_messages(state.get("chat_history"))
    last_assistant = get_last_assistant_message(db, chat_log_id)
    last_assistant_text = last_assistant.content if last_assistant else None
    today = datetime.now().astimezone().date()
    current_plan = state["current_plan"]

    if is_calendar_register_request(user_msg, last_assistant_text):
        intent = IntentAnalysis(
            intent_type="calendar_register",
            requires_search=False,
            is_new_session=False,
            reason="calendar register request"
        )
        return _build_router_response(intent, current_plan)

    calendar_range = extract_calendar_range(user_msg, today)
    if is_calendar_show_request(user_msg):
        if not calendar_range:
            calendar_range = parse_calendar_range_with_llm(user_msg, today)
        if not calendar_range:
            calendar_range = (today - timedelta(days=6), today)

        intent = IntentAnalysis(
            intent_type="show_calendar_range",
            requires_search=False,
            is_new_session=False,
            reason="calendar range show request"
        )
        return _build_router_response(intent, current_plan, calendar_range=calendar_range)

    plan_days = parse_plan_days(user_msg)
    plan_meals = parse_plan_meals(user_msg)
    meal_count = parse_meal_count_with_llm(user_msg)
    has_plan_signals = bool(plan_days or plan_meals)
    is_plan_req = is_plan_request_message(user_msg) or (has_plan_signals and last_assistant_asked_plan_details(last_assistant_text))

    if is_plan_req:
        if not plan_days or not plan_meals:
            if meal_count == 4 and plan_days and not plan_meals:
                intent = IntentAnalysis(
                    intent_type="modify",
                    requires_search=True,
                    is_new_session=True,
                    reason="4-meal request handled as 3-meal plan"
                )
                return _build_router_response(intent, [])

            intent = IntentAnalysis(
                intent_type="ask_plan_details",
                requires_search=False,
                is_new_session=False,
                reason="missing plan details"
            )
            return _build_router_response(intent, current_plan)

        intent = IntentAnalysis(
            intent_type="modify",
            requires_search=True,
            is_new_session=True,
            reason="plan request with details"
        )
        return _build_router_response(intent, [])

    calendar_date = extract_calendar_date(user_msg, today)
    if calendar_date:
        intent = IntentAnalysis(
            intent_type="show_calendar",
            requires_search=False,
            is_new_session=False,
            reason="calendar date request"
        )
        return _build_router_response(intent, current_plan, calendar_date=calendar_date)

    if re.search(r"\d+\s*일\s*치\s*식단", user_msg) or re.search(r"\d+\s*일\s*치", user_msg):
        intent = IntentAnalysis(
            intent_type="modify",
            requires_search=True,
            is_new_session=True,
            reason="explicit N-day new plan request"
        )
        return _build_router_response(intent, [])

    prompt = f"""
    Classify the user's intent into JSON.
    User Message: "{user_msg}"
    
    Schema: {{ 
        "intent_type": "string", 
        "requires_search": boolean, 
        "is_new_session": boolean, 
        "reason": "string" 
    }}
    
    Rules:
    1. **cart_add**: "담아줘", "장바구니". Search: False, NewSession: False.
    2. **checkout**: "결제해줘". Search: False, NewSession: False.
    3. **show_plan**: "식단 보여줘". Search: False, NewSession: False.
    3-1. **show_calendar**: If the user asks for a specific date's meal plan, e.g., "3일 식단", "1월 3일 식단", "2026년 1월 3일 식단".
    3-2. **show_calendar_range**: If the user asks for a range or period of saved meal plans, e.g., "지난주 식단", "16일~20일 식단", "등록된 식단 조회".
    3-3. **calendar_delete**: If the user wants to delete a saved meal plan using actual calendar dates (e.g., "16일 식단 삭제", "2026-01-03 저녁 삭제", "캘린더에서 삭제").
    4. **plan_delete**: If the user wants to delete meals from the CURRENTLY RECOMMENDED plan (e.g., "1일차 저녁 빼줘", "추천해준 식단에서 둘째날은 다 지워").
        - Search: False, NewSession: False.
        - Trigger this when the user references relative day labels (1일차, 둘째날, 첫째날) or mentions "지금 식단", "추천해준 식단" without specific calendar dates.
    
    5. **modify**: User wants recipe recommendations or changes.
       - **CASE A (New Session)**: User asks for a SPECIFIC new dish or topic WITHOUT saying "add" or "change".
         - Ex: "감자전 추천해줘", "파전 알려줘", "오늘 저녁 뭐 먹지?", "김치찌개 레시피".
         - -> is_new_session: **TRUE** (Reset previous plan).
         
       - **CASE B (Modify/Add)**: User explicitly wants to EDIT the existing plan.
         - Ex: "이거 추가해줘", "아침은 파전으로 바꿔줘", "여기에 밥도 넣어줘", "3일치로 늘려줘".
         - -> is_new_session: **FALSE** (Keep previous plan).
    
    6. **chat**: General greetings not related to recipe generation.
    
    Output JSON only.
    """
    try:
        data = llm_invoke_json(prompt, history_messages=history_messages)
        if not isinstance(data, dict):
            raise ValueError("Invalid intent payload")
        intent = IntentAnalysis(**data)

        if intent.intent_type == "modify":
            intent.requires_search = True
    except Exception as e:
        print(f"Router Error: {e}")
        intent = IntentAnalysis(intent_type="chat", requires_search=False, is_new_session=False, reason="Error fallback")

    print(f"   -> Intent: {intent.intent_type}, NewSession: {intent.is_new_session}")

    resolved_calendar_date = None
    resolved_calendar_range = None
    delete_meals = None
    plan_delete_day_map = None
    plan_delete_days = None
    plan_delete_meals = None

    if intent.intent_type == "show_calendar":
        resolved_calendar_date = extract_calendar_date(user_msg, today)
        if not resolved_calendar_date and last_assistant_text:
            resolved_calendar_date = extract_calendar_date(last_assistant_text, today)
        if not resolved_calendar_date:
            intent = IntentAnalysis(
                intent_type="chat",
                requires_search=False,
                is_new_session=False,
                reason="calendar date missing"
            )

    if intent.intent_type == "show_calendar_range":
        resolved_calendar_range = calendar_range or extract_calendar_range(user_msg, today)
        if not resolved_calendar_range:
            resolved_calendar_range = parse_calendar_range_with_llm(user_msg, today)
        if not resolved_calendar_range:
            resolved_calendar_range = (today - timedelta(days=6), today)

    if intent.intent_type == "calendar_delete":
        resolved_calendar_date = extract_calendar_date(user_msg, today)
        if not resolved_calendar_date and last_assistant_text:
            resolved_calendar_date = extract_calendar_date(last_assistant_text, today)
        delete_meals = parse_plan_meals(user_msg)

    if intent.intent_type == "plan_delete":
        plan_delete_day_map, plan_delete_days, plan_delete_meals = parse_plan_delete_targets(user_msg)

    updated_plan = current_plan
    if intent.is_new_session:
        print("   🧹 [Reset] 새로운 추천 요청이므로 기존 식단 컨텍스트를 초기화합니다.")
        updated_plan = []

    return _build_router_response(
        intent,
        updated_plan,
        calendar_date=resolved_calendar_date,
        calendar_range=resolved_calendar_range,
        delete_meals=delete_meals,
        plan_delete_day_map=plan_delete_day_map,
        plan_delete_days=plan_delete_days,
        plan_delete_meals=plan_delete_meals
    )

# 2. Cart Node: 장바구니 담기
def cart_node(state: AgentState):
    db: Session = state["db_session"]
    plan = state["current_plan"]

    if not plan:
        return {
            "final_response": ChatResponse(
                response_type="chat",
                message="장바구니에 담을 식단 정보가 없습니다. 먼저 식단을 추천받아 주세요."
            )
        }

    items = get_products_from_plan(plan, db)

    if not items:
        return {
            "final_response": ChatResponse(
                response_type="chat",
                message="추천된 식단에 매핑된 상품 정보를 찾을 수 없습니다."
            )
        }

    # 총 가격 계산 시 (단가 * 수량) 반영
    total_est = sum(i.price * i.quantity for i in items)
    count = len(items)

    return {
        "final_response": ChatResponse(
            response_type="cart_add",
            message=f"식단 재료를 장바구니에 담았습니다.\n(총 {count}개 품목, 약 {total_est:,}원)",
            cart_items=items
        )
    }

# 3. Checkout Node
def checkout_node(state: AgentState):
    return {
        "final_response": ChatResponse(
            response_type="checkout",
            message="장바구니에 담긴 상품으로 결제를 진행할까요?"
        )
    }

# 4. Show Plan Node
def show_plan_node(state: AgentState):
    if not state["current_plan"]:
        return {
            "final_response": ChatResponse(
                response_type="chat",
                message="현재 표시할 식단 정보가 없습니다."
            )
        }
    return {
        "final_response": ChatResponse(
            response_type="plan_update",
            message="네, 현재 식단표를 다시 보여드립니다.",
            updated_plan=state["current_plan"],
            plan_kind="current"
        )
    }

# Deletion confirmation helper to reuse across preview flows
DELETE_CONFIRMATION_KEYWORDS = ("삭제", "지워", "제거", "빼줘", "빼줄", "지울", "없애")


def needs_delete_confirmation(user_msg: Optional[str]) -> bool:
    if not user_msg:
        return False
    return any(keyword in user_msg for keyword in DELETE_CONFIRMATION_KEYWORDS)


# 4-1. Show Calendar Node (Saved Plan by Date)
def show_calendar_node(state: AgentState):
    target_date: Optional[date] = state.get("calendar_date")
    if not target_date:
        return {
            "final_response": ChatResponse(
                response_type="chat",
                message="요청하신 날짜를 이해하지 못했습니다. 예: '3일 식단', '1월 3일 식단'"
            )
        }

    db: Session = state["db_session"]
    member_id = state["member_id"]

    rows = fetch_calendar_rows(db, member_id, exact_date=target_date)

    if not rows:
        return {
            "final_response": ChatResponse(
                response_type="chat",
                message=f"{target_date.strftime('%Y-%m-%d')}에 등록된 식단이 없습니다."
            )
        }

    meals: Dict[str, PlanRecipeInfo] = {}
    for cal, ai, recipe in rows:
        meals[cal.meal_type] = PlanRecipeInfo(
            id=recipe.id,
            name=recipe.name,
            thumbnail=recipe.thumbnail,
            ingredient=recipe.ingredient,
            price=calculate_recipe_cost(recipe)
        )

    plan = [
        DailyPlanResponse(
            day=target_date.day,
            date_str=target_date.isoformat(),
            meals=meals
        )
    ]

    user_msg = state.get("user_message", "")
    message = f"{target_date.strftime('%Y-%m-%d')} 식단표입니다."
    if needs_delete_confirmation(user_msg):
        message += " 삭제를 진행할까요?"

    return {
        "final_response": ChatResponse(
            response_type="plan_update",
            message=message,
            updated_plan=plan,
            plan_kind="preview"
        )
    }

# 4-1-1. Show Calendar Range Node (Saved Plan by Date Range)
def show_calendar_range_node(state: AgentState):
    range_info = state.get("calendar_range")
    normalized = normalize_calendar_range(range_info)

    if not normalized:
        fallback_date = state.get("calendar_date")
        if isinstance(fallback_date, date):
            normalized = (fallback_date, fallback_date)

    if not normalized:
        return {
            "final_response": ChatResponse(
                response_type="chat",
                message="요청하신 기간을 이해하지 못했습니다. 예: '지난주 식단', '16일~20일 식단'"
            )
        }

    start_date, end_date = normalized

    db: Session = state["db_session"]
    member_id = state["member_id"]

    rows = fetch_calendar_rows(db, member_id, start_date=start_date, end_date=end_date)

    if not rows:
        if start_date == end_date:
            message = f"{start_date.strftime('%Y-%m-%d')}에 등록된 식단이 없습니다."
        else:
            message = f"{start_date.strftime('%Y-%m-%d')}~{end_date.strftime('%Y-%m-%d')}에 등록된 식단이 없습니다."
        return {
            "final_response": ChatResponse(
                response_type="chat",
                message=message
            )
        }

    plan = build_calendar_plan_from_rows(rows, start_date)
    user_msg = state.get("user_message", "")
    if start_date == end_date:
        message = f"{start_date.strftime('%Y-%m-%d')} 식단표입니다."
    else:
        message = f"{start_date.strftime('%Y-%m-%d')}~{end_date.strftime('%Y-%m-%d')} 식단표입니다."
    if needs_delete_confirmation(user_msg):
        message += " 삭제를 진행할까요?"

    return {
        "final_response": ChatResponse(
            response_type="plan_update",
            message=message,
            updated_plan=plan,
            plan_kind="preview"
        )
    }

# 4-1-2. Calendar Delete Node (Saved Plan by Date/Meal)
def calendar_delete_node(state: AgentState):
    target_date: Optional[date] = state.get("calendar_date")
    if not target_date:
        target_date = extract_calendar_date(state.get("user_message", ""), datetime.now().astimezone().date())

    if not target_date:
        return {
            "final_response": ChatResponse(
                response_type="chat",
                message="어느 날짜의 식단을 삭제할까요? 예: 16일, 1월 16일"
            )
        }

    delete_meals = state.get("delete_meals") or parse_plan_meals(state.get("user_message", ""))

    db: Session = state["db_session"]
    member_id = state["member_id"]

    print(f"Calendar delete requested: user_message='{state.get('user_message','')}' target_date={target_date} member_id={member_id} delete_meals={delete_meals}")

    query = db.query(MealCalendar) \
        .filter(MealCalendar.user_id == member_id) \
        .filter(MealCalendar.meal_date == target_date)

    if delete_meals:
        query = query.filter(MealCalendar.meal_type.in_(delete_meals))

    rows = query.all()
    try:
        print("Calendar delete - matched rows:", [(r.id, getattr(r, 'meal_date', None), getattr(r, 'meal_type', None)) for r in rows])
    except Exception:
        print("Calendar delete - matched rows (unable to list details)")
    if not rows:
        if delete_meals:
            return {
                "final_response": ChatResponse(
                    response_type="chat",
                    message=f"{target_date.strftime('%Y-%m-%d')}에 삭제할 식단이 없습니다."
                )
            }
        return {
            "final_response": ChatResponse(
                response_type="chat",
                message=f"{target_date.strftime('%Y-%m-%d')}에 등록된 식단이 없습니다."
            )
        }

    try:
        print(f"Calendar delete - deleting {len(rows)} row(s) for date {target_date}")
        deleted = query.delete(synchronize_session=False)
        db.commit()
    except Exception as e:
        print(f"Calendar delete error: {e}")
        try:
            db.rollback()
        except Exception:
            pass
        return {
            "final_response": ChatResponse(
                response_type="chat",
                message="삭제 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
            )
        }

    if delete_meals:
        message = f"{target_date.strftime('%Y-%m-%d')} {', '.join(delete_meals)} 식단을 삭제했습니다."
    else:
        message = f"{target_date.strftime('%Y-%m-%d')} 식단을 삭제했습니다."

    return {
        "final_response": ChatResponse(
            response_type="chat",
            message=message
        )
    }

# 4-1-3. Plan Delete Node (Current Recommendation)
def plan_delete_node(state: AgentState):
    plan = state.get("current_plan") or []
    if not plan:
        return {
            "final_response": ChatResponse(
                response_type="chat",
                message="삭제할 식단이 없습니다. 먼저 식단을 추천받아 주세요."
            )
        }

    raw_day_map = state.get("plan_delete_day_map") or {}
    day_map: Dict[int, List[str]] = {}
    for key, meals in raw_day_map.items():
        try:
            day_map[int(key)] = meals
        except (TypeError, ValueError):
            continue

    raw_full_days = state.get("plan_delete_days") or []
    full_days = set()
    for value in raw_full_days:
        try:
            full_days.add(int(value))
        except (TypeError, ValueError):
            continue
    global_meals = set(state.get("plan_delete_meals") or [])

    if not day_map and not full_days and not global_meals:
        return {
            "final_response": ChatResponse(
                response_type="chat",
                message="삭제할 끼니를 이해하지 못했어요. '1일차 저녁 빼줘'처럼 말씀해 주세요."
            )
        }

    updated_entries = []
    removed_any = False

    for entry in plan:
        if isinstance(entry, dict):
            day_idx = int(entry.get("day", 1))
            date_str = entry.get("date_str")
            meals_obj = entry.get("meals", {}) or {}
        else:
            day_idx = int(getattr(entry, "day", 1))
            date_str = getattr(entry, "date_str", None)
            meals_obj = entry.meals if hasattr(entry, "meals") else {}

        if day_idx in full_days:
            removed_any = True
            continue

        filtered_meals = {}
        for meal_type, info in (meals_obj or {}).items():
            if meal_type in global_meals:
                removed_any = True
                continue
            if day_idx in day_map and meal_type in (day_map.get(day_idx) or []):
                removed_any = True
                continue
            filtered_meals[meal_type] = info

        if filtered_meals:
            updated_entries.append({
                "date_str": date_str,
                "meals": filtered_meals
            })
        else:
            if meals_obj:
                removed_any = True

    if not removed_any:
        return {
            "final_response": ChatResponse(
                response_type="chat",
                message="요청하신 끼니를 찾지 못했습니다. 다시 한 번 구체적으로 알려 주세요."
            )
        }

    normalized_plan: List[DailyPlanResponse] = []
    for idx, entry in enumerate(updated_entries):
        normalized_plan.append(DailyPlanResponse(
            day=idx + 1,
            date_str=entry.get("date_str"),
            meals=entry.get("meals", {})
        ))

    if not normalized_plan:
        message = "요청하신 끼니를 모두 삭제했습니다. 새로운 식단이 필요하시면 말씀해 주세요."
    else:
        message = "요청하신 끼니를 삭제했어요. 수정된 식단을 확인해 주세요."

    return {
        "current_plan": normalized_plan,
        "final_response": ChatResponse(
            response_type="plan_update",
            message=message,
            updated_plan=normalized_plan,
            plan_kind="current"
        )
    }

# 4-2. Ask Plan Details Node
def ask_plan_details_node(state: AgentState):
    user_msg = state.get("user_message", "")
    meal_count = parse_meal_count_with_llm(user_msg)
    plan_days = parse_plan_days(user_msg)
    plan_meals = parse_plan_meals(user_msg)

    if not plan_days and not plan_meals:
        message = "며칠치 식단이 필요하신가요? 그리고 끼니(아침/점심/저녁)도 알려주세요."
    elif not plan_days:
        message = "며칠치 식단이 필요하신가요?"
    elif not plan_meals:
        if meal_count == 2:
            message = "두 끼로 드실 거면 어떤 끼니로 구성할까요? (아침/점심/저녁)"
        else:
            message = "어떤 끼니로 준비해드릴까요? (아침/점심/저녁)"
    else:
        message = "추가로 원하는 조건이 있으면 알려주세요."

    return {
        "final_response": ChatResponse(
            response_type="chat",
            message=message
        )
    }

# 4-3. Calendar Register Node
def calendar_register_node(state: AgentState):
    db: Session = state["db_session"]
    member_id = state["member_id"]
    chat_log_id = state.get("chat_log_id")
    user_msg = state["user_message"]
    current_plan = state.get("current_plan") or []

    if not current_plan:
        return {
            "final_response": ChatResponse(
                response_type="chat",
                message="등록할 식단이 없습니다. 먼저 식단을 추천받아 주세요."
            )
        }

    last_assistant = get_last_assistant_message(db, chat_log_id)
    last_assistant_text = last_assistant.content if last_assistant else None

    if is_cancel_message(user_msg):
        return {
            "final_response": ChatResponse(
                response_type="chat",
                message="알겠습니다. 식단 등록을 취소할게요."
            )
        }

    start_date = extract_date_from_text(user_msg, datetime.now().astimezone().date())
    if not start_date and is_replace_confirm(user_msg):
        start_date = extract_date_from_text(last_assistant_text or "", datetime.now().astimezone().date())

    if not start_date:
        start_date = parse_date_with_llm(user_msg, datetime.now().astimezone().date())
        if not start_date and is_replace_confirm(user_msg):
            start_date = parse_date_with_llm(last_assistant_text or "", datetime.now().astimezone().date())

    if not start_date:
        return {
            "final_response": ChatResponse(
                response_type="chat",
                message="어느 날짜로 등록할까요? 예: 16일, 1월 16일"
            )
        }

    plan_day_count = get_plan_day_count(current_plan)
    target_dates = [start_date + timedelta(days=i) for i in range(max(1, plan_day_count))]

    rows = fetch_calendar_rows(db, member_id, in_dates=target_dates)

    if rows and not is_replace_confirm(user_msg):
        conflict_plan = build_plan_from_rows(rows, start_date)
        message = f"{start_date.strftime('%Y-%m-%d')}부터 {plan_day_count}일치 일정에 이미 등록된 식단이 있어요. 교체할까요?"
        return {
            "final_response": ChatResponse(
                response_type="calendar_conflict",
                message=message,
                updated_plan=conflict_plan,
                plan_kind="preview"
            )
        }

    request_id = state.get("plan_message_id")
    if not request_id and last_assistant:
        request_id = last_assistant.id

    if not request_id:
        return {
            "final_response": ChatResponse(
                response_type="chat",
                message="등록에 실패했습니다. 다시 시도해 주세요."
            )
        }

    try:
        registered = register_plan_to_calendar(db, request_id, current_plan, start_date, member_id)
        if registered == 0:
            return {
                "final_response": ChatResponse(
                    response_type="chat",
                    message="등록할 레시피 정보를 찾지 못했습니다."
                )
            }
        return {
            "final_response": ChatResponse(
                response_type="chat",
                message=f"{start_date.strftime('%Y-%m-%d')}부터 식단을 캘린더에 등록했습니다."
            )
        }
    except Exception as e:
        print(f"Calendar register error: {e}")
        try:
            db.rollback()
        except Exception:
            pass
        return {
            "final_response": ChatResponse(
                response_type="chat",
                message="등록 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
            )
        }

# 5. Simple Chat Node (Async)
async def simple_chat_node(state: AgentState):
    current_plan_dict = [p.model_dump() for p in state["current_plan"]] if state["current_plan"] else []
    plan_str = json.dumps(current_plan_dict, ensure_ascii=False)

    system_prompt = f"""
    [System Identity]
    You are 'Resiply Bot', a friendly and professional AI Chef assistant for the Resiply service.
    
    [Strict Rules]
    1. **IDENTITY**: You must NEVER mention you are 'Gemini', 'Google AI', or a language model.
    2. **Self-Introduction**: If asked who you are, reply: "저는 Resiply의 셰프 AI입니다." or "저는 여러분의 요리를 돕는 Resiply 봇입니다."
    3. **Tone**: Warm, encouraging, and concise (Korean).
    
    [Context - Current Meal Plan]
    {plan_str}
    
    Always answer in Korean based on your identity as Resiply Bot.
    """
    history_messages = to_langchain_history_messages(state.get("chat_history"))
    res_content = await llm_ainvoke_raw(
        state["user_message"],
        system=system_prompt,
        history_messages=history_messages
    )
    return {
        "final_response": ChatResponse(
            response_type="chat",
            message=res_content or ""
        )
    }

# 6. Modify - Retrieve Node
def retrieve_node(state: AgentState):
    db: Session = state["db_session"]

    # 검색이 필요 없다고 되어있어도, modify인데 레시피가 필요한 상황을 대비해 체크할 수도 있음
    if not state["intent"].requires_search:
        return {"retrieved_recipes": []}

    query = f"{state['user_message']} 레시피 추천"

    # 1. 벡터 검색 시도
    try:
        query_vector = voyage_client.embed([query], model="voyage-3.5", input_type="query").embeddings[0]
        results = db.query(Recipe) \
            .options(joinedload(Recipe.product_links).joinedload(RecipeProduct.product)) \
            .order_by(Recipe.embedding.cosine_distance(query_vector)) \
            .limit(20).all()
    except Exception as e:
        print(f"⚠️ Vector search failed: {e}")
        results = []

    # 2. [🔥핵심] 검색 결과가 0개면, 랜덤으로라도 레시피를 가져온다 (Fallback)
    if not results:
        print("⚠️ No search results found. Fetching random fallback recipes.")
        # PostgreSQL의 랜덤 정렬: func.random()
        results = db.query(Recipe) \
            .options(joinedload(Recipe.product_links).joinedload(RecipeProduct.product)) \
            .order_by(func.random()) \
            .limit(15).all()

    data = []
    for r in results:
        price = calculate_recipe_cost(r)
        data.append({
            "id": r.id, "name": r.name, "price": price,
            "ingredient": r.ingredient, "thumbnail": r.thumbnail
        })

    return {"retrieved_recipes": data}

# 7. Modify - Think Node (With Retry Logic)
def think_node(state: AgentState):
    # 1. 재시도 횟수 체크
    current_retries = state.get("retry_count", 0)
    if current_retries > 3:
        print("❌ [Think Node] Max retries reached.")
        return {
            "final_response": ChatResponse(
                response_type="chat",
                message="죄송합니다. 일시적인 오류로 식단을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요."
            )
        }

    user_msg = state["user_message"]
    plan_data = [p.model_dump() for p in state["current_plan"]]
    plan_str = json.dumps(plan_data, ensure_ascii=False)
    history_messages = to_langchain_history_messages(state.get("chat_history"))

    # 2. 후보군 준비 및 셔플
    candidates = state["retrieved_recipes"]
    if candidates:
        candidates = candidates[:]
        random.shuffle(candidates)

    candidates_text = "\n".join([f"- {r['name']} ({r['price']}원)" for r in candidates]) if candidates else "(No new candidates)"
    current_day_count = len(plan_data) if plan_data else 0

    # 3. 프롬프트 (기존 유지)
    prompt = f"""
    You are an AI Meal Planner.
    [Status] Current Plan Length: {current_day_count} days. **MAX TOTAL DAYS: 7**
    [Context] User: "{user_msg}", Current Plan: {plan_str}
    [Candidates (Available Recipes)]: 
    {candidates_text}
    
    [Instructions]
    1. **LIMIT CHECK**: If the user asks for a plan that exceeds 7 days TOTAL (Current + New Request), YOU MUST REFUSE.
       - Set action='chat', reply_message="죄송합니다. 식단은 최대 7일까지만 추천해 드릴 수 있습니다."
       
    2. **MODIFY**: 
       - Set action='update'. 
       
       **[CRITICAL CONSTRAINTS - DO NOT IGNORE]**
       A. **STRICT RECIPE SELECTION**:
          - You MUST select recipes **ONLY from the [Candidates] list** provided above.
          - **NEVER** invent a recipe name that is not in the list.
          - Use the **EXACT NAME** string as written in [Candidates].
          
       B. **STRICT MEAL TYPES**:
          - The 'meal_type' MUST be strictly one of: "아침", "점심", "저녁".
          - **FORBIDDEN**: "main", "snack", "breakfast", "lunch", "dinner".
          - If the user asks for a single dish, assign it to "점심" or "저녁".

       **[LOGIC RULES]**
       - **Quantity Rule**:
         - **Single Dish Request**: If the user asks for a specific menu/category WITHOUT specifying a duration, generate **ONLY 1 MEAL** for Day 1.
         - **Plan Request**: If the user asks for a "Plan", "Diet", or "N days", generate the full schedule.
       
       - **Variety Rule**:
         - Since the candidate list is randomized, **do not always pick the first item**.
         - If the user seems to be asking for a recommendation AGAIN (e.g., "Give me another"), pick different recipes.

             - **Deletion Rule**:
                 - If the user asks to delete or remove meals (keywords like "삭제", "빼줘", "제거", "없애"), treat the existing plan (`Current Plan`) as the source of truth.
                 - Interpret references such as "1일차", "둘째날" as day numbers from the current plan, and meal keywords ("아침", "점심", "저녁") as meal slots.
                 - Remove **only** the explicitly mentioned meals. Example: "1일차 저녁만 삭제" ⇒ keep Day 1 breakfast/lunch, delete only dinner.
                 - If the user explicitly requests removing an entire day (e.g., "2일차 빼줘" or "둘째날 전체 삭제"), drop that day; otherwise keep remaining meals/days untouched.
                 - After deletions, re-list the plan so untouched days/meals remain exactly as before (just without the removed items), and do **not** introduce new recipes unless the user requests replacements.

             - **N-Day Rule**:
                 - Whenever the user says "N일치", "n일치", or otherwise asks for a multi-day plan (e.g., "3일치 식단"), you MUST include **all three meals: "아침", "점심", "저녁"** for every requested day.
                 - Do not omit any of the three meals in this scenario, even if the user does not explicitly list them.

       - **Format Rule**:
         - 'new_plan' MUST be a List of objects with 'day' and 'meals'.
         - 'meals' MUST be a **List** of {{ "meal_type": "...", "recipe_name": "..." }} objects (NOT a dictionary).
   
    3. **CHAT**: If just chat, action='chat'. NO MARKDOWN.

    4. **SPECIFIC DATE HANDLING**:
    - If the user mentions a specific date (e.g., "Jan 25th", "Next Friday"), calculate the exact date based on Today ({datetime.now().astimezone().date()}).
       - fill the 'date_str' field in "YYYY-MM-DD" format.
       - If no specific date is mentioned, leave 'date_str' as null and use 'day' (relative).

    Output Schema: {{ "action": "update/chat", "reply_message": "...", "new_plan": [ {{ "day": 1, "date_str": "2024-01-25", "meals": [ {{ "meal_type": "아침", "recipe_name": "EXACT_NAME_FROM_CANDIDATES" }} ] }} ] }}
    """

    try:
        result = llm_invoke_json(prompt, history_messages=history_messages)

        # [방어 코드 1] result가 None이거나 dict가 아닐 경우 처리
        if not result or not isinstance(result, dict):
            raise ValueError("LLM returned invalid JSON or None")

        action = result.get("action", "chat")

        if action == "update" and result.get("new_plan"):
            candidates_map = {r["name"]: r for r in candidates}

            # 기존 식단 매핑 추가
            for day in state["current_plan"]:
                meals_dict = day.meals if isinstance(day.meals, dict) else day.meals.dict() if hasattr(day.meals, 'dict') else {}
                for r_info in meals_dict.values():
                    r_name = getattr(r_info, 'name', None) or r_info.get('name')
                    r_id = getattr(r_info, 'id', None) or r_info.get('id')
                    r_thumb = getattr(r_info, 'thumbnail', None) or r_info.get('thumbnail')
                    r_ing = getattr(r_info, 'ingredient', None) or r_info.get('ingredient')
                    if r_name:
                        candidates_map[r_name] = {
                            "id": r_id, "name": r_name, "thumbnail": r_thumb,
                            "ingredient": r_ing, "price": 0
                        }

            structured_plan = []
            fallback_index = 0

            for day_p in result["new_plan"]:
                d_meals = {}
                if isinstance(day_p.get('meals'), list):
                    for m in day_p['meals']:
                        raw_type = m.get('meal_type', '점심')

                        # [방어 코드 2] recipe_name이 None일 경우 빈 문자열로 변환
                        r_name = m.get('recipe_name')
                        if r_name is None:
                            r_name = ""

                            # Meal Type 정규화
                        valid_type = raw_type
                        if raw_type not in ["아침", "점심", "저녁"]:
                            mapping = {
                                "breakfast": "아침", "morning": "아침",
                                "lunch": "점심", "main": "점심",
                                "dinner": "저녁", "supper": "저녁"
                            }
                            valid_type = mapping.get(raw_type.lower(), "점심")

                        r_data = candidates_map.get(r_name)

                        # [방어 코드 3] 없는 메뉴(Hallucination) 처리 로직 강화
                        if not r_data:
                            print(f"⚠️ Hallucination detected: '{r_name}' not in candidates.")
                            if candidates:
                                # 후보군 중 하나로 교체
                                r_data = candidates[fallback_index % len(candidates)]
                                fallback_index += 1
                                # [중요] 교체된 데이터의 이름으로 r_name 갱신
                                r_name = r_data['name']
                                print(f"   -> Replaced with: '{r_name}'")
                            else:
                                # 후보군이 아예 없는 비상 상황
                                print("   -> No candidates available to replace.")
                                if not r_name: r_name = "알 수 없는 메뉴" # 이름이 빈값이면 채워줌

                        # [방어 코드 4] PlanRecipeInfo 생성 시 name이 None이 되지 않도록 보장
                        final_name = r_name if r_name else "정보 없음"

                        info = PlanRecipeInfo(
                            id=r_data["id"] if r_data else None,
                            name=final_name,
                            thumbnail=r_data.get("thumbnail") if r_data else None,
                            ingredient=r_data.get("ingredient") if r_data else None,
                            price=r_data.get("price", 0) if r_data else 0
                        )
                        d_meals[valid_type] = info

                structured_plan.append(DailyPlanResponse(
                    day=day_p.get('day', 1),
                    date_str=day_p.get('date_str'),
                    meals=d_meals
                ))

            # [방어 코드 5] reply_message가 None일 경우 기본 메시지 제공
            reply_msg = result.get("reply_message")
            if not reply_msg or not isinstance(reply_msg, str):
                reply_msg = "식단을 수정했습니다."

            return {
                "final_response": ChatResponse(
                    response_type="plan_update",
                    message=reply_msg,
                    updated_plan=structured_plan,
                    plan_kind="current"
                )
            }

        else:
            # [방어 코드 6] reply_message 처리
            reply_msg = result.get("reply_message")
            if not reply_msg or not isinstance(reply_msg, str):
                reply_msg = "죄송합니다. 요청을 처리하는 중 문제가 발생했습니다."

            return {
                "final_response": ChatResponse(
                    response_type="chat",
                    message=reply_msg
                )
            }

    except Exception as e:
        print(f"⚠️ [Think Node] JSON Error (Attempt {current_retries + 1}): {e}")
        return {
            "retry_count": current_retries + 1,
            "final_response": None
        }

# ==========================================
# [Graph Construction]
# ==========================================

# 1. Main Router Decision
def route_decision(state: AgentState) -> Literal["cart_node", "checkout_node", "show_plan_node", "show_calendar_node", "show_calendar_range_node", "calendar_delete_node", "plan_delete_node", "ask_plan_details_node", "calendar_register_node", "simple_chat_node", "retrieve_node"]:
    intent = state["intent"].intent_type
    if intent == "cart_add": return "cart_node"
    if intent == "checkout": return "checkout_node"
    if intent == "show_plan": return "show_plan_node"
    if intent == "show_calendar": return "show_calendar_node"
    if intent == "show_calendar_range": return "show_calendar_range_node"
    if intent == "calendar_delete": return "calendar_delete_node"
    if intent == "plan_delete": return "plan_delete_node"
    if intent == "ask_plan_details": return "ask_plan_details_node"
    if intent == "calendar_register": return "calendar_register_node"
    if intent == "modify": return "retrieve_node"
    return "simple_chat_node"

# 2. Retry Decision (Think Node Result)
def think_result_decision(state: AgentState) -> Literal["end", "retry"]:
    if state.get("final_response"):
        return "end" # 성공
    return "retry" # 실패 -> 다시 think_node

workflow = StateGraph(AgentState)

# 노드 등록
workflow.add_node("router", router_node)
workflow.add_node("cart_node", cart_node)
workflow.add_node("checkout_node", checkout_node)
workflow.add_node("show_plan_node", show_plan_node)
workflow.add_node("show_calendar_node", show_calendar_node)
workflow.add_node("show_calendar_range_node", show_calendar_range_node)
workflow.add_node("calendar_delete_node", calendar_delete_node)
workflow.add_node("plan_delete_node", plan_delete_node)
workflow.add_node("ask_plan_details_node", ask_plan_details_node)
workflow.add_node("calendar_register_node", calendar_register_node)
workflow.add_node("simple_chat_node", simple_chat_node)
workflow.add_node("retrieve_node", retrieve_node)
workflow.add_node("think_node", think_node)

# 엣지 연결
workflow.set_entry_point("router")

# 라우터 -> 각 기능
workflow.add_conditional_edges("router", route_decision)

# 기능 완료 후 종료
workflow.add_edge("cart_node", END)
workflow.add_edge("checkout_node", END)
workflow.add_edge("show_plan_node", END)
workflow.add_edge("show_calendar_node", END)
workflow.add_edge("show_calendar_range_node", END)
workflow.add_edge("calendar_delete_node", END)
workflow.add_edge("plan_delete_node", END)
workflow.add_edge("ask_plan_details_node", END)
workflow.add_edge("calendar_register_node", END)
workflow.add_edge("simple_chat_node", END)

# Modify 흐름 (Retrieve -> Think)
workflow.add_edge("retrieve_node", "think_node")

# [NEW] Think Node 재시도 루프 (Conditional Edge)
workflow.add_conditional_edges(
    "think_node",
    think_result_decision,
    {
        "end": END,          # 성공 시 종료
        "retry": "think_node" # 실패 시 재시도
    }
)

app = workflow.compile()

# ==========================================
# [Endpoint] Chat with LangGraph
# ==========================================
@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(payload: ChatRequest, db: Session = Depends(get_db)):
    try:
        # 1. Member 조회 및 생성
        member = db.query(Member).filter(Member.id == payload.member_id).first()
        if not member:
            placeholder_login = f"guest_{payload.member_id}"
            member = Member(login_id=placeholder_login, type="kakao")
            db.add(member)
            db.flush()

        # 2. ChatLog 관리 (스레드 지정 지원)
        chat_log = None
        requested_chat_log_id = getattr(payload, 'chat_log_id', None)
        is_new_chat = getattr(payload, 'new_chat', False)

        if not is_new_chat:
            if requested_chat_log_id:
                chat_log = db.query(ChatLog) \
                    .filter(ChatLog.id == requested_chat_log_id, ChatLog.member_id == member.id, ChatLog.is_deleted == False) \
                    .first()
                if not chat_log:
                    raise HTTPException(status_code=404, detail="Chat thread not found")
            else:
                chat_log = db.query(ChatLog) \
                    .filter(ChatLog.member_id == member.id, ChatLog.is_deleted == False) \
                    .order_by(ChatLog.updated_at.desc().nullslast(), ChatLog.created_at.desc()) \
                    .first()

        if not chat_log:
            chat_log = ChatLog(member_id=member.id, title=(payload.user_message[:120] if payload.user_message else None))
            db.add(chat_log)
            db.flush()

        # 3. 사용자 메시지 저장
        user_msg = ChatMessage(chat_log_id=chat_log.id, content=payload.user_message, role='user')
        db.add(user_msg)
        chat_log.updated_at = datetime.utcnow()
        db.flush()

        chat_history_payload = load_chat_history_payload(db, chat_log.id)

        # 4. LangGraph 실행
        inputs = {
            "user_message": payload.user_message,
            "current_plan": payload.current_plan,
            "db_session": db,
            "member_id": member.id,
            "chat_log_id": chat_log.id,
            "plan_message_id": getattr(payload, 'plan_message_id', None),
            "calendar_date": None,
            "calendar_range": None,
            "delete_meals": None,
            "plan_delete_day_map": None,
            "plan_delete_days": None,
            "plan_delete_meals": None,
            "intent": None,
            "retrieved_recipes": [],
            "final_response": None,
            "retry_count": 0,
            "chat_history": chat_history_payload
        }

        result = await app.ainvoke(inputs)
        final = result.get("final_response")

        # 5. 응답 처리 및 저장
        response_payload = None
        if final:
            if hasattr(final, "chat_log_id"):
                final.chat_log_id = chat_log.id
            assistant_msg = ChatMessage(chat_log_id=chat_log.id, content=final.message, role='assistant')
            db.add(assistant_msg)
            db.flush()
            db.commit() # ID 생성을 위해 커밋

            # Pydantic -> Dict 변환
            try:
                if hasattr(final, 'model_dump'):
                    payload = final.model_dump()
                elif hasattr(final, 'dict'):
                    payload = final.dict()
                else:
                    payload = dict(final)
            except Exception:
                payload = dict(final) if isinstance(final, dict) else {"response_type": getattr(final, 'response_type', None), "message": getattr(final, 'message', None)}

            payload['assistant_message_id'] = assistant_msg.id
            payload['chat_log_id'] = chat_log.id
            response_payload = payload

        db.commit()
        return response_payload if response_payload is not None else final

    except Exception as e:
        print(f"Graph Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chat/logs")
def get_chat_logs(member_id: int, db: Session = Depends(get_db)):
    """Return chat logs (threads) for a given member_id.

    Response shape: { "threads": [ { id, title, messages: [{ id, role, content, created_at }] } ] }
    """
    try:
        member = db.query(Member).filter(Member.id == member_id).first()
        if not member:
            raise HTTPException(status_code=404, detail="Member not found")

        logs = db.query(ChatLog).options(joinedload(ChatLog.messages)) \
            .filter(ChatLog.member_id == member.id, ChatLog.is_deleted == False) \
            .order_by(ChatLog.updated_at.desc().nullslast(), ChatLog.created_at.desc()).all()

        threads = []
        for l in logs:
            # sort messages ascending by created_at
            msgs = sorted(l.messages, key=lambda x: x.created_at if x.created_at is not None else datetime.min)
            serialized_msgs = [
                {
                    "id": m.id,
                    "role": m.role,
                    "content": m.content,
                    "created_at": m.created_at.isoformat() if m.created_at else None,
                }
                for m in msgs
            ]

            threads.append({
                "id": l.id,
                "title": l.title,
                "created_at": l.created_at.isoformat() if l.created_at else None,
                "updated_at": l.updated_at.isoformat() if l.updated_at else None,
                "messages": serialized_msgs,
            })

        return {"threads": threads}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Failed to fetch chat logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Approve AiMeal rows that were created for a given assistant ChatMessage id.
@router.post("/approve_plan")
def approve_plan(payload: dict, db: Session = Depends(get_db)):
    """Request body: { "assistant_message_id": <int> }
    This will set all AiMeal rows with request_id == assistant_message_id to status='approved'
    and set approved_at timestamp. Using instance assignment triggers ORM events to
    create MealCalendar entries via the `after_update` listener.
    """
    try:
        assistant_id = payload.get('assistant_message_id')
        if not assistant_id:
            raise HTTPException(status_code=400, detail="assistant_message_id is required")

        rows = db.query(AiMeal).filter(AiMeal.request_id == assistant_id).all()
        if not rows:
            return {"ok": True, "updated": 0}

        now = datetime.utcnow()
        updated = 0
        for r in rows:
            r.status = 'approved'
            r.approved_at = now
            updated += 1

        db.commit()
        return {"ok": True, "updated": updated}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Approve plan error: {e}")
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# [Endpoint] Query (Initial Recommendation)
# ==========================================
def query_retrieve_node(state: RecState, config):
    db: Session = config["configurable"]["db"]
    query = state["user_query"]
    limit_count = state.get("candidate_limit", 20)
    query_vector = voyage_client.embed([query], model="voyage-3.5", input_type="query").embeddings[0]
    results = db.query(Recipe) \
        .options(joinedload(Recipe.product_links).joinedload(RecipeProduct.product)) \
        .order_by(Recipe.embedding.cosine_distance(query_vector)) \
        .limit(limit_count).all()
    recipes_data = []
    for r in results:
        price = calculate_recipe_cost(r)
        recipes_data.append({
            "id": r.id, "name": r.name, "price": price,
            "ingredient": r.ingredient, "thumbnail": r.thumbnail
        })
    return {"retrieved_recipes": recipes_data}

def query_selection_node(state: RecState):
    query = state["user_query"]
    candidates = state["retrieved_recipes"]
    days = state["period_days"]
    meals = state["target_meals"]
    if not candidates: return {"final_plan": None}
    candidates_text = "\n".join([f"- {r['name']} ({r['price']}원)" for r in candidates])
    prompt = f"""
    Create a meal plan (JSON).
    Request: "{query}"
    Days: {days}, Meals: {meals}
    [Candidates]: {candidates_text}
    Output Schema: {{ "meal_plan": [ {{ "day": 1, "meals": [ {{ "meal_type": "아침", "recipe_name": "..." }} ] }} ] }}
    NO MARKDOWN.
    """
    try:
        data = llm_invoke_json(prompt)
        return {"final_plan": MealPlanOutput(**data)} if data else {"final_plan": None}
    except Exception as e:
        return {"final_plan": None}

query_workflow = StateGraph(RecState)
query_workflow.add_node("retrieve", query_retrieve_node)
query_workflow.add_node("select", query_selection_node)
query_workflow.set_entry_point("retrieve")
query_workflow.add_edge("retrieve", "select")
query_workflow.add_edge("select", END)
legacy_app = query_workflow.compile()

@router.post("/query", response_model=RecommendationResponse)
async def recommend_recipe(payload: RecommendationRequest, db: Session = Depends(get_db)):
    try:
        # ---------------------------------------------------------
        # 1. Member 및 ChatLog 확보 (DB 저장을 위해 필수)
        # ---------------------------------------------------------
        # 프론트엔드에서 member_id를 보내지 않을 수도 있으므로 헤더나 토큰에서 가져오는 게 정석이나,
        # 현재 구조상 임시로 1번 유저 혹은 payload에 member_id가 없으면 에러가 날 수 있음.
        # 편의상 member_id가 없으면 Guest 처리 혹은 에러 처리 필요.
        # 여기서는 ChatRequest와 맞추기 위해 payload에 member_id가 있다고 가정하거나, 임시 유저를 사용.

        # [주의] AIMealPlanner에서 member_id를 안 보내면 DB 저장이 불가능합니다.
        # 실제 서비스에선 payload에 member_id를 추가하거나 JWT에서 추출해야 합니다.
        # 임시 조치: member_id가 없으면 Guest User(ID:1) 등으로 가정하거나 생성
        current_member_id = getattr(payload, 'member_id', 1)

        member = db.query(Member).filter(Member.id == current_member_id).first()
        if not member:
            member = Member(id=current_member_id, login_id=f"guest_{current_member_id}", type="kakao")
            db.add(member)
            db.flush()

        # 새 채팅방 생성 (초기 추천은 항상 새로운 주제이므로)
        chat_log = ChatLog(member_id=member.id, title=f"{payload.period} 식단 추천 요청")
        db.add(chat_log)
        db.flush()

        # 사용자 메시지 저장
        req_text = f"기간: {payload.period}, 끼니: {', '.join(payload.meals or [])}, 재료: {', '.join(payload.ingredients or [])}, 요청: {payload.request}"
        user_msg = ChatMessage(chat_log_id=chat_log.id, content=req_text, role='user')
        db.add(user_msg)
        db.flush()

        # ---------------------------------------------------------
        # 2. AI 추천 로직 실행 (기존 코드 유지)
        # ---------------------------------------------------------
        period_map = {"1일": 1, "3일": 3, "7일": 7}
        days = period_map.get(payload.period, 1)
        if days > 7: days = 7
        target_meals = payload.meals if payload.meals else ["아침", "점심", "저녁"]
        limit = max(10, min(days * len(target_meals) * 3, 60))

        initial_state = {
            "user_query": req_text, "period_days": days, "target_meals": target_meals,
            "candidate_limit": limit, "retrieved_recipes": [], "final_plan": None
        }

        config = {"configurable": {"db": db}}
        result = legacy_app.invoke(initial_state, config=config)

        # ---------------------------------------------------------
        # 3. 결과 구조화 및 DB 저장 (AiMeal)
        # ---------------------------------------------------------
        plan_output = result.get("final_plan")
        candidates_map = {r["name"]: r for r in result["retrieved_recipes"]}

        structured_response = [] # DailyPlanResponse 리스트

        if plan_output and plan_output.meal_plan:
            for day_plan in plan_output.meal_plan:
                daily_meals = {}
                for meal in day_plan.meals:
                    r_data = candidates_map.get(meal.recipe_name)
                    info = PlanRecipeInfo(
                        id=r_data["id"] if r_data else None,
                        name=meal.recipe_name,
                        thumbnail=r_data.get("thumbnail") if r_data else None,
                        ingredient=r_data.get("ingredient") if r_data else None,
                        price=r_data.get("price", 0) if r_data else 0
                    )
                    daily_meals[meal.meal_type] = info

                # date_str은 초기 추천에선 보통 없으므로 None
                structured_response.append(DailyPlanResponse(
                    day=day_plan.day,
                    date_str=None,
                    meals=daily_meals
                ))

        # (1) Assistant 메시지 저장
        ai_response_text = f"{payload.period} 동안의 식단을 추천해 드립니다."
        assistant_msg = ChatMessage(chat_log_id=chat_log.id, content=ai_response_text, role='assistant')
        db.add(assistant_msg)
        db.flush()

        # (2) AiMeal (Pending) 저장 - 날짜 계산 로직 적용
        try:
            # 사용자의 마지막 일정 조회
            last_entry_date = db.query(func.max(MealCalendar.meal_date)) \
                .filter(MealCalendar.user_id == member.id).scalar()

            tomorrow = datetime.now().astimezone().date() + timedelta(days=1)

            # 기준일 설정 (이어붙이기 or 내일)
            if last_entry_date and last_entry_date >= datetime.now().astimezone().date():
                base_date = last_entry_date + timedelta(days=1)
            else:
                base_date = tomorrow

            for day_res in structured_response:
                day_idx = day_res.day
                # 날짜 계산
                calc_date = base_date + timedelta(days=max(0, day_idx - 1))

                # 각 끼니별 저장
                if hasattr(day_res, 'meals') and isinstance(day_res.meals, dict):
                    for m_type, m_info in day_res.meals.items():
                        # Recipe ID 추출
                        r_id = getattr(m_info, 'id', None)
                        if not r_id and isinstance(m_info, dict):
                            r_id = m_info.get('id')

                        if r_id:
                            ai_meal = AiMeal(
                                request_id=assistant_msg.id,
                                recipe_id=r_id,
                                meal_date=calc_date,
                                meal_type=m_type,
                                status='pending' # 등록 대기 상태
                            )
                            db.add(ai_meal)

            db.commit()

        except Exception as db_err:
            print(f"Failed to save initial AiMeals: {db_err}")
            # 식단 추천 자체는 성공했으므로 롤백하지 않고 진행할 수도 있으나, 데이터 정합성을 위해 경고 로그

        first_match = {}
        if structured_response and structured_response[0].meals:
            # Pydantic 모델을 dict로 변환
            first_val = list(structured_response[0].meals.values())[0]
            first_match = first_val.model_dump() if hasattr(first_val, 'model_dump') else first_val.__dict__

        candidates_list = [
            {"id": r["id"], "name": r["name"], "thumbnail": r["thumbnail"], "ingredient": r["ingredient"]}
            for r in result["retrieved_recipes"]
        ]

        return RecommendationResponse(
            query=req_text,
            best_match=first_match,
            meal_plan=structured_response,
            candidates=candidates_list,
            assistant_message_id=assistant_msg.id # [중요] ID 반환
        )

    except Exception as e:
        print(f"Error in /query: {e}")
        # rollback은 상황에 따라
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# [Endpoint] Get user's meal calendar
# ==========================================
@router.get("/calendar")
def get_meal_calendar(member_id: int = None, db: Session = Depends(get_db)):
    """Return meal calendar entries for a given user.
    Response: list of { meal_date: YYYY-MM-DD, meal_type: '아침'|'점심'|'저녁', recipe: {id, name, thumbnail} }
    """
    try:
        if not member_id:
            raise HTTPException(status_code=400, detail="member_id is required")

        rows = db.query(MealCalendar).filter(MealCalendar.user_id == member_id).all()

        out = []
        for r in rows:
            ai = None
            try:
                ai = db.query(AiMeal).filter(AiMeal.id == r.ai_meal_id).first()
            except Exception:
                ai = None

            recipe = None
            if ai and getattr(ai, 'recipe_id', None):
                recipe = db.query(Recipe).filter(Recipe.id == ai.recipe_id).first()

            out.append({
                "meal_date": r.meal_date.isoformat(),
                "meal_type": r.meal_type,
                "recipe": {
                    "id": recipe.id if recipe else None,
                    "name": recipe.name if recipe else None,
                    "thumbnail": recipe.thumbnail if recipe else None,
                },
            })

        return out
    except HTTPException:
        raise
    except Exception as e:
        print(f"Get calendar error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

ALLOWED = {"image/jpeg", "image/png", "image/webp", "image/gif"}

def url_to_base64_url(image_url: str) -> str:
    r = httpx.get(image_url, timeout=30, follow_redirects=True)
    r.raise_for_status()

    # 예: "image/jpeg; charset=binary" 같은 형태일 수 있어서 ; 앞만 사용
    content_type = (r.headers.get("content-type") or "").split(";")[0].strip().lower()
    if content_type not in ALLOWED:
        raise ValueError(f"Unsupported content-type: {content_type}")

    b64 = base64.b64encode(r.content).decode("utf-8")
    return f"data:{content_type};base64,{b64}"

def build_msg(image_urls: list[str]) -> HumanMessage:
    prompt_text = """
    You are a skilled Food MD and Culinary Expert. 
    Analyze the product images to create a **rich, 3-line summary** that persuades the user to buy and cook with this product.

    **Structure (Strictly 3 Lines):**

    **Line 1: The "Flavor Hook" (Taste & Feature)**
    - Describe the specific taste profile and unique texture/ingredient.
    - Use sensory adjectives (e.g., "Tangy lemon finish", "Deep aged flavor").
    - Example: "국산 마늘을 듬뿍 넣어 알싸하고 깊은 감칠맛이 살아있는 초장."

    **Line 2: The "Culinary Tip" (Usage & Pairing)**
    - Suggest **specific dishes** or usage tips suitable for a recipe app.
    - Format: Start with an emoji like 💡 or 🍽️.
    - Example: "💡 Tip: 싱싱한 광어회는 물론, 입맛 없는 날 비빔국수 소스로 강력 추천!"

    **Line 3: The "Essential Specs" (Data)**
    - Format: (Volume or Weight / Calories per serving / Key Ingredient or Nutrient / Storage)
    - Keep it data-focused and use slashes (/) as separators.
    - Example: (300g / 100g당 120kcal / 나트륨 400mg / 냉장보관)

    **Constraints:**
    - **Language:** Korean.
    - **Exclusions:** No "Coupang", "Rocket Fresh", or delivery text.
    - **Tone:** Appetizing, helpful, and professional.
    - **Output:** Exactly 3 lines separated by newlines.
    """

    content = [{"type": "text", "text": prompt_text}]

    for u in image_urls:
        content.append({"type": "image_url", "image_url": {"url": url_to_base64_url(u)}})
    return HumanMessage(content=content)

@router.post("/analyze-product-image")
def analyze_product_image(req: AnalyzeReq, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == req.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="product not found")

    if product.description:
        return product.description

    detail_image_urls = [u.strip() for u in product.detail_images.split("|") if u]
    if not detail_image_urls:
        raise HTTPException(status_code=400, detail="no images")

    msg = build_msg(detail_image_urls)
    res = llm.invoke([msg]).content

    product.description = res
    db.commit()

    return res
