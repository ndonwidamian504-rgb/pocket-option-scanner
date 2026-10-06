"""
Pocket Option Market Scanner
----------------------------
Analysis-only trading scanner.

This scanner:
- Loads markets from assets.py when available
- Calculates EMA 9, EMA 21, EMA 50 and EMA 200
- Calculates RSI
- Calculates Bollinger Bands
- Calculates MACD
- Produces BUY / SELL / WAIT signals
- Does NOT place trades
- Does NOT require your Pocket Option password or trading credentials

Market candle data can be supplied later by the market-data connector.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional


# ============================================================
# SETTINGS
# ============================================================

TIMEFRAME = "1m"
MIN_CANDLES = 200
SCAN_INTERVAL_SECONDS = 60

RSI_PERIOD = 14
EMA_FAST = 9
EMA_MID = 21
EMA_SLOW = 50
EMA_TREND = 200

BB_PERIOD = 20
BB_STD = 2.0

BUY_SCORE = 6
SELL_SCORE = 6


# ============================================================
# MARKET LIST
# ============================================================

def load_markets() -> List[str]:
    """
    Loads the market list from assets.py.

    The function accepts several common variable names so the
    scanner remains compatible with different assets.py formats.
    """

    try:
        import assets
    except ImportError:
        return []

    possible_names = [
        "ASSETS",
        "MARKETS",
        "SYMBOLS",
        "ASSET_LIST",
        "MARKET_LIST",
    ]

    for name in possible_names:
        value = getattr(assets, name, None)

        if isinstance(value, (list, tuple, set)):
            return [str(x) for x in value if str(x).strip()]

        if isinstance(value, dict):
            return [str(x) for x in value.keys() if str(x).strip()]

    return []


MARKETS = load_markets()


# ============================================================
# DATA STRUCTURE
# ============================================================

@dataclass
class Candle:
    timestamp: float
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


# ============================================================
# BASIC MATH FUNCTIONS
# ============================================================

def mean(values: List[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def standard_deviation(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0

    avg = mean(values)
    variance = sum((x - avg) ** 2 for x in values) / len(values)

    return math.sqrt(variance)


# ============================================================
# EMA
# ============================================================

def ema(values: List[float], period: int) -> List[float]:
    if len(values) < period:
        return []

    multiplier = 2 / (period + 1)

    result = [mean(values[:period])]

    for price in values[period:]:
        previous = result[-1]
        current = (price - previous) * multiplier + previous
        result.append(current)

    padding = [float("nan")] * (period - 1)

    return padding + result


# ============================================================
# RSI
# ============================================================

def rsi(values: List[float], period: int = 14) -> List[float]:
    if len(values) <= period:
        return []

    gains = []
    losses = []

    for i in range(1, len(values)):
        change = values[i] - values[i - 1]

        gains.append(max(change, 0))
        losses.append(max(-change, 0))

    avg_gain = mean(gains[:period])
    avg_loss = mean(losses[:period])

    result = [float("nan")] * period

    if avg_loss == 0:
        result.append(100.0)
    else:
        rs = avg_gain / avg_loss
        result.append(100 - (100 / (1 + rs)))

    for i in range(period, len(gains)):
        avg_gain = ((avg_gain * (period - 1)) + gains[i]) / period
        avg_loss = ((avg_loss * (period - 1)) + losses[i]) / period

        if avg_loss == 0:
            result.append(100.0)
        else:
            rs = avg_gain / avg_loss
            result.append(100 - (100 / (1 + rs)))

    return result[:len(values)]


# ============================================================
# MACD
# ============================================================

def macd(values: List[float]):
    fast = ema(values, 12)
    slow = ema(values, 26)

    if not fast or not slow:
        return [], [], []

    line = []

    for i in range(len(values)):
        if math.isnan(fast[i]) or math.isnan(slow[i]):
            line.append(float("nan"))
        else:
            line.append(fast[i] - slow[i])

    valid = [x for x in line if not math.isnan(x)]

    signal_valid = ema(valid, 9)

    signal = [float("nan")] * (len(line) - len(signal_valid))

    signal.extend(signal_valid)

    histogram = []

    for i in range(len(line)):
        if math.isnan(line[i]) or math.isnan(signal[i]):
            histogram.append(float("nan"))
        else:
            histogram.append(line[i] - signal[i])

    return line, signal, histogram


# ============================================================
# BOLLINGER BANDS
# ============================================================

def bollinger_bands(values: List[float], period: int = 20, std_mult: float = 2.0):
    middle = []
    upper = []
    lower = []

    for i in range(len(values)):
        if i + 1 < period:
            middle.append(float("nan"))
            upper.append(float("nan"))
            lower.append(float("nan"))
            continue

        window = values[i + 1 - period:i + 1]

        avg = mean(window)
        deviation = standard_deviation(window)

        middle.append(avg)
        upper.append(avg + std_mult * deviation)
        lower.append(avg - std_mult * deviation)

    return middle, upper, lower


# ============================================================
# ATR
# ============================================================

def atr(candles: List[Candle], period: int = 14) -> List[float]:
    if len(candles) < period + 1:
        return []

    true_ranges = []

    for i in range(1, len(candles)):
        current = candles[i]
        previous = candles[i - 1]

        tr = max(
            current.high - current.low,
            abs(current.high - previous.close),
            abs(current.low - previous.close),
        )

        true_ranges.append(tr)

    result = [float("nan")] * period

    first = mean(true_ranges[:period])
    result.append(first)

    previous_atr = first

    for tr in true_ranges[period:]:
        current_atr = (
            (previous_atr * (period - 1)) + tr
        ) / period

        result.append(current_atr)
        previous_atr = current_atr

    return result[:len(candles)]


# ============================================================
# SIGNAL ENGINE
# ============================================================

def analyze(candles: List[Candle]) -> Dict[str, Any]:

    if len(candles) < MIN_CANDLES:
        return {
            "signal": "WAIT",
            "confidence": 0,
            "reason": f"Need at least {MIN_CANDLES} candles.",
        }

    closes = [c.close for c in candles]

    ema9 = ema(closes, EMA_FAST)
    ema21 = ema(closes, EMA_MID)
    ema50 = ema(closes, EMA_SLOW)
    ema200 = ema(closes, EMA_TREND)

    rsi_values = rsi(closes, RSI_PERIOD)

    macd_line, macd_signal, macd_hist = macd(closes)

    bb_middle, bb_upper, bb_lower = bollinger_bands(
        closes,
        BB_PERIOD,
        BB_STD,
    )

    atr_values = atr(candles)

    i = len(candles) - 1

    price = closes[i]

    values = {
        "ema9": ema9[i],
        "ema21": ema21[i],
        "ema50": ema50[i],
        "ema200": ema200[i],
        "rsi": rsi_values[i],
        "macd": macd_line[i],
        "macd_signal": macd_signal[i],
        "macd_hist": macd_hist[i],
        "bb_middle": bb_middle[i],
        "bb_upper": bb_upper[i],
        "bb_lower": bb_lower[i],
        "atr": atr_values[i] if atr_values else float("nan"),
    }

    buy_score = 0
    sell_score = 0

    reasons = []

    # --------------------------------------------------------
    # EMA TREND
    # --------------------------------------------------------

    if (
        price > values["ema200"]
        and values["ema50"] > values["ema200"]
    ):
        buy_score += 2
        reasons.append("Bullish EMA trend")

    elif (
        price < values["ema200"]
        and values["ema50"] < values["ema200"]
    ):
        sell_score += 2
        reasons.append("Bearish EMA trend")

    # --------------------------------------------------------
    # EMA CROSS / MOMENTUM
    # --------------------------------------------------------

    if values["ema9"] > values["ema21"]:
        buy_score += 1
        reasons.append("EMA 9 above EMA 21")

    elif values["ema9"] < values["ema21"]:
        sell_score += 1
        reasons.append("EMA 9 below EMA 21")

    # --------------------------------------------------------
    # RSI
    # --------------------------------------------------------

    if 50 < values["rsi"] < 70:
        buy_score += 1
        reasons.append("RSI supports bullish momentum")

    elif 30 < values["rsi"] < 50:
        sell_score += 1
        reasons.append("RSI supports bearish momentum")

    elif values["rsi"] >= 70:
        sell_score += 1
        reasons.append("RSI is overbought")

    elif values["rsi"] <= 30:
        buy_score += 1
        reasons.append("RSI is oversold")

    # --------------------------------------------------------
    # MACD
    # --------------------------------------------------------

    if values["macd_hist"] > 0:
        buy_score += 1
        reasons.append("MACD bullish")

    elif values["macd_hist"] < 0:
        sell_score += 1
        reasons.append("MACD bearish")

    # --------------------------------------------------------
    # BOLLINGER BANDS
    # --------------------------------------------------------

    if price > values["bb_middle"]:
        buy_score += 1
        reasons.append("Price above Bollinger middle band")

    elif price < values["bb_middle"]:
        sell_score += 1
        reasons.append("Price below Bollinger middle band")

    # --------------------------------------------------------
    # FINAL SIGNAL
    # --------------------------------------------------------

    if buy_score >= BUY_SCORE and buy_score > sell_score:
        signal = "BUY"

    elif sell_score >= SELL_SCORE and sell_score > buy_score:
        signal = "SELL"

    else:
        signal = "WAIT"

    total = max(buy_score, sell_score)

    confidence = min(
        95,
        int((total / 7) * 100),
    )

    return {
        "signal": signal,
        "confidence": confidence,
        "price": price,
        "buy_score": buy_score,
        "sell_score": sell_score,
        "rsi": round(values["rsi"], 2),
        "ema9": round(values["ema9"], 5),
        "ema21": round(values["ema21"], 5),
        "ema50": round(values["ema50"], 5),
        "ema200": round(values["ema200"], 5),
        "macd_hist": round(values["macd_hist"], 5),
        "bb_middle": round(values["bb_middle"], 5),
        "bb_upper": round(values["bb_upper"], 5),
        "bb_lower": round(values["bb_lower"], 5),
        "reasons": reasons,
    }


# ============================================================
# CANDLE CONVERTER
# ============================================================

def convert_candles(raw: Iterable[Any]) -> List[Candle]:
    """
    Accepts candles in several common formats.

    Supported dictionary format:

    {
        "timestamp": 1234567890,
        "open": 100,
        "high": 101,
        "low": 99,
        "close": 100.5,
        "volume": 10
    }

    Also supports lists:

    [timestamp, open, high, low, close, volume]
    """

    result = []

    for item in raw:

        if isinstance(item, dict):

            timestamp = item.get(
                "timestamp",
                item.get("time", item.get("t", time.time())),
            )

            open_price = item.get("open", item.get("o"))
            high_price = item.get("high", item.get("h"))
            low_price = item.get("low", item.get("l"))
            close_price = item.get("close", item.get("c"))

            volume = item.get(
                "volume",
                item.get("v", 0),
            )

        elif isinstance(item, (list, tuple)) and len(item) >= 5:

            timestamp = item[0]
            open_price = item[1]
            high_price = item[2]
            low_price = item[3]
            close_price = item[4]

            volume = item[5] if len(item) > 5 else 0

        else:
            continue

        try:
            result.append(
                Candle(
                    timestamp=float(timestamp),
                    open=float(open_price),
                    high=float(high_price),
                    low=float(low_price),
                    close=float(close_price),
                    volume=float(volume),
                )
            )
        except (TypeError, ValueError):
            continue

    return result


# ============================================================
# DISPLAY
# ============================================================

def print_signal(market: str, result: Dict[str, Any]) -> None:

    print()
    print("=" * 65)
    print(f"MARKET: {market}")
    print(f"TIMEFRAME: {TIMEFRAME}")
    print("-" * 65)

    print(f"SIGNAL:     {result.get('signal', 'WAIT')}")
    print(f"CONFIDENCE: {result.get('confidence', 0)}%")

    if "price" in result:
        print(f"PRICE:      {result['price']}")

    print(
        f"BUY SCORE:  {result.get('buy_score', 0)}   "
        f"SELL SCORE: {result.get('sell_score', 0)}"
    )

    if "rsi" in result:
        print(f"RSI:        {result['rsi']}")

    if "ema9" in result:
        print(f"EMA 9:      {result['ema9']}")

    if "ema21" in result:
        print(f"EMA 21:     {result['ema21']}")

    if "ema50" in result:
        print(f"EMA 50:     {result['ema50']}")

    if "ema200" in result:
        print(f"EMA 200:    {result['ema200']}")

    if result.get("reasons"):
        print()
        print("REASONS:")

        for reason in result["reasons"]:
            print(f"  • {reason}")

    print("=" * 65)


# ============================================================
# SCAN ONE MARKET
# ============================================================

def scan_market(
    market: str,
    candle_data: Optional[Iterable[Any]] = None,
) -> Dict[str, Any]:

    if candle_data is None:
        return {
            "signal": "WAIT",
            "confidence": 0,
            "market": market,
            "reason": (
                "No candle data connected yet. "
                "Connect the market-data source before scanning."
            ),
        }

    candles = convert_candles(candle_data)

    result = analyze(candles)
    result["market"] = market

    return result


# ============================================================
# SCAN ALL MARKETS
# ============================================================

def scan_all(
    market_data: Optional[Dict[str, Iterable[Any]]] = None,
) -> List[Dict[str, Any]]:

    results = []

    if not MARKETS:
        print("No markets found in assets.py.")
        return results

    if market_data is None:
        market_data = {}

    for market in MARKETS:

        data = market_data.get(market)

        result = scan_market(
            market,
            data,
        )

        results.append(result)

        print_signal(
            market,
            result,
        )

    return results


# ============================================================
# MAIN
# ============================================================

def main() -> None:

    print()
    print("=" * 65)
    print("POCKET OPTION MARKET SCANNER")
    print("ANALYSIS ONLY — NO AUTOMATIC TRADING")
    print("=" * 65)

    if MARKETS:
        print()
        print(f"Markets loaded: {len(MARKETS)}")

        for market in MARKETS:
            print(f"  • {market}")

    else:
        print()
        print("WARNING: No markets were found in assets.py.")

    print()
    print("Scanner loaded successfully.")
    print()
    print(
        "The next component required is the market-data connector."
    )
    print(
        "Until live candle data is connected, signals will remain WAIT."
    )
    print()


if __name__ == "__main__":
    main()
