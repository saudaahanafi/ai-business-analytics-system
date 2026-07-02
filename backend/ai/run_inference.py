# =============================================================================
# run_inference.py
# AI Business Analytics — Live Computational Optimization Pipeline
# =============================================================================
import sys
import os
import json
import pickle
import warnings
import datetime
import pandas as pd
import numpy as np
import mysql.connector

warnings.filterwarnings("ignore")

DB_CONFIG = {
    "host":     "localhost",
    "user":     "root",         
    "password": "",             
    "database": "business_analytics_db"  
}  

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "model")

def load_data(csv_path):
    df = pd.read_csv(csv_path)
    df.columns = [str(col).strip() for col in df.columns]
    
    # FIXED: Added lowercase case-insensitive dynamic underscore matching variations 
    header_mapping = {
        "Product": ["product", "item", "product name", "item name", "products", "items", "name", "product_name"],
        "Price": ["price", "unit price", "unit_price", "rate", "selling price", "prise", "prices"],
        "Quantity_Sold": ["quantity_sold", "quantity", "qty", "qty sold", "quantity sold", "units sold", "units_sold", "sold", "quantity_solde"],
        "Stock": ["stock", "current stock", "inventory", "stock count", "stok", "available stock"],
        "Date": ["date", "sales date", "transaction date", "day"],
        "Currency": ["currency", "curr", "money", "devise", "Currency"],
        "Rating": ["rating", "ratings", "stars", "star_rating", "review_rating", "customer_rating", "score"],
        "Review": ["review", "reviews", "review_text", "comment", "comments", "feedback", "customer_review"]
    }
    
    new_columns = {}
    for official_header, aliases in header_mapping.items():
        for col in df.columns:
            if col.lower() in aliases:
                new_columns[col] = official_header
                break
                
    df.rename(columns=new_columns, inplace=True)

    # FIXED: Fallback handling for missing Stock column to match data pipeline properties cleanly
    if "Stock" not in df.columns:
        df["Stock"] = 0

    required = ["Date", "Product", "Price", "Quantity_Sold", "Stock"]
    missing  = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"CSV missing required columns: {missing}")

    df["Date"]  = pd.to_datetime(df["Date"])
    df["Month"] = df["Date"].dt.month
    df["Day"]   = df["Date"].dt.day

    if "Revenue" not in df.columns:
        df["Revenue"] = df["Price"] * df["Quantity_Sold"]
    if "Cost" not in df.columns:
        df["Cost"] = df["Price"] * 0.4  
    if "Category" not in df.columns:
        df["Category"] = "General"
        
    # FIXED: Dynamically capture whatever is in the Currency column first
    if "Currency" in df.columns:
        valid_currencies = df["Currency"].dropna()
        if not valid_currencies.empty:
            df["Currency"] = str(valid_currencies.iloc[0]).strip().upper()
    else:
        df["Currency"] = "USD" # Adaptive default fallback

    return df

def load_model(store_identifier):
    model_file   = os.path.join(MODEL_DIR, f"model_store_{store_identifier}.pkl")
    encoder_file = os.path.join(MODEL_DIR, f"encoder_store_{store_identifier}.pkl")
    
    if not os.path.exists(model_file):
        model_file   = os.path.join(MODEL_DIR, "skincare_model.pkl")
        encoder_file = os.path.join(MODEL_DIR, "skincare_encoder.pkl")
        industry     = "General Retail Line"
    else:
        industry     = "Custom Retrained Enterprise Store"

    with open(model_file,   "rb") as f: model_bundle   = pickle.load(f)
    with open(encoder_file, "rb") as f: encoder_bundle = pickle.load(f)

    return model_bundle, encoder_bundle, industry

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

    def safe_encode(encoder, values):
        known = set(encoder.classes_)
        return [encoder.transform([v])[0] if v in known else 0 for v in values]

    ml_df["Product_enc"]  = safe_encode(le_product,  ml_df["Product"])
    ml_df["Category_enc"] = safe_encode(le_category, ml_df["Category"])

    X = ml_df[features]
    ml_df["Predicted_Revenue"] = rf.predict(X)

    ml_df["Demand_Level"] = pd.cut(
        ml_df["Quantity_Sold"],
        bins=[-1, low_thresh, high_thresh, 9999999],
        labels=["Low", "Medium", "High"]
    )
    ml_df["Demand_enc"] = demand_encoder.transform(ml_df["Demand_Level"].astype(str))

    X_cls = ml_df[demand_features]
    ml_df["Predicted_Demand_enc"] = classifier.predict(X_cls)
    ml_df["Predicted_Demand"] = demand_encoder.inverse_transform(ml_df["Predicted_Demand_enc"])

    demand_summary = (
        ml_df.groupby("Product")["Predicted_Demand"]
        .agg(lambda x: x.value_counts().index[0])
        .to_dict()
    )

    return ml_df, demand_summary

