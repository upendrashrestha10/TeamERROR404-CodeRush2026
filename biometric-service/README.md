# E-Chunab Camera-Based Fingerprint Verification Service (Prototype)

This microservice provides Computer Vision-based fingerprint image quality assessment, ridge preprocessing, feature extraction, and minutiae keypoint matching for the E-Chunab digital voting system.

> **IMPORTANT DISCLAIMER**: This is a prototype system developed for university/hackathon evaluation. Camera-based fingerprint verification using standard device cameras is not certified government-grade biometric hardware authentication.

---

## 🛠️ Architecture & Pipeline

1. **Image Quality Evaluation**:
   - **Sharpness**: Measured via Laplacian variance threshold.
   - **Contrast**: Measured via standard deviation of pixel intensities.
   - **Exposure**: Evaluated via mean pixel intensity (filters out overexposed reflections or pitch-black frames).
   - **Usability**: Rejects low-quality, blurry, or unusable images with `unable_to_verify`.

2. **Preprocessing**:
   - Aspect ratio normalization
   - CLAHE (Contrast Limited Adaptive Histogram Equalization)
   - Gaussian noise reduction
   - Adaptive threshold binarization

3. **Feature Extraction & Matching**:
   - Keypoint detection & descriptor extraction using OpenCV **SIFT** (Scale-Invariant Feature Transform).
   - Descriptor matching via K-Nearest Neighbors (**KNN**) with Lowe's ratio test threshold (`0.75`).
   - Spatial geometric consistency verification via **RANSAC Homography Inlier Filtering**.
   - Output decisions: `matched`, `not_matched`, or `unable_to_verify`.

---

## 🚀 Running the Microservice Locally

### Prerequisites
- Python 3.10+
- Installed packages: `fastapi`, `uvicorn`, `opencv-python-headless`, `pydantic`, `numpy`

### Installation & Launch

```bash
cd biometric-service

# Install dependencies
python -m pip install -r requirements.txt

# Start the server on port 8000
python run_server.py
```

Or using Uvicorn directly:

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

---

## 📡 API Endpoints

### 1. Health Check
- **GET** `http://127.0.0.1:8000/api/health`
- **Response**: `{"status": "online", "service": "E-Chunab Biometric Verification Engine"}`

### 2. Verify Fingerprint
- **POST** `http://127.0.0.1:8000/api/verify-fingerprint`
- **Request Body**:
  ```json
  {
    "reference_image": "data:image/jpeg;base64,...",
    "live_image": "data:image/jpeg;base64,..."
  }
  ```
- **Response Body**:
  ```json
  {
    "status": "matched",
    "score": 28.0,
    "quality": {
      "reference": "high",
      "live": "medium"
    },
    "good_matches_count": 34,
    "details": "Extracted 420 reference & 380 live minutiae points. Verified 28 geometrically consistent inlier ridge matches."
  }
  ```

---

## 🌐 Netlify & Production Deployment

When deploying the static E-Chunab frontend to Netlify:
- Host this Python microservice separately on a cloud server (e.g., Render, Railway, AWS EC2, or Heroku).
- Configure the frontend biometric API endpoint URL in `config/supabase.js` or via environment variables.
- If the biometric service is offline or unreachable, the frontend gracefully displays:  
  `"Biometric verification service unavailable. Submission queued for manual admin review."`
