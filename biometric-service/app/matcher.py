import cv2
import numpy as np
from .preprocessing import decode_base64_image, evaluate_image_quality, preprocess_fingerprint

def match_fingerprints(ref_base64: str, live_base64: str) -> dict:
    """
    Performs Computer Vision minutiae/ridge keypoint feature matching between:
    - Reference fingerprint (captured from physical citizenship card camera scan ROI)
    - Live voter fingerprint (captured via camera)
    
    Returns:
    - status: 'matched' | 'not_matched' | 'unable_to_verify'
    - score: legitimate count of verified spatial inlier keypoints
    - quality: rating for reference and live fingerprint images
    - details: explanatory technical summary of biometric matching result
    """
    try:
        ref_img = decode_base64_image(ref_base64)
        live_img = decode_base64_image(live_base64)
    except Exception as e:
        return {
            "status": "unable_to_verify",
            "score": 0.0,
            "quality": {"reference": "unknown", "live": "unknown"},
            "good_matches_count": 0,
            "inliers_count": 0,
            "details": f"Failed to parse fingerprint image data: {str(e)}"
        }

    # 1. Quality Checks
    ref_quality = evaluate_image_quality(ref_img)
    live_quality = evaluate_image_quality(live_img)

    if not ref_quality["usable"] or not live_quality["usable"]:
        reasons = []
        if not ref_quality["usable"]:
            reasons.append(f"Reference Scan: {ref_quality['reason']}")
        if not live_quality["usable"]:
            reasons.append(f"Live Finger Capture: {live_quality['reason']}")
            
        return {
            "status": "unable_to_verify",
            "score": 0.0,
            "quality": {
                "reference": ref_quality["rating"],
                "live": live_quality["rating"]
            },
            "good_matches_count": 0,
            "inliers_count": 0,
            "details": f"Fingerprint quality validation failed. {' '.join(reasons)}"
        }

    # 2. Preprocess both fingerprint images with identical pipeline
    ref_prep = preprocess_fingerprint(ref_img)
    live_prep = preprocess_fingerprint(live_img)

    # 3. Extract Minutiae Features using OpenCV SIFT (Scale-Invariant Feature Transform)
    try:
        sift = cv2.SIFT_create(nfeatures=600)
        kp1, des1 = sift.detectAndCompute(ref_prep, None)
        kp2, des2 = sift.detectAndCompute(live_prep, None)
    except Exception:
        # Fallback to ORB if SIFT is disabled in build
        orb = cv2.ORB_create(nfeatures=600)
        kp1, des1 = orb.detectAndCompute(ref_prep, None)
        kp2, des2 = orb.detectAndCompute(live_prep, None)

    if des1 is None or des2 is None or len(kp1) < 8 or len(kp2) < 8:
        return {
            "status": "unable_to_verify",
            "score": 0.0,
            "quality": {
                "reference": ref_quality["rating"],
                "live": live_quality["rating"]
            },
            "good_matches_count": 0,
            "inliers_count": 0,
            "details": "Insufficient fingerprint ridge minutiae points detected for reliable matching."
        }

    # 4. Descriptor Matching with K-Nearest Neighbors & Lowe's Ratio Test
    bf = cv2.BFMatcher()
    matches = bf.knnMatch(des1, des2, k=2)

    good_matches = []
    for match in matches:
        if len(match) == 2:
            m, n = match
            # Lowe's ratio test (distance < 0.75 * second_best)
            if m.distance < 0.75 * n.distance:
                good_matches.append(m)

    # 5. Spatial Geometric Homography Verification (RANSAC)
    inliers_count = 0
    if len(good_matches) >= 6:
        src_pts = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        dst_pts = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        
        _, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
        if mask is not None:
            inliers_count = int(np.sum(mask))

    # 6. Biometric Decision Threshold (Minimum required inlier keypoints: 10)
    min_inliers_required = 10
    
    if inliers_count >= min_inliers_required:
        status = "matched"
    else:
        status = "not_matched"

    return {
        "status": status,
        "score": float(inliers_count),
        "quality": {
            "reference": ref_quality["rating"],
            "live": live_quality["rating"]
        },
        "good_matches_count": len(good_matches),
        "inliers_count": inliers_count,
        "details": f"Extracted {len(kp1)} card scan & {len(kp2)} live minutiae points. Verified {inliers_count} geometrically consistent inlier ridge matches."
    }