def format_currency(value, currency):
    symbols = {"NGN": "₦", "MAD": "MAD ", "USD": "$", "EUR": "€", "GBP": "£"}
    return f"{symbols.get(currency, '')}{value:,.0f}"

def calculate_predicted_revenue_trend(ml_df):
    """Predicted revenue by month, aligned with the actual revenue trend labels."""
    month_names = {
        1:"January", 2:"February", 3:"March", 4:"April", 5:"May", 6:"June",
        7:"July", 8:"August", 9:"September", 10:"October", 11:"November", 12:"December"
    }
    monthly = ml_df.groupby("Month")["Predicted_Revenue"].sum().sort_index()
    return {
        "labels": [month_names[m] for m in monthly.index.tolist()],
        "data":   [float(v) for v in monthly.values.tolist()]
    }

def calculate_demand_breakdown(ml_df):
    """Counts of products predicted Low / Medium / High demand, plus per-product detail."""
    counts = ml_df["Predicted_Demand"].value_counts()
    labels = ["Low", "Medium", "High"]
    data   = [int(counts.get(lvl, 0)) for lvl in labels]

    per_product = (
        ml_df.groupby("Product")["Predicted_Demand"]
        .agg(lambda x: x.value_counts().index[0])
        .to_dict()
    )

    return {
        "labels": labels,
        "data": data,
        "per_product": per_product
    }

def calculate_price_simulator_data(df, max_products=15):
    """Per-product average price/quantity so the frontend can run a client-side
    'what-if I change the price' estimate. Uses a simple constant-elasticity
    assumption (elasticity = -1) as a transparent, explainable heuristic —
    not a trained econometric model."""
    grouped = df.groupby("Product").agg(
        avg_price=("Price", "mean"),
        avg_qty=("Quantity_Sold", "mean"),
        total_revenue=("Revenue", "sum")
    ).sort_values("total_revenue", ascending=False).head(max_products)

    products = {}
    for product, row in grouped.iterrows():
        products[product] = {
            "avg_price": round(float(row["avg_price"]), 2),
            "avg_qty":   round(float(row["avg_qty"]), 2),
            "elasticity_assumed": -1.0
        }
    return products

def calculate_inventory_status(df):
    """Full stock snapshot per product (not just the ones that trigger alerts),
    used to render visual stock-level bars on the frontend."""
    low_thresh, med_thresh = 20, 50
    latest_stock = df.sort_values("Date").groupby("Product")["Stock"].last()

    status = []
    for product, stock in latest_stock.items():
        stock = int(stock)
        if stock == 0:
            level = "untracked"
        elif stock < low_thresh:
            level = "high"
        elif stock < med_thresh:
            level = "medium"
        else:
            level = "healthy"
        status.append({
            "product": product,
            "stock": stock,
            "level": level,
            "low_thresh": low_thresh,
            "med_thresh": med_thresh
        })
    return status

def calculate_avg_transaction_value(df):
    """Average revenue per row (proxy for 'per transaction'), used to translate
    a projected revenue increase into an estimated number of additional
    customers/orders needed to hit it."""
    total_rows = len(df)
    total_rev  = float(df["Revenue"].sum())
    avg_txn    = round(total_rev / total_rows, 2) if total_rows > 0 else 0
    return {
        "avg_transaction_value": avg_txn,
        "transaction_count": int(total_rows)
    }

def calculate_health_score(kpis, model_bundle):
    """Composite 0-100 business health score, computed once server-side so the
    dashboard and full report always agree."""
    perf   = model_bundle["model_performance"]
    r2     = float(perf["random_forest"]["r2"])
    acc    = float(perf["demand_classifier"]["accuracy"])
    margin = float(str(kpis["margin"]).replace("%", "") or 0)

    score = (r2 * 40) + (acc * 40) + (min(margin / 30, 1) * 20)
    return int(round(min(100, max(0, score))))

