from __future__ import annotations

import base64
import hashlib
import json
import os
import tempfile
import time
from pathlib import Path
from typing import Any, Optional

import cv2
import httpx
from fastapi import FastAPI, Header, HTTPException
from PIL import Image

app = FastAPI(title="Atelix QC worker", docs_url=None, redoc_url=None)
START_BUDGET_SECONDS = 220
HARD_BUDGET_SECONDS = 240
MAX_DERIVED_IMAGES = 12
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm"}
FINDING_CATEGORIES = {
    "evidence_quality", "reference_mismatch", "construction_or_workmanship", "surface_damage",
    "contamination_or_foreign_matter", "color_or_finish_variation", "measurement_evidence",
    "label_or_packaging", "seal_or_leakage", "quantity_or_coverage", "process_or_safety_observation", "unknown",
}


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is not configured")
    return value


async def rpc(client: httpx.AsyncClient, name: str, payload: dict[str, Any]) -> Any:
    key = required("SUPABASE_SERVICE_ROLE_KEY")
    response = await client.post(
        f"{required('SUPABASE_URL')}/rest/v1/rpc/{name}", json=payload,
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    response.raise_for_status()
    return response.json()


def probe(path: Path, mime: str) -> dict[str, Any]:
    if not mime.startswith("video/"):
        return {"duration_seconds": 0, "streams": [{"codec_type": "image"}]}
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise ValueError("Stored video could not be decoded")
    fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
    frame_count = float(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    capture.release()
    duration = frame_count / fps if fps > 0 else 0
    if mime.startswith("video/") and not 0 < duration <= 180:
        raise ValueError("Video duration must be between 0 and 180 seconds")
    return {"duration_seconds": duration, "streams": [{"codec_type": "video", "width": width, "height": height, "fps": fps}]}


def validate_magic(path: Path, mime: str) -> None:
    head = path.read_bytes()[:16]
    valid = {
        "image/jpeg": head.startswith(b"\xff\xd8\xff"),
        "image/png": head.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": head.startswith(b"RIFF") and head[8:12] == b"WEBP",
        "video/mp4": len(head) >= 12 and head[4:8] == b"ftyp",
        "video/quicktime": len(head) >= 12 and head[4:8] == b"ftyp",
        "video/webm": head.startswith(b"\x1aE\xdf\xa3"),
    }.get(mime, False)
    if not valid:
        raise ValueError("Stored evidence magic bytes do not match the declared MIME type")


def derive_images(source: Path, mime: str, directory: Path) -> tuple[list[Path], dict[str, Any]]:
    report = probe(source, mime)
    derived: list[Path] = []
    if mime.startswith("image/"):
        target = directory / "image.jpg"
        with Image.open(source) as image:
            image.verify()
        with Image.open(source) as image:
            converted = image.convert("RGB")
            converted.thumbnail((2048, 2048))
            converted.save(target, "JPEG", quality=88, optimize=True)
        derived.append(target)
    else:
        duration = report["duration_seconds"]
        count = min(MAX_DERIVED_IMAGES, max(1, int(duration)))
        capture = cv2.VideoCapture(str(source))
        try:
            for index in range(count):
                timestamp = min(duration - 0.001, (index + 0.5) * duration / count)
                capture.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000)
                ok, frame = capture.read()
                if not ok or frame is None:
                    raise ValueError("Stored video frame could not be decoded")
                height, width = frame.shape[:2]
                scale = min(1.0, 2048 / max(width, height))
                if scale < 1:
                    frame = cv2.resize(frame, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA)
                target = directory / f"frame-{index:03d}.jpg"
                if not cv2.imwrite(str(target), frame, [cv2.IMWRITE_JPEG_QUALITY, 88]):
                    raise ValueError("Derived frame could not be encoded")
                derived.append(target)
        finally:
            capture.release()
    quality = []
    for image_path in derived:
        matrix = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
        if matrix is None:
            raise ValueError("Decoder produced an unreadable frame")
        quality.append({"name": image_path.name, "blur_variance": round(float(cv2.Laplacian(matrix, cv2.CV_64F).var()), 2), "mean_luminance": round(float(matrix.mean()), 2)})
    report["derived_count"] = len(derived)
    report["quality"] = quality
    return derived, report


def data_url(path: Path) -> str:
    return "data:image/jpeg;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def validate_findings(payload: Any, frame_ids: dict[str, set[str]], checklist_refs: set[str]) -> list[dict[str, Any]]:
    findings = payload.get("findings") if isinstance(payload, dict) else None
    if not isinstance(findings, list) or len(findings) > 100:
        raise ValueError("Model returned invalid findings")
    clean = []
    for finding in findings:
        evidence = finding.get("evidence")
        asset_id = finding.get("asset_id")
        if not isinstance(finding, dict) or finding.get("category") not in FINDING_CATEGORIES or finding.get("severity") not in {"info", "low", "medium", "high"} or asset_id not in frame_ids or not isinstance(evidence, dict) or evidence.get("frame_id") not in frame_ids[asset_id] or not str(finding.get("summary", "")).strip():
            raise ValueError("Model finding failed the evidence allowlist")
        if any(key in finding for key in ("pass", "fail", "approved", "shipment_ready")):
            raise ValueError("Model returned a forbidden authority field")
        if finding.get("checklist_reference") is not None and finding.get("checklist_reference") not in checklist_refs:
            raise ValueError("Model returned an unknown checklist reference")
        clean.append({
            "category": finding["category"], "severity": finding["severity"], "asset_id": finding["asset_id"],
            "summary": str(finding.get("summary", ""))[:1000], "evidence": evidence,
            "checklist_reference": finding.get("checklist_reference"),
        })
    return clean


async def persist_derived(client: httpx.AsyncClient, context: dict[str, Any], derived: list[tuple[str, Path]]) -> list[dict[str, Any]]:
    key = required("SUPABASE_SERVICE_ROLE_KEY")
    prefix = f"{context['inspection']['rfq_case_id']}/{context['inspection']['id']}/derived/{context['job_id']}"
    manifest = []
    for asset_id, image_path in derived:
        content = image_path.read_bytes()
        object_path = f"{prefix}/{asset_id}-{image_path.name}"
        response = await client.post(
            f"{required('SUPABASE_URL')}/storage/v1/object/rfq-qc-evidence/{object_path}", content=content,
            headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "image/jpeg", "x-upsert": "true"}, timeout=30,
        )
        response.raise_for_status()
        manifest.append({"asset_id": asset_id, "frame_id": image_path.stem, "storage_path": object_path, "sha256": hashlib.sha256(content).hexdigest()})
    return manifest


