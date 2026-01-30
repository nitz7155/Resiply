import os
import voyageai
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Product, Recipe, RecipeProduct, Category
from sqlalchemy import case, or_


# -----------------------------------------------------------
# 1. 환경 설정 및 경로 추가
# -----------------------------------------------------------
# .env 파일 로드
load_dotenv()

# Voyage Client 설정
EMBEDDING_API_KEY = os.getenv('EMBEDDING_API_KEY')
if not EMBEDDING_API_KEY:
    raise ValueError("❌ .env 파일에 'EMBEDDING_API_KEY'가 없습니다.")

client = voyageai.Client(api_key=EMBEDDING_API_KEY)

# -----------------------------------------------------------
# 2. 내부 로직 함수 (임베딩 생성 & 상품 매칭)
# -----------------------------------------------------------
def _generate_embeddings(db: Session):
    """
    [내부 함수] Product, Recipe, RecipeProduct 테이블을 순회하며
    임베딩이 비어있는 데이터(NULL)를 찾아 채워줍니다.
    """
    target_models = [Product, Recipe, RecipeProduct]
    total_updated_count = 0
    BATCH_SIZE = 128  # Voyage AI 권장 배치 사이즈

    print("\n🚀 [1단계] 데이터 임베딩 생성 시작...")

    for ModelClass in target_models:
        table_name = ModelClass.__tablename__

        # 임베딩이 없는 데이터 조회
        items = db.query(ModelClass).filter(ModelClass.embedding == None).all()
        count = len(items)

        if count == 0:
            print(f"   Skip: '{table_name}' 테이블은 이미 최신 상태입니다.")
            continue

        print(f"   🔄 '{table_name}' 테이블 업데이트 대상: {count}개")

        # 배치 처리 루프
        for i in range(0, count, BATCH_SIZE):
            batch_items = items[i : i + BATCH_SIZE]
            batch_texts = []

            # 모델별 텍스트 조합 로직 (None 값 방지 포함)
            if ModelClass == Product:
                # 상품명과 긴 설명(title)을 합쳐서 검색 품질 향상
                batch_texts = [f"상품: {p.name}, 설명: {p.title or ''}" for p in batch_items]

            elif ModelClass == Recipe:
                # 레시피 이름과 재료 목록을 합침
                batch_texts = [f"요리: {p.name}, 재료: {p.ingredient or ''}" for p in batch_items]

            elif ModelClass == RecipeProduct:
                # 재료 이름 자체가 중요함
                batch_texts = [f"식자재: {p.ingredient or ''}" for p in batch_items]

            # Voyage API 호출
            try:
                response = client.embed(
                    batch_texts,
                    model="voyage-3.5", # 범용 고성능 모델
                    input_type="document"
                )

                # 결과 매핑
                for item, vector in zip(batch_items, response.embeddings):
                    item.embedding = vector

            except Exception as api_error:
                print(f"   ⚠️ API 호출 중 에러 발생: {api_error}")
                break # 에러 나면 해당 테이블 루프 중단

        # 테이블 하나 끝날 때마다 커밋
        db.commit()
        total_updated_count += count
        print(f"   ✅ '{table_name}' 업데이트 완료!")

    print(f"✨ [1단계 완료] 총 {total_updated_count}개의 임베딩 생성됨.")

def _match_ingredients_to_products(db: Session):
    """
    [내부 함수] RecipeProduct(재료)의 임베딩을 이용해
    Product(판매 상품) 중 가장 유사한 것을 찾아 연결합니다.
    """
    # 유의어사전
    SYNONYMS = {
    "파프리카": "피망",
    "달걀": "계란",
    "참치캔": "참치통조림",
    "물": "생수",
    "파": "대파",
    "밥": "햇반",
    }

    print("\n🔗 [2단계] 재료-상품 자동 매칭 시작...")

    # 임베딩은 있지만, 아직 상품 연결이 안 된 재료 조회
    target_ingredients = db.query(RecipeProduct).filter(
        RecipeProduct.embedding.isnot(None),
        RecipeProduct.product_id.is_(None)
    ).all()

    if not target_ingredients:
        print("   Skip: 연결할 대상이 없습니다.")
        return

    print(f"   🔍 총 {len(target_ingredients)}개의 재료에 대해 짝꿍 상품을 찾습니다.")

    matched_count = 0

    for item in target_ingredients:
        
        # 안전: ingredient가 None일 수 있으므로 빈 문자열로 대체
        raw_keyword = item.ingredient or ""
        keyword = raw_keyword.strip()

        if not keyword:
            # 빈 값이면 매칭 시도하지 않음
            continue

        # 유의어사전 조회 유사어 뽑기
        alt_keyword = SYNONYMS.get(keyword)

        # 1. 카테고리 점수
        cat_score = case(
            # 카테고리 이름이 재료이름 또는 유의어와 똑같은 경우
            (or_(Category.name == keyword, Category.name == alt_keyword), 5000.0),
            # 카테고리 이름에 재료이름 또는 유의어가  포함된 경우
            (or_(Category.name.like(f"%{keyword}%"), Category.name.like(f"%{alt_keyword}%")), 2000.0),
            else_=0.0
        )

        # 2. 상품명 점수
        name_score = case(
            # 상품명이 재료이름 또는 유의어와 똑같은 경우
            (or_(Product.title == keyword, Product.title == alt_keyword), 500.0),
            # 상품명에 재료이름 또는 유의어가 포함된 경우
            (Product.title.like(f"%{keyword}%"), 100.0),
            else_=0.0
        )

        # 3. 벡터 점수 (미세 조정)
        # (1 - distance)는 보통 0~1 사이 값이므로, 30을 곱하면 최대 30점입니다.
        vec_score = (1 - Product.embedding.cosine_distance(item.embedding)) * 30.0

        # 최종 합산
        total_score = (cat_score + name_score + vec_score).label("total_score")

        # 5. 쿼리 실행
        top_match = db.query(Product).join(Category, Product.category_id == Category.id).filter(Product.is_active == True).order_by(total_score.desc()).limit(1).first()

        if top_match:
            item.product_id = top_match.id
            matched_count += 1

        # print(f"{keyword}와 가장 유사한 제품은 {top_match.title}입니다.")
    db.commit()
    print(f"✨ [2단계 완료] {matched_count}개의 재료가 상품과 연결되었습니다!")


# -----------------------------------------------------------
# 3. 메인 실행 함수 (요청하신 함수명)
# -----------------------------------------------------------

def data_embedding_func():
    """
    전체 데이터 파이프라인을 실행하는 메인 함수입니다.
    1. 빈 데이터 임베딩 생성
    2. 생성된 임베딩 기반으로 상품 자동 매칭
    """
    db = SessionLocal()

    try:
        # 1단계: 임베딩 생성
        _generate_embeddings(db)

        # 2단계: 상품 연결
        _match_ingredients_to_products(db) 

        print("\n🎉 모든 작업이 성공적으로 끝났습니다.")

    except Exception as e:
        print(f"\n❌ 치명적인 에러 발생: {e}")
        db.rollback()
    finally:
        db.close()