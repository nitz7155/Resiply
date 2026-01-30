import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")

DB_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_engine(
    DB_URL
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def create_tables():
    import models

    tables = [table for table in Base.metadata.sorted_tables if not table.info.get("is_view")]
    Base.metadata.create_all(bind=engine, tables=tables)

    with engine.begin() as conn:
        conn.execute(text("""
        CREATE OR REPLACE VIEW recommend_view AS
            SELECT
              member_id,
              product_id,
              ROUND(AVG(rating))::int AS rating,
              MAX(COALESCE(updated_at, created_at)) AS updated_at
            FROM product_review
            GROUP BY member_id, product_id
        """))