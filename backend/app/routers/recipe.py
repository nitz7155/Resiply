from fastapi import APIRouter, Depends, Query, Cookie, HTTPException
from sqlalchemy import text, func
from sqlalchemy.orm import Session
import json
from database import get_db, SessionLocal
from models import Recipe, RecipeStep, RecipeProduct, Product, Taste, RecipeTip
from typing import List
import numpy as np
import os
from sklearn.metrics.pairwise import cosine_similarity
import voyageai
from langchain_openai import ChatOpenAI
from schemas.recipe import RecipeTipsResponse
from pydantic import ValidationError
import requests

router = APIRouter(prefix="/api/recipe", tags=["레시피 관리"])

VOYAGE_API_KEY = os.getenv("EMBEDDING_API_KEY")
voyage_client = voyageai.Client(api_key=VOYAGE_API_KEY)

CUSTOM_API_KEY = os.getenv("LLM_API_KEY")
CUSTOM_BASE_URL = os.getenv("LLM_BASE_URL")
CUSTOM_MODEL_NAME = "gemini-3-flash-preview"

# llm = ChatOpenAI(
#     api_key=CUSTOM_API_KEY,
#     base_url=CUSTOM_BASE_URL,
#     model=CUSTOM_MODEL_NAME,
#     temperature=0
# )

def get_copilot_token(github_token: str):
    url = "https://api.github.com/copilot_internal/v2/token"
    headers = {
        "Authorization": f"token {github_token}",
        "Editor-Version": "vscode/1.85.0",
        "Editor-Plugin-Version": "copilot/1.143.0",
        "User-Agent": "GitHubCopilot/1.143.0"
    }
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        data = response.json()
        return data.get("token")
    else:
        raise Exception(f"토큰 발급 실패: {response.status_code} {response.text}")

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")

real_access_token = get_copilot_token(GITHUB_TOKEN)

llm = ChatOpenAI(
    api_key=real_access_token,
    model="gpt-4.1",
    base_url="https://api.githubcopilot.com",
    temperature=0,
    default_headers={
        "Authorization": f"Bearer {real_access_token}",
        "Editor-Version": "vscode/1.85.0",
        "Editor-Plugin-Version": "copilot/1.143.0",
        "User-Agent": "GitHubCopilot/1.143.0",
        "Copilot-Vision-Request": "true"
    }
)

def get_recipe_cnt():
    db = SessionLocal()

    try:
        recipe = db.query(Recipe).all()

        if len(recipe) == 0:
            insert_recipe_data("data/recipe_data.csv", db)

    finally:
        db.close()
        
def insert_recipe_data(filename: str, db: Session):
    """
    레시피 데이터, 레시피별 단계 데이터 자동 추가 함수
    insert_recipe_data("10000recipe_result_20260107_123618.csv")
    """
    import pandas as pd

    df = pd.read_csv(filename)
    df = df.dropna(subset=["Ingredient"])
    df["Condiment"] = df["Condiment"].fillna("")
    df["Full_Ingredient"] = df.apply(lambda x: f"{x['Ingredient']},{x['Condiment']}".strip(","), axis=1)
    df.drop_duplicates(ignore_index=True)

    # 테스트를 위해 상위 20개만 사용
    recipe_data = df.head(20)

    for _, row in recipe_data.iterrows():
        new_recipe = Recipe(
            name=row["Title"],
            ingredient=row["Full_Ingredient"],
            time=row["Preparation_Time"],
            thumbnail=row["Main_Thumbnail"]
        )
        db.add(new_recipe)
        db.flush() 

        # ===== 레시피&식재료 테이블 =====
        prod_list = row["Full_Ingredient"]
        for prod in prod_list.split(","):
           ingredient = prod.split("-")[0]

           new_recipe_prod = RecipeProduct(
               recipe_id=new_recipe.id,
               ingredient=ingredient,
           )

           db.add(new_recipe_prod)

        # ===== 레시피 조리단계 테이블  =====
        steps_text = row["Steps"]
        for line in steps_text.split("\n"):
            if "||" not in line: continue 
            
            parts = line.split("||")
            step_no = parts[0].replace("단계", "").strip()
            description = parts[1].strip()
            image = parts[2].strip() if len(parts) > 2 else ""
            
            new_step = RecipeStep(
                recipe_id=new_recipe.id,
                step_number=int(step_no),
                description=description,
                url=image
            )
            db.add(new_step)

    try:
        db.commit() # 모든 데이터 한꺼번에 확정
        print("데이터 저장 완료!")
    except Exception as e:
        db.rollback() # 에러 발생 시 되돌리기
        print(f"저장 실패: {e}")

