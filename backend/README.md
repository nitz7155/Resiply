# Backend

This backend contains a minimal, opinionated Python package layout to start from.

Structure:

- `app/` - main application package
  - `app/main.py` - package entrypoint with `main()`
  - `app/api/` - route registration modules
  - `app/core/` - configuration and core utilities
  - `app/models/` - data models
  - `app/services/` - business logic/services
  - `app/db/` - database helpers
- `tests/` - unit tests (run with `pytest`)
- `pyproject.toml` - project metadata (keep existing)

How to run the simple entrypoint locally:

```bash
python -m app.main
```

Next steps:
- Decide on a web framework (FastAPI/Flask) and I can scaffold routes and deps.
- Integrate with existing `pyproject.toml` if you want to add dependencies.
