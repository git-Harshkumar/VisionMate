"""
API Routes Package
"""
from backend.app.routes.health import router as health_router
from backend.app.routes.inspect import router as inspect_router
from backend.app.routes.model_info import router as model_info_router

__all__ = ["health_router", "inspect_router", "model_info_router"]
