# =============================================================================
# train_model.py (DYNAMIC SECTOR REVOLUTION)
# AI Business Analytics — On-Demand Custom Model Training Script
# =============================================================================
import sys
import os
import pickle
import warnings
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.tree import DecisionTreeClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score, mean_absolute_error, accuracy_score

warnings.filterwarnings("ignore")

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "model")
os.makedirs(MODEL_DIR, exist_ok=True)

def load_and_standardize_data(csv_path):
    df = pd.read_csv(csv_path)
    df.columns = [str(col).strip() for col in df.columns]
    
    # FIXED: Removed the duplicate initialization expression statement
    header_mapping = {
        "Product": ["product", "item", "product name", "item name", "products", "items", "name", "product_name"],
        "Price": ["price", "unit price", "unit_price", "rate", "selling price", "prise", "prices"],
        "Quantity_Sold": ["quantity_sold", "quantity", "qty", "qty sold", "quantity sold", "units sold", "units_sold", "sold", "quantity_solde"],
        "Stock": ["stock", "current stock", "inventory", "stock count", "stok", "available stock"],
        "Date": ["date", "sales date", "transaction date", "day"],
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
    return df

def prepare_df(df):
    df = df.copy()
    df["Date"]  = pd.to_datetime(df["Date"])
    df["Month"] = df["Date"].dt.month
    df["Day"]   = df["Date"].dt.day

    if "Revenue" not in df.columns:
        df["Revenue"] = df["Price"] * df["Quantity_Sold"]
    if "Cost" not in df.columns:
        df["Cost"] = df["Price"] * 0.4
    if "Category" not in df.columns:
        df["Category"] = "General"
    return df

def calculate_dynamic_thresholds(df):
    quantities = df["Quantity_Sold"]
    low_thresh = max(1, int(quantities.quantile(0.33)))
    high_thresh = max(2, int(quantities.quantile(0.66)))
    if low_thresh == high_thresh:
        high_thresh = low_thresh + 1
    return low_thresh, high_thresh

def add_demand_labels(df, low_thresh, high_thresh):
    df["Demand_Level"] = pd.cut(
        df["Quantity_Sold"],
        bins=[-1, low_thresh, high_thresh, 9999999],
        labels=["Low", "Medium", "High"]
    )
    return df

def train_custom_model(csv_path, store_identifier):
    df = load_and_standardize_data(csv_path)
    
    # FIXED: Handled optional stock tracking arrays automatically to prevent validation drops
    if "Stock" not in df.columns:
        df["Stock"] = 0
        
    # Validation check looks for the standardized keys assigned above
    for col in ["Date", "Product", "Price", "Quantity_Sold", "Stock"]:
        if col not in df.columns:
            raise ValueError(f"Missing required column: {col}")
            
    df = prepare_df(df)
    low_thresh, high_thresh = calculate_dynamic_thresholds(df)
    df = add_demand_labels(df, low_thresh, high_thresh)

    le_product  = LabelEncoder()
    le_category = LabelEncoder()
    df["Product_enc"]  = le_product.fit_transform(df["Product"].astype(str))
    df["Category_enc"] = le_category.fit_transform(df["Category"].astype(str))

    features = ["Product_enc", "Category_enc", "Price", "Cost", "Quantity_Sold", "Stock", "Day", "Month"]
    X = df[features]
    y = df["Revenue"]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    rf = RandomForestRegressor(n_estimators=100, random_state=42)
    rf.fit(X_train, y_train)

    # FIXED: previously model_performance was hardcoded (r2=0.92, mae=0.0,
    # accuracy=0.90) regardless of the actual data — every store's health
    # score, diagnostics panel, and executive summary were built on fake
    # numbers. Now computed for real from a held-out test split.
    rf_preds = rf.predict(X_test)
    rf_r2  = round(float(r2_score(y_test, rf_preds)), 4) if len(X_test) > 0 else 0.0
    rf_mae = round(float(mean_absolute_error(y_test, rf_preds)), 2) if len(X_test) > 0 else 0.0

    demand_encoder = LabelEncoder()
    df["Demand_enc"] = demand_encoder.fit_transform(df["Demand_Level"].astype(str))

    demand_features = ["Product_enc", "Price", "Stock", "Day"]
    X_cls = df[demand_features]
    y_cls = df["Demand_enc"]

    X_train_c, X_test_c, y_train_c, y_test_c = train_test_split(X_cls, y_cls, test_size=0.2, random_state=42)
    classifier = DecisionTreeClassifier(random_state=42)
    classifier.fit(X_train_c, y_train_c)

    cls_preds = classifier.predict(X_test_c)
    cls_accuracy = round(float(accuracy_score(y_test_c, cls_preds)), 4) if len(X_test_c) > 0 else 0.0

    model_bundle = {
        "random_forest": rf, 
        "classifier": classifier,
        "model_performance": {
            "random_forest": {"r2": rf_r2, "mae": rf_mae},
            "demand_classifier": {"accuracy": cls_accuracy}
        }
    }
    encoder_bundle = {
        "le_product": le_product,
        "le_category": le_category,
        "demand_encoder": demand_encoder,
        "features": features,
        "demand_features": demand_features,
        "low_thresh": low_thresh,
        "high_thresh": high_thresh
    }

    with open(os.path.join(MODEL_DIR, f"model_store_{store_identifier}.pkl"), "wb") as f:
        pickle.dump(model_bundle, f)
    with open(os.path.join(MODEL_DIR, f"encoder_store_{store_identifier}.pkl"), "wb") as f:
        pickle.dump(encoder_bundle, f)

    print(f"SUCCESS: Engine trained for account ID: {store_identifier}")

if __name__ == "__main__":
    if len(sys.argv) < 3: 
        sys.exit(1)
    train_custom_model(sys.argv[1], sys.argv[2])   