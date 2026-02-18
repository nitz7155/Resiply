import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import create_tables
from routers import product, categories, search, kakao, cookingtips, order, \
                    recipe, recommendations, wishlist, review, recipe_bookmark, mypage, mf_recommend
from data_scripts.data_insert import data_insert_func
from data.insert_cookingtips import insert_cookingtips_func
from data_scripts.data_embedding import data_embedding_func
from mf_services.mf_services import run_mf_pipeline
from routers.recommendations import start_scheduler, shutdown_scheduler

# 1. 서버 시작 시 실행될 로직 분리
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("서버를 시작합니다: 테이블 생성 중...")
    try:
        create_tables()
        data_insert_func()
        insert_cookingtips_func()
        data_embedding_func()
        run_mf_pipeline()
        start_scheduler()
    except Exception as e:
        print(f"DB 연결 에러: {e}")
    yield
    print("서버를 종료합니다.")
    shutdown_scheduler()

app = FastAPI(title="Resiply Backend", lifespan=lifespan)

# include routers
app.include_router(product.router)
app.include_router(categories.router)
app.include_router(search.router)
app.include_router(cookingtips.router)
app.include_router(kakao.router)
app.include_router(order.router)
app.include_router(recipe.router)
app.include_router(recommendations.router)
app.include_router(wishlist.router)
app.include_router(review.router)
app.include_router(recipe_bookmark.router)
app.include_router(mypage.router)
app.include_router(mf_recommend.router)

# CORS 설정: credentials include를 위해 구체적인 origin 명시
origins = [
    "http://localhost:5173",  # Vite 개발 서버
    "http://localhost:3000",  # 대체 포트
    "http://localhost:3001",  # 대체 포트
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "Resiply Backend is running"}


if __name__ == "__main__":
    # 파일명이 main.py가 맞는지 꼭 확인하세요!
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
