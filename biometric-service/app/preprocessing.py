import cv2
import numpy as np
import base64
import re

def decode_base64_image(base64_str: str) -> np.ndarray:
    """Decodes a Base64 data URL or raw Base64 string into an OpenCV BGR image."""
    if not base64_str:
        raise ValueError("Empty image data provided.")
    
    # Strip data URL prefix if present
    base64_data = re.sub(r'^data:image/.+;base64,', '', base64_str)
    img_bytes = base64.b64decode(base64_data)
    nparr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if img is None:
        raise ValueError("Failed to decode image from provided data.")
    return img

def evaluate_image_quality(img: np.ndarray) -> dict:
    """
    Evaluates fingerprint image quality using objective Computer Vision metrics:
    - Blur / Sharpness via Laplacian Variance
    - Contrast via Standard Deviation
    - Brightness via Mean Pixel Intensity
    - Usable dimensions
    """
    if img is None or img.size == 0:
        return {"usable": False, "rating": "insufficient", "reason": "Image is empty or unreadable."}
    
    h, w = img.shape[:2]
    if h < 120 or w < 120:
        return {"usable": False, "rating": "insufficient", "reason": f"Image resolution too small ({w}x{h}). Minimum required: 120x120."}
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    
    # 1. Sharpness calculation using Laplacian Variance
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    
    # 2. Contrast & Brightness calculation
    mean_intensity = np.mean(gray)
    std_contrast = np.std(gray)
    
    # Thresholds
    is_blurry = laplacian_var < 25.0
    is_too_dark = mean_intensity < 30.0
    is_too_bright = mean_intensity > 235.0
    is_low_contrast = std_contrast < 20.0
    
    reasons = []
    if is_blurry:
        reasons.append(f"Image is too blurry (sharpness score: {laplacian_var:.1f}).")
    if is_too_dark:
        reasons.append("Image is excessively dark.")
    if is_too_bright:
        reasons.append("Image has severe light reflection / overexposure.")
    if is_low_contrast:
        reasons.append("Low contrast between fingerprint ridges and background.")
        
    usable = not (is_blurry or is_too_dark or is_too_bright or is_low_contrast)
    
    rating = "high"
    if not usable:
        rating = "insufficient"
    elif laplacian_var < 80.0 or std_contrast < 35.0:
        rating = "medium"
        
    return {
        "usable": usable,
        "rating": rating,
        "laplacian_variance": round(laplacian_var, 2),
        "contrast_std": round(std_contrast, 2),
        "mean_intensity": round(mean_intensity, 2),
        "dimensions": f"{w}x{h}",
        "reason": " ".join(reasons) if reasons else "Quality acceptable for biometric processing."
    }

def preprocess_fingerprint(img: np.ndarray) -> np.ndarray:
    """
    Applies fingerprint preprocessing pipeline:
    1. Grayscale conversion
    2. CLAHE (Contrast Limited Adaptive Histogram Equalization)
    3. Gaussian Noise Reduction
    4. Adaptive Ridge Binarization
    """
    if len(img.shape) == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img.copy()
        
    # Resize to standard height preserving aspect ratio
    target_height = 400
    h, w = gray.shape
    if h != target_height:
        target_width = int(w * (target_height / float(h)))
        gray = cv2.resize(gray, (target_width, target_height), interpolation=cv2.INTER_AREA)
        
    # 1. CLAHE Contrast Enhancement
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    
    # 2. Gaussian Noise Filter
    blurred = cv2.GaussianBlur(enhanced, (5, 5), 0)
    
    # 3. Adaptive Thresholding for Ridge Segmentation
    binarized = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
        cv2.THRESH_BINARY_INV, 11, 2
    )
    
    return binarized