@router.get("")
def get_recipes_list(db: Session = Depends(get_db)):
    """레시피 정보 리턴"""
    recipes = db.query(Recipe).all()

    return [
        {
            "id": r.id,
            "name": r.name,
            "ingredient": r.ingredient,
            "time": r.time,
            "thumbnail": r.thumbnail,
        } for r in recipes
    ]


@router.get("/random")
def get_random_recipes(limit: int = 4, db: Session = Depends(get_db)):
    """레시피에서 랜덤 샘플을 리턴합니다 (기본 4개)."""
    recipes = db.query(Recipe).order_by(func.random()).limit(limit).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "ingredient": r.ingredient,
            "time": r.time,
            "thumbnail": r.thumbnail,
        }
        for r in recipes
    ]

@router.get("/recommend")
def get_recommend_recipe(
    db: Session = Depends(get_db),
    ids: List[int] = Query(None)):

    """
    ----------------------------------------
    장바구니 상품 기반 유사한 레시피 추천 API
    - ids: 장바구니에 담긴 상품 ID 리스트
    ----------------------------------------
    """
    if not ids:
        return []
    
    # 1. 장바구니 상품들 가져오기
    products = db.query(Product).filter(Product.id.in_(ids)).all()
    if not products:
        return []
        
    # 2. 전체 레시피 로드 (임베딩이 있는 것만)
    all_recipes = db.query(Recipe).filter(Recipe.embedding != None).all()
    if not all_recipes:
        return []
    
    # 레시피 임베딩 배열 생성
    recipe_embeddings = np.array([r.embedding for r in all_recipes])
    
    # 3. 각 레시피의 최종 점수를 저장할 딕셔너리 {recipe_id: max_score}
    # 초기값은 매우 낮은 점수로 설정
    recipe_scores = {r.id: -1.0 for r in all_recipes}
    recipe_map = {r.id: r for r in all_recipes}

    # 4. 각 상품별로 루프를 돌며 레시피들과의 유사도 계산 (핵심!)
    for p in products:
        if p.embedding is None:
            continue
            
        p_vector = np.array(p.embedding).reshape(1, -1)
        # 현재 상품과 모든 레시피 간의 유사도 계산
        sims = cosine_similarity(p_vector, recipe_embeddings)[0]
        
        # 텍스트 매칭 보너스용 키워드 (상품명 앞글자)
        # keyword = p.name

        for idx, sim in enumerate(sims):
            r = all_recipes[idx]
            
            # 해당 상품(p)과 레시피(r) 사이의 점수 계산
            current_score = sim
            # if keyword in (r.ingredient or ""):
            #     current_score += 1.0  # 텍스트 일치 보너스
            
            # "최대 유사도" 전략: 이 레시피가 가진 기존 점수보다 높으면 업데이트
            if current_score > recipe_scores[r.id]:
                recipe_scores[r.id] = current_score

    # 5. 점수 높은 순으로 정렬
    sorted_recipe_ids = sorted(recipe_scores.items(), key=lambda x: x[1], reverse=True)
    
    # 6. 상위 4개 결과 생성
    top_4_recipes = [recipe_map[rid] for rid, score in sorted_recipe_ids[:4]]

    return [
        {
            "id": r.id,
            "title": r.name,
            "imageUrl": r.thumbnail,
            "cookTime": r.time,
        }
        for r in top_4_recipes
    ]