def calculate_review_insights(df):
    """Optional feature: if the CSV includes a Rating column, summarize customer
    satisfaction. Returns None (feature simply not shown) if no rating data
    was provided — this is additive and never required."""
    if "Rating" not in df.columns:
        return None

    ratings = pd.to_numeric(df["Rating"], errors="coerce").dropna()
    if ratings.empty:
        return None

    overall_avg = round(float(ratings.mean()), 2)
    rounded = ratings.round().clip(1, 5).astype(int)
    distribution = {str(i): int((rounded == i).sum()) for i in range(1, 6)}

    tmp = df.copy()
    tmp["Rating_num"] = pd.to_numeric(tmp["Rating"], errors="coerce")
    product_avg = tmp.groupby("Product")["Rating_num"].mean().dropna().round(2).to_dict()

    return {
        "overall_avg_rating": overall_avg,
        "rating_distribution": distribution,
        "product_avg_rating": product_avg,
        "review_count": int(ratings.shape[0])
    }

def forecast_future_sales(df, periods=3, review_insights=None):
    """Forward-looking revenue forecast for the next `periods` months, beyond
    the historical data actually in the CSV. This is a transparent linear-trend
    projection (not the trained Random Forest, which only knows historical
    rows) — optionally nudged by average customer rating as a simple,
    explainable satisfaction signal. Always labeled as an estimate."""
    monthly = df.groupby(df["Date"].dt.to_period("M"))["Revenue"].sum().sort_index()

    if len(monthly) == 0:
        return {"labels": [], "data": [], "rating_multiplier": 1.0, "method": "insufficient data"}

    if len(monthly) >= 2:
        y = monthly.values.astype(float)
        x = np.arange(len(y))
        slope, _intercept = np.polyfit(x, y, 1)
    else:
        slope = 0.0

    last_period = monthly.index[-1]
    last_value  = float(monthly.iloc[-1])

    rating_multiplier = 1.0
    if review_insights and review_insights.get("overall_avg_rating") is not None:
        avg_rating = review_insights["overall_avg_rating"]
        # +/-5% per rating point away from a neutral 3.0, capped at +/-15%
        rating_multiplier = 1 + max(-0.15, min(0.15, (avg_rating - 3) * 0.05))

    labels, data = [], []
    for i in range(1, periods + 1):
        future_period = last_period + i
        projected = max(0.0, last_value + slope * i) * rating_multiplier
        labels.append(future_period.strftime("%B %Y"))
        data.append(round(projected, 2))

    return {
        "labels": labels,
        "data": data,
        "rating_multiplier": round(rating_multiplier, 3),
        "method": "linear trend on historical monthly revenue" + (
            ", adjusted by average customer rating" if rating_multiplier != 1.0 else ""
        )
    }

REVIEW_THEMES = {
    "Product Defect / Malfunction": [
        "broken", "defect", "malfunction", "stopped working", "doesn't work", "does not work",
        "faulty", "dead on arrival", "won't turn on", "wont turn on", "quit working", "broke after",
        "not functioning", "stopped after"
    ],
    "Underperformance / Ineffective": [
        "no differen", "didn't work", "did nothing", "no effect", "ineffective", "no results",
        "underwhelming", "doesn't do what", "disappointing results", "not as advertised",
        "not as described", "false advertis"
    ],
    "Battery / Power Issue": [
        "battery drain", "battery life", "won't charge", "wont charge", "overheat",
        "short battery", "dies quickly", "power issue", "charging issue"
    ],
    "Health / Safety Concern": [
        "irritat", "allerg", "rash", "burn", "injury", "unsafe", "hazard",
        "broke me out", "break out", "breakout"
    ],
    "Comfort / Fit / Sensory Complaint": [
        "uncomfortable", "itchy", "too tight", "too loose", "bad smell", "bad taste",
        "greasy", "sticky", "texture", "unpleasant", "doesn't fit", "poor fit"
    ],
    "Shipping / Packaging Issue": [
        "leak", "damaged", "packaging", "expired", "arrived broken", "arrived damaged",
        "delivery", "wrong item", "late delivery", "shipping issue", "in transit"
    ],
    "Value for Money Concern": [
        "overpriced", "too expensive", "not worth", "pricey", "waste of money",
        "rip off", "ripoff", "overpriced for"
    ],
    "Customer Service / Support Issue": [
        "customer service", "support was", "unhelpful", "no response", "refund",
        "return process", "rude", "no reply", "poor support"
    ],
    "Quality Concern (General)": [
        "cheaply made", "poor quality", "low quality", "flimsy", "fell apart",
        "cheap material", "wore out", "wear and tear"
    ],
}

