import cv2
import numpy as np
import json
import base64
import mediapipe as mp
import joblib
from scipy.spatial import distance
import sys
import os

mp_face_mesh = mp.solutions.face_mesh

class SchizophreniaTracker:
    def __init__(self):
        self.face_mesh = mp_face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.7,
            min_tracking_confidence=0.7
        )
        self.eye_landmarks = {
            'left': [33, 133, 160, 144, 158, 153],
            'right': [362, 263, 385, 380, 373, 387]
        }
        self.prev_centers = []

        # Load ML model
        model_path = os.path.join(os.path.dirname(__file__), 'ml_model.joblib')
        self.model = joblib.load(model_path)

    def process_frame(self, frame_data):
        try:
            img = cv2.imdecode(np.frombuffer(
                base64.b64decode(frame_data.split(",")[1]),
                np.uint8
            ), cv2.IMREAD_COLOR)

            pupil = self._detect_pupil(img)
            if not pupil:
                return {"status": "no_pupil"}

            gaze = self._track_gaze(img)

            risk_score = self._assess_risk_ml(
                pupil['diameter'], pupil['constriction'], gaze['stability']
            )

            return {
                "status": "success",
                "pupil_diameter": float(pupil['diameter']),
                "pupil_constriction": float(pupil['constriction']),
                "gaze_stability": float(gaze['stability']),
                "risk_score": float(risk_score),
                "clinical_markers": {
                    "hyperarousal": bool(pupil['diameter'] > 5.5),
                    "attentional_deficit": bool(gaze['stability'] < 0.6),
                    "blunted_reflex": bool(pupil['constriction'] < 0.3)
                }
            }

        except Exception as e:
            return {"status": "error", "error": str(e)}

    def _detect_pupil(self, img):
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)
        blurred = cv2.GaussianBlur(gray, (9, 9), 0)

        circles = cv2.HoughCircles(
            blurred, cv2.HOUGH_GRADIENT, 1, 50,
            param1=50, param2=30, minRadius=15, maxRadius=50
        )

        if circles is None:
            return None

        x, y, r = np.uint16(np.around(circles))[0][0]
        diameter = r * 2 * (8/200)
        constriction = max(0.1, 0.5 - (diameter - 5)/10)

        return {'diameter': diameter, 'constriction': constriction}

    def _track_gaze(self, img):
        results = self.face_mesh.process(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
        if not results.multi_face_landmarks:
            return {'stability': 0.5}

        landmarks = results.multi_face_landmarks[0].landmark
        h, w = img.shape[:2]

        left_center = np.mean([(landmarks[i].x * w, landmarks[i].y * h) for i in self.eye_landmarks['left']], axis=0)
        right_center = np.mean([(landmarks[i].x * w, landmarks[i].y * h) for i in self.eye_landmarks['right']], axis=0)
        current_center = np.mean([left_center, right_center], axis=0)

        self.prev_centers.append(current_center)
        if len(self.prev_centers) > 10:
            self.prev_centers.pop(0)

        if len(self.prev_centers) < 5:
            return {'stability': 0.5}

        dispersion = np.std(self.prev_centers, axis=0).mean()
        stability = max(0, 1 - (dispersion / 60))

        return {'stability': stability}

    def _assess_risk_ml(self, diameter, constriction, stability):
        features = np.array([[diameter, constriction, stability]])
        risk_score = self.model.predict_proba(features)[0][1]  # Probability of class 1
        return risk_score


if __name__ == "__main__":
    tracker = SchizophreniaTracker()
    for line in sys.stdin:
        line = line.strip()
        if line:
            result = tracker.process_frame(line)
            print(json.dumps(result), flush=True)