@router.get("/{id}")
def get_recipe(id: int, db: Session = Depends(get_db), user_id: int = Cookie(default=None)):
    """레시피 상세보기"""
    
    recipe = db.query(Recipe).filter(Recipe.id == id).first()
    recipe_steps = db.query(RecipeStep).filter(RecipeStep.recipe_id == id).order_by(RecipeStep.step_number).all()

    steps_data = [
        {
            "step_number": step.step_number,
            "description": step.description,
            "url": step.url
        }
        for step in recipe_steps
    ]
    
    recipe_ingredients = db.query(RecipeProduct, Product).join(Product, RecipeProduct.product_id == Product.id).filter(RecipeProduct.recipe_id == id).all()

    ingredients_list = []
    for rp, p in recipe_ingredients:
        # RecipeProduct에 저장된 원본 재료명(예: "달걀-3개")을 파싱
        name_raw = rp.ingredient or ""
        if "-" in name_raw:
            parts = name_raw.split("-")
            name_part = parts[0].strip() if parts[0] else ""
            qty_part = parts[1].strip() if len(parts) > 1 and parts[1] else ""
        else:
            name_part = name_raw.strip()
            qty_part = ""

        ingredients_list.append({
            "productId": p.id,
            "name": name_part,
            "qty": qty_part
        })

    # 4. 하단 추천 상품용 데이터 (기존 로직 유지)
    product_data = [{
        "id": p.id,
        "title": p.title,
        "price": p.price,
        "image": p.main_thumbnail
    } for _, p in recipe_ingredients]

    return {
        "id": recipe.id,
        "name": recipe.name,
        "description": recipe.description,
        "time": recipe.time,
        "ingredients": ingredients_list,
        "thumbnail": recipe.thumbnail,
        "steps": steps_data,
        "products": product_data,
        "description": recipe.description

    }

SYSTEM_RULE = "반드시 유효한 JSON만 출력. 다른 텍스트/마크다운 금지."

def build_tips_prompt(payload: dict) -> str:
    return f"""{SYSTEM_RULE}
        너는 레시피를 사용자 취향을 반영해 팁을 제공해주는 도우미이다.

        출력은 반드시 아래 JSON 형식만 사용:
        {{
        "recipe_id": {payload.get("recipe_id")},
        "tips": ["문장", "문장"]
        }}

        규칙:
        - tips에는 사용자 취향(likes/dislikes)을 반영한 '재료/조리 변경 제안' 문장만 작성
        - 예시 문장:
        - "불닭볶음면이 너무 맵다면 팔도비빔면으로 바꿔보세요."
        - "토마토소스 대신 칠리소스를 넣으면 더 좋아하실 거예요."
        - 원 레시피 정체성 유지
        - 비선호 재료가 레시피의 재료에 포함되지 않았으면 선호취향 위주의 팁 제공
        - tips는 1~2개만 생성 (없으면 빈 배열)

        입력(JSON): {json.dumps(payload, ensure_ascii=False)}
    """


def call_tips_llm(llm, payload: dict) -> RecipeTipsResponse:
    raw = llm.invoke(build_tips_prompt(payload)).content
    try:
        return RecipeTipsResponse.model_validate_json(raw)
    except ValidationError as e:
        retry = f"""{SYSTEM_RULE}
            너의 이전 출력이 JSON 형식을 어겼다. 아래 형식만 지켜라.
            형식:
            {{"recipe_id": {payload.get("recipe_id")}, "tips": ["문장"]}}
            다시 출력.
            입력(JSON): {json.dumps(payload, ensure_ascii=False)}
        """
        raw2 = llm.invoke(retry).content
        return RecipeTipsResponse.model_validate_json(raw2)

    
def parse_array(value):
    # None, "", 0 등
    if value is None:
        return []

    # 이미 리스트면 그대로
    if isinstance(value, list):
        return value

    # ✅ 빈 dict / dict는 배열이 아니니까 비어있으면 [] 처리
    if isinstance(value, dict):
        # {} 이면 빈 값 취급
        if len(value) == 0:
            return []
        # 혹시 {"items":[...]} 같은 형태로 온다면 여기에 대응 가능
        # 기본은 dict는 지원 안 함 → []
        return []

    # 문자열 처리
    if isinstance(value, str):
        v = value.strip()
        if not v:
            return []

        # PostgreSQL 배열 리터럴: {"매운맛","짠맛"}
        if v.startswith("{") and v.endswith("}"):
            inner = v[1:-1].strip()
            if not inner:
                return []
            return [item.strip().strip('"') for item in inner.split(",")]

        # JSON 문자열 리스트: ["매운맛","짠맛"]
        try:
            parsed = json.loads(v)
            if isinstance(parsed, list):
                return parsed
            if isinstance(parsed, dict) and len(parsed) == 0:
                return []
        except Exception:
            pass
        # 콤마 구분 문자열: "매운맛, 짠맛"
        return [x.strip() for x in v.split(",") if x.strip()]
    # 그 외 타입은 전부 빈 값 취급
    return []