async def analyze(client: httpx.AsyncClient, context: dict[str, Any], derived: list[tuple[str, Path]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    schema = {
        "type": "object", "additionalProperties": False, "required": ["findings"],
        "properties": {"findings": {"type": "array", "maxItems": 100, "items": {
            "type": "object", "additionalProperties": False,
            "required": ["category", "severity", "asset_id", "summary", "evidence", "checklist_reference"],
            "properties": {
                "category": {"type": "string", "enum": sorted(FINDING_CATEGORIES)},
                "severity": {"type": "string", "enum": ["info", "low", "medium", "high"]},
                "asset_id": {"type": "string"}, "summary": {"type": "string", "maxLength": 1000},
                "evidence": {"type": "object", "additionalProperties": False, "required": ["frame_id", "timestamp_ms", "contact_sheet_cell", "bounding_box"], "properties": {
                    "frame_id": {"type": "string"}, "timestamp_ms": {"type": ["integer", "null"], "minimum": 0},
                    "contact_sheet_cell": {"type": ["integer", "null"], "minimum": 0, "maximum": 8},
                    "bounding_box": {"anyOf": [{"type": "null"}, {"type": "object", "additionalProperties": False, "required": ["x", "y", "width", "height"], "properties": {"x": {"type": "number", "minimum": 0, "maximum": 1}, "y": {"type": "number", "minimum": 0, "maximum": 1}, "width": {"type": "number", "minimum": 0, "maximum": 1}, "height": {"type": "number", "minimum": 0, "maximum": 1}}}]},
                }}, "checklist_reference": {"type": ["string", "null"]},
            },
        }}},
    }
    checklist_refs = {f"checklist:{context['checklist']['id']}:criterion:{index}" for index, _ in enumerate(context["checklist"]["criteria"])}
    content: list[dict[str, Any]] = [{"type": "text", "text": json.dumps({
        "instruction": "Identify visible risks and missing evidence only. Never pass, fail, approve, or authorize shipment.",
        "category": context["inspection"]["category"], "checklist": context["checklist"],
        "approved_specification": context["approved_specification"],
        "checklist_reference_allowlist": sorted(checklist_refs),
        "image_asset_mapping": [{"asset_id": asset_id, "frame_id": image_path.stem} for asset_id, image_path in derived],
    }, separators=(",", ":"))}]
    for _, image_path in derived:
        content.append({"type": "image_url", "image_url": {"url": data_url(image_path)}})
    selected_model = os.getenv("OPENROUTER_QC_PRESET", "").strip() or os.getenv("OPENROUTER_QC_MODEL", "google/gemini-3.7-flash").strip() or "google/gemini-3.7-flash"
    request = {
        "model": selected_model,
        "messages": [{"role": "user", "content": content}],
        "provider": {"require_parameters": True, "zdr": True, "data_collection": "deny"},
        "response_format": {"type": "json_schema", "json_schema": {"name": "atelix_qc_visual_risk", "strict": True, "schema": schema}},
        "temperature": 0,
        "max_tokens": 2500,
    }
    started = time.monotonic()
    response = await client.post("https://openrouter.ai/api/v1/chat/completions", json=request, headers={"Authorization": f"Bearer {required('OPENROUTER_API_KEY')}", "Content-Type": "application/json"}, timeout=90)
    response.raise_for_status()
    result = response.json()
    parsed = json.loads(result["choices"][0]["message"]["content"])
    usage = result.get("usage") or {}
    frame_ids: dict[str, set[str]] = {}
    for asset_id, image_path in derived:
        frame_ids.setdefault(asset_id, set()).add(image_path.stem)
    return validate_findings(parsed, frame_ids, checklist_refs), {
        "provider": "openrouter", "model": result.get("model") or request["model"], "input_tokens": usage.get("prompt_tokens"),
        "output_tokens": usage.get("completion_tokens"), "provider_cost_usd": usage.get("cost"),
        "latency_ms": round((time.monotonic() - started) * 1000),
        "prompt_hash": hashlib.sha256(content[0]["text"].encode()).hexdigest(),
    }


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/run")
async def run(authorization: Optional[str] = Header(default=None)) -> dict[str, Any]:
    secret = required("QC_WORKER_BEARER_SECRET")
    if authorization != f"Bearer {secret}":
        raise HTTPException(status_code=401, detail="Unauthorized")
    started = time.monotonic()
    async with httpx.AsyncClient() as client:
        job_ids = await rpc(client, "qc_claim_analysis_jobs", {"p_limit": 1})
        if not job_ids:
            return {"claimed": 0}
        contexts = await rpc(client, "qc_get_analysis_context", {"p_job_ids": job_ids})
        context = contexts[0]
        lease = context["lease_token"]
        preprocessing: dict[str, Any] = {"assets": []}
        derived: list[tuple[str, Path]] = []
        derived_manifest: list[dict[str, Any]] = []
        try:
            with tempfile.TemporaryDirectory(prefix="atelix-qc-") as temp:
                directory = Path(temp)
                key = required("SUPABASE_SERVICE_ROLE_KEY")
                for asset in context["assets"]:
                    if time.monotonic() - started >= START_BUDGET_SECONDS:
                        await rpc(client, "qc_checkpoint_analysis_jobs", {"p_results": [{"job_id": job_ids[0], "lease_token": lease, "stage": "validating", "cursor": {"completed_assets": len(preprocessing["assets"])}, "derived_manifest": [], "release": True}]})
                        return {"claimed": 1, "checkpointed": 1}
                    if asset["content_type"] not in ALLOWED_MIME:
                        raise ValueError("Unsupported stored MIME type")
                    source = directory / f"{asset['id']}.original"
                    response = await client.get(f"{required('SUPABASE_URL')}/storage/v1/object/authenticated/rfq-qc-evidence/{asset['storage_path']}", headers={"apikey": key, "Authorization": f"Bearer {key}"}, timeout=60)
                    response.raise_for_status()
                    source.write_bytes(response.content)
                    if hashlib.sha256(response.content).hexdigest() != asset["sha256"]:
                        raise ValueError("Stored evidence checksum mismatch")
                    validate_magic(source, asset["content_type"])
                    asset_dir = directory / asset["id"]
                    asset_dir.mkdir()
                    images, report = derive_images(source, asset["content_type"], asset_dir)
                    preprocessing["assets"].append({"asset_id": asset["id"], **report})
                    derived.extend((asset["id"], image) for image in images)
                derived_manifest = await persist_derived(client, context, derived[:MAX_DERIVED_IMAGES])
                findings, usage = await analyze(client, context, derived[:MAX_DERIVED_IMAGES])
                if time.monotonic() - started >= HARD_BUDGET_SECONDS:
                    raise TimeoutError("Worker budget exhausted before completion")
                await rpc(client, "qc_complete_analysis_jobs", {"p_results": [{"job_id": job_ids[0], "lease_token": lease, "schema_version": "qc-risk-v1", "engine_versions": {"media_decoder": "opencv", "opencv": cv2.__version__}, "preprocessing_report": preprocessing, "derived_manifest": derived_manifest, "findings": findings, **usage}]})
                return {"claimed": 1, "completed": 1, "findings": len(findings)}
        except Exception as exc:
            await rpc(client, "qc_checkpoint_analysis_jobs", {"p_results": [{"job_id": job_ids[0], "lease_token": lease, "stage": "failed_attempt", "cursor": {}, "derived_manifest": derived_manifest, "error": str(exc)[:2000], "release": True}]})
            return {"claimed": 1, "completed": 0, "retry": True}
