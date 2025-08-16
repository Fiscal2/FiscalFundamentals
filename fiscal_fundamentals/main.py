from datetime import datetime, timedelta
from typing import Optional
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRouter
from supabase import create_client, Client

import os

# Initialize Supabase client
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # service role for server-side access
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()

# Allow CORS for frontend (adjust as needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define router
router = APIRouter()

# Simple in-memory cache
cache = {
    "data": None,
    "timestamp": None,
    "ttl_minutes": 1440  # Cache for 24 hours
}

def is_expired(cache_entry, ttl_minutes=1440):
    """Check if a cache entry is expired"""
    if not cache_entry or not cache_entry.get("timestamp"):
        return True
    
    age = datetime.now() - cache_entry["timestamp"]
    return age >= timedelta(minutes=ttl_minutes)


ticker_cache = {}

# Ticker-specific caching (only fetch what's needed)
@router.get("/api/financials/{ticker}")
def get_financials_by_ticker(ticker: str):
    """Fetch data for specific ticker only - reduces payload size"""
    cache_key = f"ticker_{ticker}"
    
    if cache_key in ticker_cache and not is_expired(ticker_cache[cache_key]):
        return ticker_cache[cache_key]["data"]
    
    result = supabase.table("financials").select("ticker, year, quarter, income_statement, balance_sheet, cash_flow, company_name, listed_exchange").eq("ticker", ticker.upper()).execute()
    
    cache[cache_key] = {
        "data": result.data,
        "timestamp": datetime.now()
    }
    return result.data

@router.get("/api/financials")
def get_financials(force_refresh: bool = Query(False, description="Force refresh cache")):
    try:
        # Check if we have valid cached data
        if (cache["data"] is not None 
            and cache["timestamp"] is not None 
            and not force_refresh
            and datetime.now() - cache["timestamp"] < timedelta(minutes=cache["ttl_minutes"])):
            
            print(f"Serving from cache (cached {round((datetime.now() - cache['timestamp']).total_seconds() / 60, 1)} minutes ago)")
            print(f"Cache contains {len(cache['data'])} records")
            return cache["data"]
        
        print("Cache miss or expired - fetching from Supabase...")
        
        all_data = []
        page_size = 1000
        start = 0
        page_count = 0
        
        while True:
            # Fetch data with pagination
            result = supabase.table("financials").select("*").range(start, start + page_size - 1).execute()
            page_count += 1
            
            print(f"Page {page_count}: Fetched {len(result.data) if result.data else 0} records (range {start}-{start + page_size - 1})")
            
            if not result.data:
                break
                
            all_data.extend(result.data)
            
            # If we got less than page_size records, we've reached the end
            if len(result.data) < page_size:
                break
                
            start += page_size

        cache["data"] = all_data
        cache["timestamp"] = datetime.now()

        return all_data
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch financials: {str(e)}")

@router.get("/api/cache/status")
def cache_status():
    if cache["data"] is None:
        return {"status": "empty", "records": 0}
    
    age_minutes = (datetime.now() - cache["timestamp"]).total_seconds() / 60
    is_expired = age_minutes > cache["ttl_minutes"]
    
    return {
        "status": "expired" if is_expired else "valid",
        "records": len(cache["data"]),
        "age_minutes": round(age_minutes, 1),
        "ttl_minutes": cache["ttl_minutes"]
    }
    
# Endpoint to check cache status
@router.post("/api/cache/clear")
def clear_cache():
    cache["data"] = None
    cache["timestamp"] = None
    return {"message": "Cache cleared"}

# Include router
app.include_router(router)