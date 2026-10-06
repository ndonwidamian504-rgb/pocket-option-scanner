# Pocket Option asset catalog
# OTC assets based on Pocket Option's current official OTC list.
# The platform can change available assets and payouts over time.

OTC_CURRENCY = [
    "EUR/USD OTC",
    "AUD/CAD OTC",
    "AUD/CHF OTC",
    "AUD/JPY OTC",
    "AUD/NZD OTC",
    "AUD/USD OTC",
    "CAD/CHF OTC",
    "CAD/JPY OTC",
    "CHF/JPY OTC",
    "EUR/CHF OTC",
    "EUR/GBP OTC",
    "EUR/JPY OTC",
    "EUR/NZD OTC",
    "GBP/AUD OTC",
    "GBP/JPY OTC",
    "GBP/USD OTC",
    "NZD/JPY OTC",
    "NZD/USD OTC",
    "USD/CAD OTC",
    "USD/CHF OTC",
    "USD/JPY OTC",
]

OTC_COMMODITIES = [
    "Gold OTC",
    "Brent Oil OTC",
    "WTI Crude Oil OTC",
    "Silver OTC",
    "Natural Gas OTC",
    "Platinum spot OTC",
    "Palladium spot OTC",
]

OTC_STOCKS = [
    "Apple OTC",
    "McDonald's OTC",
    "Microsoft OTC",
    "Palantir Technologies OTC",
    "GameStop Corp OTC",
    "Advanced Micro Devices OTC",
    "Coinbase Global OTC",
    "Marathon Digital Holdings OTC",
    "Cisco OTC",
    "ExxonMobil OTC",
    "Alibaba OTC",
    "Netflix OTC",
    "VISA OTC",
    "Pfizer Inc OTC",
    "FedEx OTC",
    "Tesla OTC",
    "Boeing Company OTC",
    "American Express OTC",
    "Johnson & Johnson OTC",
    "Citigroup Inc OTC",
    "Intel OTC",
    "FACEBOOK INC OTC",
]

OTC_INDICES = [
    "AUS 200 OTC",
    "E35EUR OTC",
    "100GBP OTC",
    "F40EUR OTC",
    "JPN225 OTC",
    "D30EUR OTC",
    "E50EUR OTC",
    "SP500 OTC",
    "DJI30 OTC",
    "US100 OTC",
]

OTC_CRYPTO = [
    "BNB OTC",
    "Solana OTC",
    "Cardano OTC",
    "TRON OTC",
    "Chainlink OTC",
    "Toncoin OTC",
    "Avalanche OTC",
    "Bitcoin OTC",
    "Dogecoin OTC",
    "Polkadot OTC",
    "Ethereum OTC",
    "Litecoin OTC",
    "Polygon OTC",
    "Bitcoin ETF OTC",
]

# Combine every OTC category
ALL_OTC_MARKETS = (
    OTC_CURRENCY
    + OTC_COMMODITIES
    + OTC_STOCKS
    + OTC_INDICES
    + OTC_CRYPTO
)

print(f"OTC markets loaded: {len(ALL_OTC_MARKETS)}")

for market in ALL_OTC_MARKETS:
    print(market)
