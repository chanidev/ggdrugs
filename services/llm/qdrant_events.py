"""
Qdrant 클라이언트 래퍼 — alle-events collection.

Collection 스펙:
  name:   alle-events
  vector: size=1536 (text-embedding-3-small), distance=Cosine
  points: id = event_id (숫자), payload = {
            title, phase, startDate, endDate, regionId, categoryCode,
            vibeIds, approvedAt (epoch), approvalStatus
          }

Ingest (BFF 쪽 배치 job) 가 upsert 하고, /events/search 가 kNN 검색.
서비스 부팅 시 collection 이 없으면 자동 생성 (dev 편의). 프로덕션에서는 별도 마이그레이션.
"""

from __future__ import annotations

import os
from typing import Any

_COLLECTION = "alle-events"
_VECTOR_DIM = 1536  # text-embedding-3-small

_client: Any | None = None


def _get_client():
    """Lazy singleton — qdrant_client 패키지가 없거나 서버 접속 불가면 None."""
    global _client
    if _client is not None:
        return _client
    try:
        from qdrant_client import QdrantClient
    except ImportError:
        return None
    url = os.environ.get("QDRANT_URL", "http://localhost:6333")
    try:
        _client = QdrantClient(url=url, timeout=10.0)
    except Exception:
        return None
    return _client


def ensure_collection() -> bool:
    """Collection 없으면 생성. 이미 있으면 no-op. 반환: True=ready, False=unavailable."""
    client = _get_client()
    if client is None:
        return False
    try:
        from qdrant_client.models import Distance, VectorParams
        existing = {c.name for c in client.get_collections().collections}
        if _COLLECTION not in existing:
            client.create_collection(
                collection_name=_COLLECTION,
                vectors_config=VectorParams(size=_VECTOR_DIM, distance=Distance.COSINE),
            )
        return True
    except Exception:
        return False


def search_events(
    vector: list[float],
    limit: int = 20,
    score_threshold: float | None = 0.3,
    filter_payload: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """kNN 검색. 반환 shape: [{eventId: str, score: float, payload: {...}}]."""
    client = _get_client()
    if client is None:
        return []
    if not ensure_collection():
        return []
    try:
        from qdrant_client.models import Filter, FieldCondition, MatchValue, MatchAny

        qdrant_filter = None
        if filter_payload:
            must: list[FieldCondition] = []
            for key, value in filter_payload.items():
                if isinstance(value, list):
                    must.append(FieldCondition(key=key, match=MatchAny(any=value)))
                else:
                    must.append(FieldCondition(key=key, match=MatchValue(value=value)))
            if must:
                qdrant_filter = Filter(must=must)

        result = client.query_points(
            collection_name=_COLLECTION,
            query=vector,
            limit=limit,
            score_threshold=score_threshold,
            query_filter=qdrant_filter,
            with_payload=True,
        )
        out: list[dict[str, Any]] = []
        for pt in result.points:
            out.append(
                {
                    "eventId": str(pt.id),
                    "score": float(pt.score),
                    "payload": pt.payload or {},
                }
            )
        return out
    except Exception:
        return []


def upsert_events(
    items: list[dict[str, Any]],
) -> int:
    """
    Batch upsert.
    items: [{id: int|str, vector: list[float], payload: dict}]
    반환: 실제 업서트된 포인트 수. 실패 시 0.
    """
    client = _get_client()
    if client is None:
        return 0
    if not ensure_collection():
        return 0
    if not items:
        return 0
    try:
        from qdrant_client.models import PointStruct
        points = [
            PointStruct(id=it["id"], vector=it["vector"], payload=it.get("payload", {}))
            for it in items
        ]
        client.upsert(collection_name=_COLLECTION, points=points, wait=True)
        return len(points)
    except Exception:
        return 0


def retrieve_vectors(ids: list[int | str]) -> list[list[float]]:
    """
    주어진 point id 들의 vector 만 반환. 없는 id 는 skip.
    Personalized 추천 (user-vector 평균) 용.
    """
    client = _get_client()
    if client is None:
        return []
    if not ensure_collection():
        return []
    if not ids:
        return []
    try:
        points = client.retrieve(
            collection_name=_COLLECTION,
            ids=ids,
            with_vectors=True,
            with_payload=False,
        )
        out: list[list[float]] = []
        for pt in points:
            vec = getattr(pt, "vector", None)
            if vec is None:
                continue
            # Qdrant 은 dict 또는 list 반환 가능 — list 만 받음
            if isinstance(vec, list) and vec and isinstance(vec[0], (int, float)):
                out.append([float(x) for x in vec])
        return out
    except Exception:
        return []


def delete_events(ids: list[int | str]) -> int:
    """
    Batch delete by point id. Qdrant 에 없는 id 는 조용히 no-op.
    반환: 요청 id 수 (실제 삭제 확인은 상위에서 stats 로 확인).
    """
    client = _get_client()
    if client is None:
        return 0
    if not ensure_collection():
        return 0
    if not ids:
        return 0
    try:
        from qdrant_client.models import PointIdsList
        client.delete(
            collection_name=_COLLECTION,
            points_selector=PointIdsList(points=ids),
            wait=True,
        )
        return len(ids)
    except Exception:
        return 0


def collection_stats() -> dict[str, Any]:
    """관측용 — points 수, dim, status. 실패 시 {available: False}."""
    client = _get_client()
    if client is None:
        return {"available": False, "reason": "client unavailable"}
    try:
        if not ensure_collection():
            return {"available": False, "reason": "ensure_collection failed"}
        info = client.get_collection(collection_name=_COLLECTION)
        return {
            "available": True,
            "points": getattr(info, "points_count", 0) or 0,
            "status": str(getattr(info, "status", "unknown")),
        }
    except Exception as e:
        return {"available": False, "reason": str(e)[:100]}
