# =============================================================================
# retrain_existing_models.py
# One-time migration: regenerate model_store_{id}.pkl / encoder_store_{id}.pkl
# for every EXISTING user whose model was trained under the old train_model.py.
#
# WHY THIS IS NEEDED
# -------------------
# model_performance (r2 / mae / accuracy) is computed once at training time
# and pickled into model_store_{id}.pkl — it is NOT recalculated at inference.
# The old train_model.py hardcoded these values (r2=0.92, mae=0.0, acc=0.90)
# for every store regardless of their actual data. The fixed train_model.py
# now computes them for real from a held-out test split.
#
# New users trained AFTER this fix already get real numbers baked in from the
# start. Existing users' .pkl files still contain the old fake numbers until
# their model is retrained — which is what this script does, once, for all
# of them, using each user's most recently completed CSV upload.
#
# USAGE
# -----
#   py retrain_existing_models.py            # retrain every existing store
#   py retrain_existing_models.py 17         # retrain only store/user 17
#
# Safe to re-run: it simply overwrites model_store_{id}.pkl / encoder_store_{id}.pkl
# with freshly trained versions using the same training logic new users get.
# =============================================================================
import os
import sys
import glob
import re
import mysql.connector

sys.path.insert(0, os.path.dirname(__file__))
from train_model import train_custom_model  # reuses the exact same fixed training logic

DB_CONFIG = {
    "host":     "localhost",
    "user":     "root",
    "password": "",
    "database": "business_analytics_db"
}

MODEL_DIR = os.path.dirname(__file__)

def find_existing_store_ids():
    """Every store_identifier that already has a custom-trained model file."""
    pattern = os.path.join(MODEL_DIR, "model_store_*.pkl")
    ids = []
    for path in glob.glob(pattern):
        match = re.search(r"model_store_(.+)\.pkl$", os.path.basename(path))
        if match:
            ids.append(match.group(1))
    return ids

def get_latest_csv_for_store(cursor, store_identifier):
    """Most recent successfully-processed CSV for this user — used as the
    training set to regenerate their model."""
    cursor.execute("""
        SELECT saved_file_path
        FROM uploads
        WHERE user_id = %s AND status = 'completed' AND saved_file_path IS NOT NULL
        ORDER BY uploaded_at DESC
        LIMIT 1
    """, (store_identifier,))
    row = cursor.fetchone()
    return row[0] if row else None

def retrain_all(target_store_id=None):
    store_ids = [target_store_id] if target_store_id else find_existing_store_ids()

    if not store_ids:
        print("No existing store models found to retrain.")
        return

    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()

    succeeded, skipped, failed = [], [], []

    for store_id in store_ids:
        csv_path = get_latest_csv_for_store(cursor, store_id)

        if not csv_path or not os.path.exists(csv_path):
            print(f"SKIP  store {store_id}: no completed CSV upload found on disk.")
            skipped.append(store_id)
            continue

        try:
            train_custom_model(csv_path, store_id)
            print(f"OK    store {store_id}: retrained from {os.path.basename(csv_path)}")
            succeeded.append(store_id)
        except Exception as e:
            print(f"FAIL  store {store_id}: {e}")
            failed.append(store_id)

    cursor.close()
    conn.close()

    print("\n--- Retraining summary ---")
    print(f"Succeeded: {len(succeeded)} -> {succeeded}")
    print(f"Skipped:   {len(skipped)} -> {skipped}")
    print(f"Failed:    {len(failed)} -> {failed}")

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else None
    retrain_all(target)  