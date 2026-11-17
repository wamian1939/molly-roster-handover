"""Stateless CP-SAT boundary. Receives pseudonymous scheduling inputs only.

No Evaluate credentials, employee directory, database connection or D1 binding.
The parent process kills a request's subprocess on timeout; solver time limits
alone do not bound preprocessing and serialization.
"""
import asyncio
import hashlib
import hmac
import json
import os
from pathlib import Path
import sys

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
semaphore = asyncio.Semaphore(1)
MAX_BYTES = 2_000_000


@app.get("/health")
async def health():
    return {"ok": bool(os.environ.get("SOLVER_SHARED_SECRET")), "databaseAccess": False}


@app.post("/v1/solve")
async def solve(request: Request):
    secret = os.environ.get("SOLVER_SHARED_SECRET", "")
    if len(secret) < 32: raise HTTPException(503,"Solver service is not configured")
    token = request.headers.get("authorization", "").removeprefix("Bearer ")
    if not hmac.compare_digest(token.encode(), secret.encode()): raise HTTPException(401,"Unauthorized")
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_BYTES: raise HTTPException(413,"Snapshot exceeds service limit")
    try:
        payload = json.loads(data)
        if not isinstance(payload,dict) or set(payload) != {"snapshot","rules","from","to","mode","solveSeconds"}: raise ValueError()
    except (ValueError, TypeError): raise HTTPException(400,"Invalid solver request")
    # Reject rather than queue enough jobs to exceed the hosting request budget.
    if semaphore.locked(): raise HTTPException(503,"Solver busy; retry the same snapshot",headers={"Retry-After":"5"})
    fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    async with semaphore:
        process = await asyncio.create_subprocess_exec(sys.executable,str(Path(__file__).with_name("run.py")),
            stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
        try:
            stdout, _ = await asyncio.wait_for(process.communicate(bytes(data)), timeout=45)
        except (asyncio.TimeoutError, asyncio.CancelledError) as error:
            process.kill(); await process.communicate()
            if isinstance(error,asyncio.CancelledError): raise
            raise HTTPException(504,"Solver timed out; retry the same snapshot")
        if process.returncode != 0: raise HTTPException(422,"Snapshot or rules rejected by deterministic solver")
        try: result = json.loads(stdout)
        except ValueError: raise HTTPException(502,"Solver returned an invalid response")
    return JSONResponse({"requestHash":fingerprint, "result":result, "publishable":False},headers={"Cache-Control":"no-store"})
