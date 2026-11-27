import jwt
from bson import ObjectId
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.database.mongodb import db

bearer_scheme = HTTPBearer(auto_error=False)


class InvalidTokenError(Exception):
    pass


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
):
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        from app.core.config import settings

        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") == "refresh":
            raise InvalidTokenError("Refresh token cannot be used as access token")
        user_id = payload.get("sub")
        token_role = payload.get("role")
        if not user_id or not ObjectId.is_valid(user_id):
            raise InvalidTokenError("Invalid user ID")
    except (jwt.InvalidTokenError, InvalidTokenError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    database = db.get_db()

    # Fetch the latest user status and role from MongoDB
    user = await database.users.find_one({"_id": ObjectId(user_id)})
    if not user or not user["is_active"]:
        raise HTTPException(
            status_code=401,
            detail="User account is unavailable",
        )

    # Reject tokens with outdated or altered role claims
    if user["role"] != token_role:
        raise HTTPException(
            status_code=401,
            detail="Invalid user permissions",
        )

    return {
        "id": str(user["_id"]),
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "is_active": user["is_active"],
    }


def require_roles(*allowed_roles: str):
    async def role_checker(current_user=Depends(get_current_user)):
        if current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to access this resource",
            )
        return current_user

    return role_checker
