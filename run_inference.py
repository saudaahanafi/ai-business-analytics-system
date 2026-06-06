# =============================================================================
# run_inference.py
# AI Business Analytics — Live Inference Script
# =============================================================================
#
# WHAT THIS DOES:
#   Called by Jamal's PHP (upload.php) every time a user uploads a CSV.
#   Loads the pre-trained .pkl model, runs predictions, calculates KPIs,
#   alerts and recommendations, then writes results to MySQL.
#
# CALLED BY PHP (upload.php):
#   python3 backend/ai/run_inference.py "<csv_path>" "<upload_id>"
#
# REQUIRED:
#   pip install pandas scikit-learn mysql-connector-python
#   The 4 .pkl files must exist in backend/model/
# =============================================================================

import sys
import os
import json
import pickle
import warnings
import datetime
import pandas as pd
import mysql.connector

warnings.filterwarnings("ignore")

# ── DATABASE CONFIG (Jamal fills these in) ────────────────────────────────────
DB_CONFIG = {
    "host":     "localhost",
    "user":     "root",         # Jamal: update this
    "password": "",             # Jamal: update this
    "database": "ai_business_analytics"  # Jamal: update this
}

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "model")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: LOAD & VALIDATE CSV
# Handles both Moroccan Secrets and Marwa layouts automatically
# ─────────────────────────────────────────────────────────────────────────────

def load_data(csv_path):
    df = pd.read_csv(csv_path)

    required = ["Date", "Product", "Price", "Quantity_Sold", "Stock"]
    missing  = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"CSV missing required columns: {missing}")

    # Parse dates
    df["Date"]  = pd.to_datetime(df["Date"])
    df["Month"] = df["Date"].dt.month
    df["Day"]   = df["Date"].dt.day

    # Auto-calculate Revenue if not present (handles Marwa layout)
    if "Revenue" not in df.columns:
        df["Revenue"] = df["Price"] * df["Quantity_Sold"]

    # Auto-fill Cost if not present
    if "Cost" not in df.columns:
        df["Cost"] = df["Price"] * 0.4  # assume 40% cost ratio

    # Auto-fill Category if not present
    if "Category" not in df.columns:
        df["Category"] = "General"

    # Auto-fill Currency
    if "Currency" not in df.columns:
        df["Currency"] = "NGN"

    return df


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: DETECT INDUSTRY & LOAD CORRECT .pkl MODEL
# ─────────────────────────────────────────────────────────────────────────────

def load_model(df):
    # Detect industry from Category column
    categories = df["Category"].str.lower().unique()
    products   = " ".join(df["Product"].str.lower().unique())

    skincare_keywords = ["skincare", "skin", "beauty", "soap", "oil", "cream",
                         "serum", "argan", "beldi", "hydrosol", "aker", "tbrima"]
    clothing_keywords = ["clothing", "fashion", "apparel", "robe", "blazer",
                         "jeans", "shirt", "kimono", "skirt", "hoodie", "cardigan"]

    is_skincare = any(k in " ".join(categories) or k in products
                      for k in skincare_keywords)
    is_clothing = any(k in " ".join(categories) or k in products
                      for k in clothing_keywords)

    if is_skincare:
        model_file   = os.path.join(MODEL_DIR, "skincare_model.pkl")
        encoder_file = os.path.join(MODEL_DIR, "skincare_encoder.pkl")
        industry     = "Skincare"
    elif is_clothing:
        model_file   = os.path.join(MODEL_DIR, "clothing_model.pkl")
        encoder_file = os.path.join(MODEL_DIR, "clothing_encoder.pkl")
        industry     = "Clothing"
    else:
        # Default to skincare model for unknown categories
        model_file   = os.path.join(MODEL_DIR, "skincare_model.pkl")
        encoder_file = os.path.join(MODEL_DIR, "skincare_encoder.pkl")
        industry     = "General"

    with open(model_file,   "rb") as f: model_bundle   = pickle.load(f)
    with open(encoder_file, "rb") as f: encoder_bundle = pickle.load(f)

    print(f"  Industry detected: {industry}")
    print(f"  Model loaded: {os.path.basename(model_file)}")

    return model_bundle, encoder_bundle, industry


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: RUN PREDICTIONS
# ─────────────────────────────────────────────────────────────────────────────

