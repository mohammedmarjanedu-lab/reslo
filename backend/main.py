from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import MeshRequest, MeshResponse, AnalysisRequest, AnalysisResponse
from mesher import generate_mesh
from solver import analyze_slab
from opensees_solver import analyze_slab_opensees
import logging

logger = logging.getLogger("uvicorn")

app = FastAPI(title="Reslo FEM API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health():
    return {"status": "ok", "solver": "OpenSeesPy + DKT triangular plate"}

@app.post("/api/mesh", response_model=MeshResponse)
def mesh_endpoint(request: MeshRequest):
    try:
        mesh = generate_mesh(request)
        return MeshResponse(success=True, mesh=mesh)
    except Exception as e:
        return MeshResponse(success=False, error=str(e))

@app.post("/api/analyze", response_model=AnalysisResponse)
def analyze_endpoint(request: AnalysisRequest):
    import math
    
    def has_invalid_floats(res: AnalysisResponse) -> bool:
        for val in [res.minWz, res.maxWz, res.minMx, res.maxMx, res.minMy, res.maxMy]:
            if val is not None and (math.isnan(val) or math.isinf(val)):
                return True
        return False

    try:
        # Use OpenSeesPy by default
        result = analyze_slab_opensees(request)
        if not result.success or has_invalid_floats(result):
            err_msg = result.error or "NaN/Infinity values in solver output (unstable structure)"
            logger.error(f"OpenSees solver failed: {err_msg}. Falling back to baseline DKT solver.")
            try:
                result = analyze_slab(request)
                if has_invalid_floats(result):
                    return AnalysisResponse(success=False, error=f"Analysis resulted in unstable numerical results (NaN/Infinity). Please check your column and wall supports.")
            except Exception as fallback_e:
                return AnalysisResponse(success=False, error=f"OpenSees failed: {err_msg}. Fallback DKT also failed: {str(fallback_e)}")
        return result
    except Exception as e:
        logger.error(f"OpenSees solver exception: {str(e)}. Falling back to baseline DKT solver.")
        try:
            result = analyze_slab(request)
            if has_invalid_floats(result):
                return AnalysisResponse(success=False, error=f"Analysis resulted in unstable numerical results (NaN/Infinity). Please check your column and wall supports.")
            return result
        except Exception as fallback_e:
            return AnalysisResponse(success=False, error=f"OpenSees failed: {str(e)}. Fallback DKT also failed: {str(fallback_e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
