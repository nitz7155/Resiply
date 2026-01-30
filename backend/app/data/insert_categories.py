import os
import json
import argparse
import logging
from pathlib import Path
from dotenv import load_dotenv
import psycopg2
import psycopg2.extras

load_dotenv()

LOG = logging.getLogger('insert_categories')

DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")


def get_conn_from_env():
    # prefer an explicit DATABASE_URL env var if provided
    db_url = os.environ.get('DATABASE_URL') or os.environ.get('DATABASE_URI')
    if not db_url:
        # fall back to assembled URL if env parts provided
        if DB_USER and DB_PASSWORD and DB_HOST and DB_PORT and DB_NAME:
            db_url = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

    if db_url:
        try:
            return psycopg2.connect(db_url)
        except UnicodeDecodeError as e:
            LOG.error('Unicode decode error when connecting using DATABASE_URL')
            raise RuntimeError(
                'DB 연결 시 인코딩 오류가 발생했습니다. 환경변수에 비 ASCII 문자가 포함되어 있을 수 있습니다. '
                '비밀번호나 사용자명에 특수문자가 있는지 확인하거나, 비밀번호를 URL-encode 하여 DATABASE_URL에 넣어보세요.'
            ) from e

    # final fallback - try connect with kwargs
    try:
        return psycopg2.connect(host=DB_HOST, port=int(DB_PORT) if DB_PORT else 5432,
                                dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD)
    except UnicodeDecodeError as e:
        LOG.error('Unicode decode error when connecting with individual params')
        raise RuntimeError(
            'DB 연결 시 인코딩 오류가 발생했습니다. 환경변수에 비 ASCII 문자가 포함되어 있을 수 있습니다.'
        ) from e


def load_json(path: Path):
    with path.open('r', encoding='utf-8') as f:
        return json.load(f)


def extract_names(data: dict):
    majors = list(data.keys())
    categories = set()
    cat_to_major = {}
    for major_name, major_val in data.items():
        if isinstance(major_val, dict):
            for subcat in major_val.keys():
                categories.add(subcat)
                if subcat not in cat_to_major:
                    cat_to_major[subcat] = major_name
    return majors, sorted(categories), cat_to_major


def bulk_insert(conn, table: str, names):
    if not names:
        return 0
    cur = conn.cursor()
    # Use INSERT ... SELECT ... WHERE NOT EXISTS to avoid requiring a UNIQUE constraint
    q = f"INSERT INTO {table} (name) SELECT %s WHERE NOT EXISTS (SELECT 1 FROM {table} WHERE name = %s)"
    params = [(n, n) for n in names]
    psycopg2.extras.execute_batch(cur, q, params, page_size=100)
    cur.close()
    return len(names)


def insert_categories_with_parent(conn, cat_to_major: dict, major_name_to_id: dict):
    if not cat_to_major:
        return 0
    cur = conn.cursor()
    q = (
        "INSERT INTO category (name, major_category_id) "
        "SELECT %s, %s WHERE NOT EXISTS (SELECT 1 FROM category WHERE name = %s)"
    )
    params = []
    for cat, major_name in cat_to_major.items():
        major_id = major_name_to_id.get(major_name)
        if major_id is None:
            LOG.warning('Major id not found for %s -> %s; skipping', cat, major_name)
            continue
        params.append((cat, major_id, cat))

    if not params:
        cur.close()
        return 0

    psycopg2.extras.execute_batch(cur, q, params, page_size=100)
    cur.close()
    return len(params)


def main():
    parser = argparse.ArgumentParser(description='Insert categories from JSON into PostgreSQL')
    parser.add_argument('--json', '-j', default=str(Path(__file__).resolve().parents[1] / 'data' / 'classified_food.json'),
                        help='Path to classified_food.json')
    parser.add_argument('--dry-run', action='store_true', help="Don't commit changes; just show what would be inserted")
    parser.add_argument('--log-level', default='INFO')
    args = parser.parse_args()

    logging.basicConfig(level=getattr(logging, args.log_level.upper(), logging.INFO),
                        format='%(asctime)s %(levelname)s %(message)s')

    json_path = Path(args.json)
    if not json_path.exists():
        LOG.error('JSON file not found: %s', json_path)
        return

    data = load_json(json_path)
    majors, categories, cat_to_major = extract_names(data)

    LOG.info('Majors found: %d, Categories found: %d', len(majors), len(categories))

    conn = get_conn_from_env()
    try:
        # insert majors first and commit so we can reliably fetch their ids
        LOG.info('Inserting major categories...')
        inserted_majors = bulk_insert(conn, 'major_category', majors)

        if args.dry_run:
            LOG.info('Dry-run enabled after major insert, rolling back and exiting')
            conn.rollback()
            inserted_cats = 0
            LOG.info('Done. Attempted inserts - majors: %d, categories: %d', inserted_majors, inserted_cats)
            return
        else:
            conn.commit()

        # fetch major ids
        with conn.cursor() as qcur:
            qcur.execute("SELECT id, name FROM major_category WHERE name = ANY(%s)", (majors,))
            rows = qcur.fetchall()
        major_name_to_id = {name: mid for (mid, name) in rows}

        LOG.info('Inserting categories with parent ids...')
        inserted_cats = insert_categories_with_parent(conn, cat_to_major, major_name_to_id)

        if args.dry_run:
            LOG.info('Dry-run enabled after category insert, rolling back')
            conn.rollback()
        else:
            conn.commit()

        LOG.info('Done. Attempted inserts - majors: %d, categories: %d', inserted_majors, inserted_cats)
    finally:
        conn.close()


if __name__ == '__main__':
    main()
