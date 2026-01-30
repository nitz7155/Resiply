from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from database import get_db
import models
import re

router = APIRouter(prefix="/api", tags=["search"])


@router.get("/search")
def search_products_and_recipes(
    keyword: Optional[str] = Query(None, description="Search keyword to match product or recipe"),
    limit: int = Query(20, ge=1, le=200, description="Max results to return"),
    offset: int = Query(0, ge=0, description="Result offset for pagination"),
    db: Session = Depends(get_db),
):
    """Search products and recipes by `keyword`.

    Returns a mixed list of items with a `type` field set to either
    `product` or `recipe`. Each item contains the minimal fields the
    frontend needs to render a combined search result list.
    """
    if not keyword:
        return []

    like_pattern = f"%{keyword}%"

    # products matching name or title
    prod_q = (
        db.query(models.Product)
        .filter(models.Product.is_active == True)
        .filter(or_(models.Product.name.ilike(like_pattern), models.Product.title.ilike(like_pattern)))
        .offset(offset)
        .limit(limit)
    )

    products = prod_q.all()

    # recipes matching name, ingredient or step description
    # load steps to allow snippet construction
    rec_q = (
        db.query(models.Recipe)
        .options(joinedload(models.Recipe.steps))
        .filter(
            or_(
                models.Recipe.name.ilike(like_pattern),
                models.Recipe.ingredient.ilike(like_pattern),
                models.Recipe.steps.any(models.RecipeStep.description.ilike(like_pattern)),
            )
        )
        .offset(offset)
        .limit(limit)
    )

    recipes = rec_q.all()

    # normalize items for frontend
    items = []
    for p in products:
        items.append({
            "type": "product",
            "id": p.id,
            "name": p.name,
            "title": p.title,
            "price": p.price,
            "main_thumbnail": p.main_thumbnail,
            "is_active": p.is_active,
        })

    for r in recipes:
        # build a short content snippet
        steps = []
        try:
            steps = [s.description for s in (r.steps or []) if s.description]
        except Exception:
            steps = []

        snippet_parts = [r.ingredient or ""] + steps[:2]
        snippet = " ".join([s for s in snippet_parts if s])

        items.append({
            "type": "recipe",
            "id": r.id,
            "name": r.name,
            "thumbnail": r.thumbnail,
            "time": r.time,
            "snippet": snippet,
        })

    # simple ordering: products first then recipes; apply overall offset/limit
    combined = items[offset: offset + limit]
    return combined


# --- Ingredient suggestions endpoint (moved from ingredients.py) ---
# Returns a short list of ingredient name suggestions (strings)
_token_re = re.compile(r"[\w가-힣]+")

@router.get("/ingredients", response_model=List[str])
def suggest_ingredients(
    q: Optional[str] = Query(None, description="Query string for ingredient partial match"),
    limit: int = Query(8, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Return short list of ingredient suggestions based on product names, recipe_product.ingredient and recipe.ingredient.

    Behavior:
    - If no query provided, return empty list.
    - First check `Product.name` for partial matches (prefer whole names).
    - Then search `RecipeProduct.ingredient` and `Recipe.ingredient`, tokenizing those fields and returning tokens that contain the query.
    """
    if not q:
        return []

    like_pattern = f"%{q}%"
    candidates = []
    seen = set()

    # 1) Product names (prefer whole product names)
    try:
        prod_rows = db.query(models.Product.name).filter(models.Product.name.ilike(like_pattern)).limit(limit * 2).all()
        for (name,) in prod_rows:
            if not name:
                continue
            s = name.strip()
            key = s.lower()
            if s and key not in seen:
                seen.add(key)
                candidates.append(s)
                if len(candidates) >= limit:
                    return candidates[:limit]
    except Exception:
        pass

    # 2) RecipeProduct.ingredient (may be single ingredient strings)
    try:
        rp_rows = db.query(models.RecipeProduct.ingredient).filter(models.RecipeProduct.ingredient.ilike(like_pattern)).limit(limit * 4).all()
        for (ing,) in rp_rows:
            if not ing:
                continue
            for tok in _token_re.findall(ing):
                if q.lower() in tok.lower():
                    key = tok.lower()
                    if key not in seen:
                        seen.add(key)
                        candidates.append(tok)
                        if len(candidates) >= limit:
                            return candidates[:limit]
    except Exception:
        pass

    # 3) Recipe.ingredient (often comma-separated lists)
    try:
        rec_rows = db.query(models.Recipe.ingredient).filter(models.Recipe.ingredient.ilike(like_pattern)).limit(limit * 4).all()
        for (ing,) in rec_rows:
            if not ing:
                continue
            for tok in _token_re.findall(ing):
                if q.lower() in tok.lower():
                    key = tok.lower()
                    if key not in seen:
                        seen.add(key)
                        candidates.append(tok)
                        if len(candidates) >= limit:
                            return candidates[:limit]
    except Exception:
        pass

    return candidates[:limit]


# --- New: Search suggestion endpoint for header autocomplete ---
@router.get("/search/suggest", response_model=List[str])
def suggest_search(
        q: Optional[str] = Query(None, description="Quick search suggestions (product/recipe names)"),
        limit: int = Query(8, ge=1, le=100),
        db: Session = Depends(get_db),
):
    """Return short list of name suggestions from products and recipes.

    Prioritize names that start with the query, then names that contain it.
    """
    if not q:
        return []

    like_pattern = f"%{q}%"
    seen = set()
    starts_with = []
    contains = []

    # products by name/title
    try:
        p_rows = db.query(models.Product.name, models.Product.title).filter(
           models.Product.name.ilike(like_pattern)
        ).limit(limit * 3).all()
        for name, title in p_rows:
            candidate = name or title
            if not candidate:
                continue
            key = candidate.lower()
            if key in seen:
                continue
            seen.add(key)
            if candidate.lower().startswith(q.lower()):
                starts_with.append(candidate)
            else:
                contains.append(candidate)
            if len(starts_with) + len(contains) >= limit * 3:
                break
    except Exception:
        pass

    # recipes by name
    try:
        r_rows = db.query(models.Recipe.name).filter(models.Recipe.name.ilike(like_pattern)).limit(limit * 3).all()
        for (rname,) in r_rows:
            if not rname:
                continue
            key = rname.lower()
            if key in seen:
                continue
            seen.add(key)
            if rname.lower().startswith(q.lower()):
                starts_with.append(rname)
            else:
                contains.append(rname)
            if len(starts_with) + len(contains) >= limit * 3:
                break
    except Exception:
        pass

    results = starts_with + contains
    return results[:limit]