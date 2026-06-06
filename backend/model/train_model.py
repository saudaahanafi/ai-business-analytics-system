# =============================================================================
# train_model.py
# AI Business Analytics — One-Time Model Training Script
# =============================================================================
#
# WHAT THIS DOES:
#   Trains two Random Forest models (one per business type) on your
#   existing CSVs and saves them as .pkl files.
#
# RUN THIS ONCE on your local machine (XAMPP terminal):
#   python backend/model/train_model.py
#
# OUTPUT (saved to backend/model/):
#   skincare_model.pkl   — trained on Moroccan Secrets data
#   clothing_model.pkl   — trained on Marwa data
#   skincare_encoder.pkl — product/category label encoders for skincare
#   clothing_encoder.pkl — product/category label encoders for clothing
#
# AFTER THIS: never run again. run_inference.py loads these .pkl files.
#
# REQUIRED:
#   pip install pandas scikit-learn
#   Your two CSV files must exist at the paths below.
# =============================================================================

import os
import pickle
import warnings
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.tree import DecisionTreeClassifier
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score, mean_absolute_error, accuracy_score

warnings.filterwarnings("ignore")

# ── PATHS ─────────────────────────────────────────────────────────────────────
# Adjust these paths to wherever your CSVs are saved locally
MOROCCAN_CSV = "backend/dataset/moroccan_secrets_dataset (2).csv"
MARWA_CSV    = "backend/dataset/marwa_dataset (1).csv"
MODEL_DIR    = "backend/model"

os.makedirs(MODEL_DIR, exist_ok=True)


# ── HELPER: prepare dataframe for ML ──────────────────────────────────────────
def prepare_df(df):
    df = df.copy()
    df["Date"]  = pd.to_datetime(df["Date"])
    df["Month"] = df["Date"].dt.month
    df["Day"]   = df["Date"].dt.day

    # Auto-calculate Revenue if missing
    if "Revenue" not in df.columns:
        df["Revenue"] = df["Price"] * df["Quantity_Sold"]

    # Fill currency if missing
    if "Currency" not in df.columns:
        df["Currency"] = "NGN"

    return df


# ── HELPER: add demand labels (same bins as your Colab notebook) ───────────────
def add_demand_labels(df, low_thresh, high_thresh):
    df["Demand_Level"] = pd.cut(
        df["Quantity_Sold"],
        bins=[0, low_thresh, high_thresh, 9999],
        labels=["Low", "Medium", "High"]
    )
    return df