def analyze_review_themes(df):
    """Optional feature: keyword-based theme tagging of written reviews.
    Transparent by design (no black-box sentiment score) — every theme is
    traceable to the keywords that triggered it. Returns None if the CSV
    has no Review column or no non-empty review text."""
    if "Review" not in df.columns:
        return None

    reviews = df[["Product", "Rating", "Review"]].copy()
    # FIXED: filter out missing values via notna() BEFORE any string
    # conversion. astype(str) does not reliably turn missing/NaN cells into
    # the literal text "nan" across pandas versions — on some it leaves
    # them as real NaN floats even after conversion, which broke the old
    # "!= 'nan'" string filter and let raw floats reach .lower() below.
    reviews = reviews[reviews["Review"].notna()]
    reviews["Review"] = reviews["Review"].astype(str).str.strip()
    reviews = reviews[reviews["Review"] != ""]
    if reviews.empty:
        return None

    theme_counts = {theme: 0 for theme in REVIEW_THEMES}
    product_themes = {}

    for _, row in reviews.iterrows():
        text_lower = row["Review"].lower()
        for theme, keywords in REVIEW_THEMES.items():
            if any(kw in text_lower for kw in keywords):
                theme_counts[theme] += 1
                product_themes.setdefault(row["Product"], {})
                product_themes[row["Product"]][theme] = product_themes[row["Product"]].get(theme, 0) + 1

    theme_counts = {k: v for k, v in theme_counts.items() if v > 0}

    # Representative quote per product = their lowest-rated written review,
    # truncated for display. This is the customer's own uploaded business
    # data, not third-party copyrighted material.
    quotes = {}
    low_rated = reviews[reviews["Rating"] <= 2.5].sort_values("Rating")
    for product, group in low_rated.groupby("Product"):
        quotes[product] = group.iloc[0]["Review"][:140]

    return {
        "theme_counts": theme_counts,
        "product_themes": product_themes,
        "sample_quotes": quotes,
        "reviews_analyzed": int(len(reviews))
    }

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

def calculate_revenue_trend(df):
    month_names = {
        1:"January", 2:"February", 3:"March", 4:"April", 5:"May", 6:"June",
        7:"July", 8:"August", 9:"September", 10:"October", 11:"November", 12:"December"
    }
    monthly = df.groupby("Month")["Revenue"].sum().sort_index()
    return {
        "labels": [month_names[m] for m in monthly.index.tolist()],
        "data":   [float(v) for v in monthly.values.tolist()]
    }

def calculate_product_performance(df):
    product_rev = df.groupby("Product")["Revenue"].sum().sort_values(ascending=False)
    return {
        "labels": product_rev.index.tolist(),
        "data":   [float(v) for v in product_rev.values.tolist()]
    }

def calculate_inventory_alerts(df):
    alerts = []
    latest_stock = df.sort_values("Date").groupby("Product")["Stock"].last()

    for product, stock in latest_stock.items():
        stock = int(stock)
        # Suppress standard alert triggers if stock tracking is unassigned/0
        if stock == 0:
            continue
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

def generate_recommendations(df, kpis, trend, alerts, model_bundle, demand_summary, review_insights=None, forecast=None, theme_analysis=None):
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

    recs.append(f"ML model (Random Forest) R² = {rf_r2} — predictions are stable.")

    high_demand = [p for p, d in demand_summary.items() if d == "High"]
    if high_demand:
        recs.append(f"High-demand products: {', '.join(high_demand)}. Ensure sufficient stock levels.")

    if review_insights:
        low_rated_high_demand = [
            p for p in high_demand
            if review_insights["product_avg_rating"].get(p, 5) < 3.0
        ]
        if low_rated_high_demand:
            recs.append(
                f"Warning: {', '.join(low_rated_high_demand)} are in high demand but rated below 3/5 by customers — "
                f"investigate quality or service issues before scaling further."
            )
        elif review_insights["overall_avg_rating"] < 3.5:
            recs.append(
                f"Overall customer rating is {review_insights['overall_avg_rating']}/5, below a healthy threshold — "
                f"prioritize product quality and customer service improvements."
            )
        else:
            recs.append(f"Customer satisfaction is solid at {review_insights['overall_avg_rating']}/5 — leverage positive reviews in marketing.")

    if forecast and forecast.get("data"):
        proj = forecast["data"][0]
        recs.append(f"Projected revenue for {forecast['labels'][0]} is approximately {round(proj):,} based on current trend{' and customer ratings' if forecast.get('rating_multiplier', 1.0) != 1.0 else ''}.")

    if theme_analysis and theme_analysis.get("product_themes"):
        for product, themes in theme_analysis["product_themes"].items():
            top_theme = max(themes, key=themes.get)
            if themes[top_theme] >= 2 and (not review_insights or review_insights["product_avg_rating"].get(product, 5) < 3.5):
                recs.append(f"Customers most frequently cite \"{top_theme}\" in reviews for {product} — investigate before scaling further.")
                break  # surface the single most actionable theme, not a flood of them

    return recs