def run_predictions(df, model_bundle, encoder_bundle):
    ml_df = df.copy()

    le_product     = encoder_bundle["le_product"]
    le_category    = encoder_bundle["le_category"]
    demand_encoder = encoder_bundle["demand_encoder"]
    features       = encoder_bundle["features"]
    demand_features= encoder_bundle["demand_features"]
    low_thresh     = encoder_bundle["low_thresh"]
    high_thresh    = encoder_bundle["high_thresh"]

    rf         = model_bundle["random_forest"]
    classifier = model_bundle["classifier"]

    # Encode — handle unseen labels gracefully
    def safe_encode(encoder, values):
        known = set(encoder.classes_)
        return [encoder.transform([v])[0] if v in known else 0 for v in values]

    ml_df["Product_enc"]  = safe_encode(le_product,  ml_df["Product"])
    ml_df["Category_enc"] = safe_encode(le_category, ml_df["Category"])

    # Revenue predictions
    X = ml_df[features]
    ml_df["Predicted_Revenue"] = rf.predict(X)

    # Demand classification
    ml_df["Demand_Level"] = pd.cut(
        ml_df["Quantity_Sold"],
        bins=[0, low_thresh, high_thresh, 9999],
        labels=["Low", "Medium", "High"]
    )
    ml_df["Demand_enc"] = demand_encoder.transform(
        ml_df["Demand_Level"].astype(str)
    )

    X_cls = ml_df[demand_features]
    ml_df["Predicted_Demand_enc"] = classifier.predict(X_cls)
    ml_df["Predicted_Demand"] = demand_encoder.inverse_transform(
        ml_df["Predicted_Demand_enc"]
    )

    # Demand summary per product
    demand_summary = (
        ml_df.groupby("Product")["Predicted_Demand"]
        .agg(lambda x: x.value_counts().index[0])
        .to_dict()
    )

    return ml_df, demand_summary


# ─────────────────────────────────────────────────────────────────────────────
# STEP 4: KPI CALCULATION
# ─────────────────────────────────────────────────────────────────────────────

def format_currency(value, currency):
    symbols = {"NGN": "₦", "MAD": "MAD ", "USD": "$", "EUR": "€"}
    return f"{symbols.get(currency, '')}{value:,.0f}"

def calculate_kpis(df):
    currency     = df["Currency"].iloc[0]
    total_rev    = float(df["Revenue"].sum())
    total_cost   = float((df["Cost"] * df["Quantity_Sold"]).sum())
    net_profit   = total_rev - total_cost
    margin       = round((net_profit / total_rev)  * 100, 1) if total_rev  > 0 else 0
    roi          = round((net_profit / total_cost) * 100, 1) if total_cost > 0 else 0
    top_product  = df.groupby("Product")["Revenue"].sum().idxmax()
    weak_product = df.groupby("Product")["Revenue"].sum().idxmin()

    return {
        "total_revenue": total_rev,
        "net_profit":    net_profit,
        "revenue_fmt":   format_currency(total_rev,  currency),
        "profit_fmt":    format_currency(net_profit, currency),
        "margin":        f"{margin}%",
        "roi":           f"{roi}%",
        "top_product":   top_product,
        "weak_product":  weak_product,
        "currency":      currency
    }


# ─────────────────────────────────────────────────────────────────────────────
# STEP 5: REVENUE TREND
# ─────────────────────────────────────────────────────────────────────────────

def calculate_revenue_trend(df):
    month_names = {
        1:"January", 2:"February", 3:"March", 4:"April",
        5:"May", 6:"June", 7:"July", 8:"August",
        9:"September", 10:"October", 11:"November", 12:"December"
    }
    monthly = df.groupby("Month")["Revenue"].sum().sort_index()
    return {
        "labels": [month_names[m] for m in monthly.index.tolist()],
        "data":   [float(v) for v in monthly.values.tolist()]
    }


# ─────────────────────────────────────────────────────────────────────────────
# STEP 6: PRODUCT PERFORMANCE
# ─────────────────────────────────────────────────────────────────────────────

def calculate_product_performance(df):
    product_rev = df.groupby("Product")["Revenue"].sum().sort_values(ascending=False)
    return {
        "labels": product_rev.index.tolist(),
        "data":   [float(v) for v in product_rev.values.tolist()]
    }


# ─────────────────────────────────────────────────────────────────────────────
# STEP 7: INVENTORY ALERTS
# ─────────────────────────────────────────────────────────────────────────────

def calculate_inventory_alerts(df):
    alerts = []
    latest_stock = df.sort_values("Date").groupby("Product")["Stock"].last()

    for product, stock in latest_stock.items():
        stock = int(stock)
        if stock < 20:
            alerts.append({
                "product": product, "stock": stock, "level": "high",
                "message": f"{product} is critically low — only {stock} units left. Reorder immediately."
            })
        elif stock < 50:
            alerts.append({
                "product": product, "stock": stock, "level": "medium",
                "message": f"{product} stock is below threshold ({stock} units). Consider restocking soon."
            })
    return alerts


# ─────────────────────────────────────────────────────────────────────────────
# STEP 8: AI RECOMMENDATIONS
# ─────────────────────────────────────────────────────────────────────────────