# ── MAIN TRAINING FUNCTION ────────────────────────────────────────────────────
def train_and_save(csv_path, model_filename, encoder_filename,
                   industry, low_thresh, high_thresh):

    print(f"\n{'='*60}")
    print(f"  Training: {industry}")
    print(f"{'='*60}")

    # Load
    df = pd.read_csv(csv_path)
    df = prepare_df(df)
    df = add_demand_labels(df, low_thresh, high_thresh)

    print(f"  Loaded {len(df)} rows, {df['Product'].nunique()} products")

    # Encode categoricals
    le_product  = LabelEncoder()
    le_category = LabelEncoder()
    df["Product_enc"]  = le_product.fit_transform(df["Product"])
    df["Category_enc"] = le_category.fit_transform(df["Category"])

    # ── REVENUE PREDICTION FEATURES ───────────────────────────────────────────
    features = ["Product_enc", "Category_enc", "Price", "Cost",
                "Quantity_Sold", "Stock", "Day", "Month"]
    X = df[features]
    y = df["Revenue"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    # Linear Regression (for comparison — kept from your notebook)
    lr = LinearRegression()
    lr.fit(X_train, y_train)
    lr_r2  = round(r2_score(y_test, lr.predict(X_test)), 3)
    lr_mae = round(mean_absolute_error(y_test, lr.predict(X_test)), 2)
    print(f"  Linear Regression  → R²: {lr_r2}  MAE: {lr_mae}")

    # Random Forest (winner from your notebook — this is what gets saved)
    rf = RandomForestRegressor(n_estimators=100, random_state=42)
    rf.fit(X_train, y_train)
    rf_r2  = round(r2_score(y_test, rf.predict(X_test)), 3)
    rf_mae = round(mean_absolute_error(y_test, rf.predict(X_test)), 2)
    print(f"  Random Forest      → R²: {rf_r2}  MAE: {rf_mae}  ✓ SELECTED")

    # ── DEMAND CLASSIFIER ─────────────────────────────────────────────────────
    demand_encoder = LabelEncoder()
    df["Demand_enc"] = demand_encoder.fit_transform(
        df["Demand_Level"].astype(str)
    )

    X_cls = df[["Product_enc", "Price", "Stock", "Day"]]
    y_cls = df["Demand_enc"]

    X_train_c, X_test_c, y_train_c, y_test_c = train_test_split(
        X_cls, y_cls, test_size=0.2, random_state=42
    )

    classifier = DecisionTreeClassifier(random_state=42)
    classifier.fit(X_train_c, y_train_c)
    cls_acc = round(accuracy_score(y_test_c, classifier.predict(X_test_c)), 3)
    print(f"  Demand Classifier  → Accuracy: {cls_acc}")

    # ── SAVE MODELS + ENCODERS ────────────────────────────────────────────────
    model_bundle = {
        "random_forest":    rf,
        "classifier":       classifier,
        "model_performance": {
            "linear_regression": {"r2": lr_r2,  "mae": lr_mae},
            "random_forest":     {"r2": rf_r2,  "mae": rf_mae},
            "demand_classifier": {"accuracy": cls_acc},
            "selected_model":    "Random Forest"
        }
    }

    encoder_bundle = {
        "le_product":      le_product,
        "le_category":     le_category,
        "demand_encoder":  demand_encoder,
        "features":        features,
        "demand_features": ["Product_enc", "Price", "Stock", "Day"],
        "low_thresh":      low_thresh,
        "high_thresh":     high_thresh
    }

    model_path   = os.path.join(MODEL_DIR, model_filename)
    encoder_path = os.path.join(MODEL_DIR, encoder_filename)

    with open(model_path,   "wb") as f: pickle.dump(model_bundle,   f)
    with open(encoder_path, "wb") as f: pickle.dump(encoder_bundle, f)

    print(f"  Saved → {model_path}")
    print(f"  Saved → {encoder_path}")

    return rf_r2, cls_acc


# ── RUN ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":

    print("\n  AI Business Analytics — Model Training")
    print("  Run once on localhost. Do not re-run on live server.\n")

    # Train Moroccan Secrets (Skincare)
    # Demand bins from your Colab: Low=0-8, Medium=8-15, High=15+
    ms_r2, ms_acc = train_and_save(
        csv_path         = MOROCCAN_CSV,
        model_filename   = "skincare_model.pkl",
        encoder_filename = "skincare_encoder.pkl",
        industry         = "Moroccan Secrets (Skincare)",
        low_thresh       = 8,
        high_thresh      = 15
    )

    # Train Marwa (Clothing)
    # Demand bins from your Colab: Low=0-6, Medium=6-14, High=14+
    m_r2, m_acc = train_and_save(
        csv_path         = MARWA_CSV,
        model_filename   = "clothing_model.pkl",
        encoder_filename = "clothing_encoder.pkl",
        industry         = "Marwa (Clothing)",
        low_thresh       = 6,
        high_thresh      = 14
    )

    print(f"\n{'='*60}")
    print("  TRAINING COMPLETE")
    print(f"  Skincare model  → R²: {ms_r2}  |  Demand accuracy: {ms_acc}")
    print(f"  Clothing model  → R²: {m_r2}  |  Demand accuracy: {m_acc}")
    print(f"\n  4 files saved to {MODEL_DIR}/:")
    print("    skincare_model.pkl")
    print("    skincare_encoder.pkl")
    print("    clothing_model.pkl")
    print("    clothing_encoder.pkl")
    print("\n  Hand these to Jamal. Training is done.")
    print(f"{'='*60}\n")
