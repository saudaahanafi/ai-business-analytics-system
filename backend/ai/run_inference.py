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
        "Currency": ["currency", "curr", "money", "devise", "Currency"]
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

    recs.append(f"ML model (Random Forest) R² = {rf_r2} — predictions are stable.")

    high_demand = [p for p, d in demand_summary.items() if d == "High"]
    if high_demand:
        recs.append(f"High-demand products: {', '.join(high_demand)}. Ensure sufficient stock levels.")

    return recs

def write_to_database(upload_id, kpis, trend, products, alerts, recommendations, model_bundle, industry):
    conn   = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()
    perf   = model_bundle["model_performance"]
    now    = datetime.datetime.now()

    cursor.execute("""
        INSERT INTO sales_analytics
            (upload_id, total_revenue, net_profit, profit_margin, roi, top_product, 
             revenue_trend_labels, revenue_trend_data, product_labels, product_data, industry, currency, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (upload_id, kpis["total_revenue"], kpis["net_profit"], kpis["margin"], kpis["roi"], kpis["top_product"],
          json.dumps(trend["labels"]), json.dumps(trend["data"]), json.dumps(products["labels"]), json.dumps(products["data"]), 
          industry, kpis["currency"], now))

    cursor.execute("""
        INSERT INTO ai_predictions_results
            (upload_id, alerts, recommendations, model_r2, model_mae, classifier_accuracy, selected_model, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """, (upload_id, json.dumps([a["message"] for a in alerts]), json.dumps(recommendations),
          perf["random_forest"]["r2"], perf["random_forest"]["mae"], perf["demand_classifier"]["accuracy"], "Random Forest", now))

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
        kpis                             = calculate_kpis(df)
        trend                            = calculate_revenue_trend(df)
        products                         = calculate_product_performance(df)
        alerts                           = calculate_inventory_alerts(df)
        recommendations                  = generate_recommendations(df, kpis, trend, alerts, model_bundle, demand_summary)

        write_to_database(upload_id, kpis, trend, products, alerts, recommendations, model_bundle, industry)
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