def write_to_database(upload_id, kpis, trend, products, alerts, recommendations, model_bundle, industry,
                       predicted_trend, demand_breakdown, price_sim, inventory_status, txn_info, health_score,
                       review_insights, forecast, theme_analysis):
    conn   = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()
    perf   = model_bundle["model_performance"]
    now    = datetime.datetime.now()

    cursor.execute("""
        INSERT INTO sales_analytics
            (upload_id, total_revenue, net_profit, profit_margin, roi, top_product, 
             revenue_trend_labels, revenue_trend_data, product_labels, product_data, industry, currency,
             predicted_revenue_trend_labels, predicted_revenue_trend_data, price_simulator_data,
             inventory_status, avg_transaction_value, transaction_count, health_score,
             review_summary, future_revenue_forecast, review_theme_analysis, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (upload_id, kpis["total_revenue"], kpis["net_profit"], kpis["margin"], kpis["roi"], kpis["top_product"],
          json.dumps(trend["labels"]), json.dumps(trend["data"]), json.dumps(products["labels"]), json.dumps(products["data"]), 
          industry, kpis["currency"],
          json.dumps(predicted_trend["labels"]), json.dumps(predicted_trend["data"]), json.dumps(price_sim),
          json.dumps(inventory_status), txn_info["avg_transaction_value"], txn_info["transaction_count"],
          health_score, json.dumps(review_insights), json.dumps(forecast), json.dumps(theme_analysis), now))

    cursor.execute("""
        INSERT INTO ai_predictions_results
            (upload_id, alerts, recommendations, model_r2, model_mae, classifier_accuracy, selected_model,
             demand_breakdown, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (upload_id, json.dumps([a["message"] for a in alerts]), json.dumps(recommendations),
          perf["random_forest"]["r2"], perf["random_forest"]["mae"], perf["demand_classifier"]["accuracy"], "Random Forest",
          json.dumps(demand_breakdown), now))

    cursor.execute("UPDATE uploads SET status = 'completed', updated_at = %s WHERE id = %s", (now, upload_id))
    conn.commit()
    cursor.close()
    conn.close()

def main():
    if len(sys.argv) < 4:
        sys.exit(1)

    csv_path         = sys.argv[1]
    upload_id        = sys.argv[2]
    store_identifier = sys.argv[3]

    try:
        df                               = load_data(csv_path)
        model_bundle, encoders, industry = load_model(store_identifier)
        ml_df, demand_summary            = run_predictions(df, model_bundle, encoders)

        # FIXED: bring the model's predictions back into the frame that feeds
        # every downstream calculation — previously ml_df was computed but
        # never used again, so Predicted_Revenue never reached the database.
        df["Predicted_Revenue"] = ml_df["Predicted_Revenue"]

        kpis                             = calculate_kpis(df)
        trend                            = calculate_revenue_trend(df)
        products                         = calculate_product_performance(df)
        alerts                           = calculate_inventory_alerts(df)

        # New features
        predicted_trend  = calculate_predicted_revenue_trend(ml_df)
        demand_breakdown = calculate_demand_breakdown(ml_df)
        price_sim        = calculate_price_simulator_data(df)
        inventory_status = calculate_inventory_status(df)
        txn_info         = calculate_avg_transaction_value(df)
        health_score      = calculate_health_score(kpis, model_bundle)
        review_insights  = calculate_review_insights(df)
        forecast         = forecast_future_sales(df, periods=3, review_insights=review_insights)
        theme_analysis   = analyze_review_themes(df)

        recommendations  = generate_recommendations(df, kpis, trend, alerts, model_bundle, demand_summary,
                                                      review_insights=review_insights, forecast=forecast,
                                                      theme_analysis=theme_analysis)

        write_to_database(upload_id, kpis, trend, products, alerts, recommendations, model_bundle, industry,
                           predicted_trend, demand_breakdown, price_sim, inventory_status, txn_info, health_score,
                           review_insights, forecast, theme_analysis)
        print(f"SUCCESS: Inference pipeline successfully processed upload ID: {upload_id}")
        sys.exit(0)

    except Exception as e:
        print(f"ERROR: {str(e)}")
        try:
            conn   = mysql.connector.connect(**DB_CONFIG)
            cursor = conn.cursor()
            cursor.execute("UPDATE uploads SET status = 'failed' WHERE id = %s", (upload_id,))
            conn.commit()
            cursor.close()
            conn.close()
        except:
            pass
        sys.exit(1)

if __name__ == "__main__":
    main()  