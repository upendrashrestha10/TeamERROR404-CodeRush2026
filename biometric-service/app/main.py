from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Dict

from .matcher import match_fingerprints

app = FastAPI(
    title="E-Chunab Camera-Based Fingerprint Verification Service (Prototype)",
    description="Microservice for fingerprint image quality check, computer vision ridge preprocessing, and keypoint minutiae feature matching.",
    version="1.0.0"
)

# Enable CORS for frontend applications (Local & Deployed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class FingerprintVerificationRequest(BaseModel):
    reference_image: str = Field(..., description="Base64 encoded reference fingerprint image (cropped from citizenship document).")
    live_image: str = Field(..., description="Base64 encoded live fingerprint image captured via device camera.")

class FingerprintVerificationResponse(BaseModel):
    status: str = Field(..., description="Result status: 'matched', 'not_matched', or 'unable_to_verify'.")
    score: float = Field(..., description="Verified spatial inlier feature match count.")
    quality: Dict[str, str] = Field(..., description="Quality ratings for reference and live fingerprint images.")
    good_matches_count: int = Field(..., description="Raw SIFT descriptor matches count.")
    details: str = Field(..., description="Technical explanation of the biometric matching decision.")

@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "service": "E-Chunab Biometric Verification Engine",
        "version": "1.0.0",
        "matching_algorithm": "OpenCV SIFT Keypoint & RANSAC Inlier Correspondence"
    }

@app.post("/api/verify-fingerprint", response_model=FingerprintVerificationResponse)
def verify_fingerprint(req: FingerprintVerificationRequest):
    if not req.reference_image or not req.live_image:
        raise HTTPException(status_code=400, detail="Both reference_image and live_image are required.")
    
    result = match_fingerprints(req.reference_image, req.live_image)
    return result
