"""User auth endpoints: login (session cookie), current user, logout, user admin."""
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.core.auth import COOKIE_NAME, require_auth, require_admin
from app.core.ratelimit import check_rate_limit
from app.models.transcription import CreateUserRequest, LoginRequest, UserOut
from app.services.user_store import issue_session_cookie, user_store

router = APIRouter(prefix="/api/auth", tags=["auth"])

COOKIE_MAX_AGE = 12 * 3600


@router.post("/login")
async def login(request: Request, body: LoginRequest, response: Response):
    """Authenticates a user and sets an HttpOnly session cookie."""
    check_rate_limit(request, bucket="login")
    role = user_store.authenticate(body.username, body.password)
    if not role:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    cookie = issue_session_cookie(body.username, role, ttl_seconds=COOKIE_MAX_AGE)
    response.set_cookie(
        COOKIE_NAME,
        cookie,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return {"username": body.username, "role": role}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(request: Request, _: None = Depends(require_auth)):
    """Current identity: cookie user, or the master-token owner."""
    from app.core.auth import _cookie_role, is_authorized

    if is_authorized(
        authorization=request.headers.get("authorization"),
        x_auth_token=request.headers.get("x-auth-token"),
        query_token=request.query_params.get("token"),
    ):
        return {"username": "owner", "role": "admin"}
    cookie = _cookie_role(request)
    if cookie:
        return {"username": cookie[0], "role": cookie[1]}
    raise HTTPException(status_code=401, detail="Not authenticated")


@router.get("/users", dependencies=[Depends(require_admin)])
async def list_users():
    return user_store.list_users()


@router.post("/users", status_code=201, dependencies=[Depends(require_admin)])
async def create_user(body: CreateUserRequest):
    if not user_store.create(body.username, body.password, body.role):
        raise HTTPException(status_code=409, detail="Username already exists")
    return {"username": body.username, "role": body.role}