def generate_recommendations(df, kpis, trend, alerts, model_bundle, demand_summary):
    recs     = []
    top      = kpis["top_product"]
    weak     = kpis["weak_product"]
    trend_d  = trend["data"]
    perf     = model_bundle["model_performance"]
    rf_r2    = perf["random_forest"]["r2"]

    if len(trend_d) >= 2:
        if trend_d[-1] < trend_d[-2]:
            recs.append("Sales dropped in the most recent period — investigate demand and consider a promotion.")
        else:
            recs.append("Revenue is trending upward. Maintain current strategy and consider scaling stock.")

    recs.append(f"Promote {top} aggressively — it is your highest revenue-generating product.")
    recs.append(f"Review pricing or run a discount campaign for {weak} to improve performance.")

    critical = [a for a in alerts if a["level"] == "high"]
    if critical:
        recs.append(f"Urgent restock needed for: {', '.join(a['product'] for a in critical)}.")

    recs.append(
        f"ML model (Random Forest) R² = {rf_r2} — "
        + ("predictions are reliable." if rf_r2 >= 0.85 else "upload more data to improve accuracy.")
    )

    high_demand = [p for p, d in demand_summary.items() if d == "High"]
    if high_demand:
        recs.append(f"High-demand products: {', '.join(high_demand)}. Ensure sufficient stock levels.")

    return recs


# ─────────────────────────────────────────────────────────────────────────────
# STEP 9: WRITE TO MYSQL
# Jamal: this writes to the 3 tables you defined
# ─────────────────────────────────────────────────────────────────────────────

def write_to_database(upload_id, kpis, trend, products, alerts,
                      recommendations, model_bundle, industry):
    conn   = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()
    perf   = model_bundle["model_performance"]
    now    = datetime.datetime.now()

    # ── sales_analytics table ──────────────────────────────────────────────
    cursor.execute("""
        INSERT INTO sales_analytics
            (upload_id, total_revenue, net_profit, profit_margin, roi,
             top_product, revenue_trend_labels, revenue_trend_data,
             product_labels, product_data, industry, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            total_revenue = VALUES(total_revenue),
            net_profit    = VALUES(net_profit),
            profit_margin = VALUES(profit_margin),
            roi           = VALUES(roi),
            top_product   = VALUES(top_product),
            revenue_trend_labels = VALUES(revenue_trend_labels),
            revenue_trend_data   = VALUES(revenue_trend_data),
            product_labels = VALUES(product_labels),
            product_data   = VALUES(product_data),
            industry       = VALUES(industry)
    """, (
        upload_id,
        kpis["total_revenue"],
        kpis["net_profit"],
        kpis["margin"],
        kpis["roi"],
        kpis["top_product"],
        json.dumps(trend["labels"]),
        json.dumps(trend["data"]),
        json.dumps(products["labels"]),
        json.dumps(products["data"]),
        industry,
        now
    ))

    # ── ai_predictions_results table ──────────────────────────────────────
    cursor.execute("""
        INSERT INTO ai_predictions_results
            (upload_id, alerts, recommendations,
             model_r2, model_mae, classifier_accuracy,
             selected_model, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            alerts                = VALUES(alerts),
            recommendations       = VALUES(recommendations),
            model_r2              = VALUES(model_r2),
            model_mae             = VALUES(model_mae),
            classifier_accuracy   = VALUES(classifier_accuracy)
    """, (
        upload_id,
        json.dumps([a["message"] for a in alerts]),
        json.dumps(recommendations),
        perf["random_forest"]["r2"],
        perf["random_forest"]["mae"],
        perf["demand_classifier"]["accuracy"],
        "Random Forest",
        now
    ))

    # ── Update uploads table status to 'completed' ─────────────────────────
    cursor.execute("""
        UPDATE uploads SET status = 'completed', updated_at = %s
        WHERE id = %s
    """, (now, upload_id))

    conn.commit()
    cursor.close()
    conn.close()
    print("  Results written to database successfully.")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python3 run_inference.py <csv_path> <upload_id>"}))
        sys.exit(1)

    csv_path  = sys.argv[1]
    upload_id = sys.argv[2]

    print(f"\n  run_inference.py started")
    print(f"  CSV:       {csv_path}")
    print(f"  Upload ID: {upload_id}")

    try:
        df                        = load_data(csv_path)
        model_bundle, encoders, industry = load_model(df)
        ml_df, demand_summary     = run_predictions(df, model_bundle, encoders)
        kpis                      = calculate_kpis(df)
        trend                     = calculate_revenue_trend(df)
        products                  = calculate_product_performance(df)
        alerts                    = calculate_inventory_alerts(df)
        recommendations           = generate_recommendations(
                                        df, kpis, trend, alerts,
                                        model_bundle, demand_summary
                                    )

        write_to_database(
            upload_id, kpis, trend, products,
            alerts, recommendations, model_bundle, industry
        )

        print(f"  Pipeline complete for upload_id={upload_id}")
        sys.exit(0)

    except FileNotFoundError:
        print(f"  ERROR: CSV not found — {csv_path}")
        sys.exit(1)

    except Exception as e:
        print(f"  ERROR: {str(e)}")
        # Mark upload as failed in DB
        try:
            conn   = mysql.connector.connect(**DB_CONFIG)
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE uploads SET status = 'failed' WHERE id = %s",
                (upload_id,)
            )
            conn.commit()
            cursor.close()
            conn.close()
        except:
            pass
        sys.exit(1)


if __name__ == "__main__":
    main()
