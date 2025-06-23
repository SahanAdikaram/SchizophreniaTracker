# train_model.py (Run this separately to create the model file)
import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier

# Example training data
X = np.array([
    [6.5, 0.2, 0.4],  # [diameter, constriction, stability]
    [5.2, 0.4, 0.9],
    [7.1, 0.1, 0.3],
    [4.9, 0.5, 0.85]
])
y = [1, 0, 1, 0]  # 1 = schizophrenia risk, 0 = normal

clf = RandomForestClassifier()
clf.fit(X, y)

# Save model
joblib.dump(clf, 'ml_model.joblib')