@router.get("/{id}/tips")
def show_recipe_tips(id: int, db: Session = Depends(get_db), user_id: int = Cookie(default=None)):
    """
    ----------------------------------------
    AI가 사용자별 취향을 분석해서 팁 제공해주는 API
    
    팁 생성 후 취향 변경됐는지 검사
    - 변경됐으면 팁 새로 생성 
    - 변경되지 않았으면 캐싱된 팁 리턴
    ----------------------------------------
    """

    if not user_id:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    # 취향 수정내역 조회
    taste = db.query(Taste).filter(Taste.member_id == user_id).first()
    taste_last = None
    likes, dislikes = [], []

    cached = db.query(RecipeTip).filter(RecipeTip.member_id == user_id, RecipeTip.recipe_id == id).first()

    if taste:
        likes = parse_array(taste.like)
        dislikes = parse_array(taste.dislike)
        taste_last = taste.updated_at or taste.created_at

        if not likes and not dislikes:
            return {"tips": ["마이페이지에서 취향을 등록하고 맞춤 조언을 받아보세요."]}
    # 취향 추가하지 않은 경우
    else:
        return {"tips": ["마이페이지에서 취향을 등록하고 맞춤 조언을 받아보세요."]}
    
    # 캐시 조회
    if cached:
        cache_last = cached.updated_at or cached.created_at

        if cache_last >= taste_last:
            return {"tips": json.loads(cached.tips) if cached.tips else []}


    recipe = db.query(Recipe).filter(Recipe.id == id).first()
    recipe_steps = db.query(RecipeStep).filter(RecipeStep.recipe_id == id).order_by(RecipeStep.step_number).all()

    steps_data = [
        {
            "step_number": step.step_number,
            "description": step.description,
            "url": step.url
        }
        for step in recipe_steps
    ]
    
    recipe_ingredients = db.query(RecipeProduct, Product).join(Product, RecipeProduct.product_id == Product.id).filter(RecipeProduct.recipe_id == id).all()

    ingredients_list = []
    for rp, p in recipe_ingredients:
        # RecipeProduct에 저장된 원본 재료명(예: "달걀-3개")을 파싱
        name_raw = rp.ingredient or ""
        if "-" in name_raw:
            parts = name_raw.split("-")
            name_part = parts[0].strip() if parts[0] else ""
            qty_part = parts[1].strip() if len(parts) > 1 and parts[1] else ""
        else:
            name_part = name_raw.strip()
            qty_part = ""

        ingredients_list.append({
            "productId": p.id,
            "name": name_part,
            "qty": qty_part
        })

    # 4. 하단 추천 상품용 데이터 (기존 로직 유지)
    product_data = [{
        "id": p.id,
        "title": p.title,
        "price": p.price,
        "image": p.main_thumbnail
    } for _, p in recipe_ingredients]

    if user_id:
        taste = db.query(Taste).filter(Taste.member_id == user_id).first()
        if taste:
            likes = parse_array(taste.like)
            dislikes = parse_array(taste.dislike)

            payload = {
                "recipe_id": id,
                "taste": {"likes": likes, "dislikes": dislikes},
                "recipe": {
                    "name": recipe.name,
                    "ingredients": ingredients_list,
                    "steps": steps_data,
                },
                "style": "짧고 친근하게, 예시 포함(토마토소스→칠리소스 같은)",
            }

            tips_result = call_tips_llm(llm, payload)  # RecipeTipsResponse
            tips_list = tips_result.tips
            tips_json = json.dumps(tips_list, ensure_ascii=False)

    if cached:
        cached.tips = tips_json
        db.add(cached)
    else:
        new_tip = RecipeTip(member_id=user_id, recipe_id=id, tips=tips_json)
        db.add(new_tip)

    db.commit()

    return {"tips": tips_list}
    