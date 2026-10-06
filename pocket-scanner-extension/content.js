/*
 Pocket Option Scanner
 Live page-data listener
 Analysis only - NO automatic trading

 This script:
 - Hooks page WebSockets
 - Watches Socket.IO/WebSocket messages
 - Attempts to extract prices/candles
 - Builds 1-minute candles from price ticks
 - Calculates EMA, RSI, Bollinger Bands, MACD and ATR
 - Displays BUY / SELL / WAIT
 - Never clicks CALL/PUT
 - Never places trades
*/

(() => {
    "use strict";

    const STATE = {
        symbol: "Detecting market...",
        candles: [],
        currentCandle: null,
        lastPrice: null,
        lastMessage: null,
        connected: false,
        messages: 0,
        signal: "WAIT",
        confidence: 0,
        reason: "Waiting for live market data"
    };

    const MAX_CANDLES = 300;
    const CANDLE_SECONDS = 60;

    // ------------------------------------------------------------
    // Utility
    // ------------------------------------------------------------

    function number(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function nowSeconds() {
        return Math.floor(Date.now() / 1000);
    }

    function candleStart(timestamp) {
        return Math.floor(timestamp / CANDLE_SECONDS) * CANDLE_SECONDS;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // ------------------------------------------------------------
    // Indicator functions
    // ------------------------------------------------------------

    function ema(values, period) {
        if (values.length < period) return null;

        const multiplier = 2 / (period + 1);

        let result = 0;

        for (let i = 0; i < period; i++) {
            result += values[i];
        }

        result /= period;

        for (let i = period; i < values.length; i++) {
            result =
                (values[i] - result) * multiplier +
                result;
        }

        return result;
    }

    function rsi(values, period = 14) {
        if (values.length < period + 1) return null;

        let gains = 0;
        let losses = 0;

        for (let i = values.length - period; i < values.length; i++) {
            const change = values[i] - values[i - 1];

            if (change > 0) {
                gains += change;
            } else {
                losses += Math.abs(change);
            }
        }

        if (losses === 0) return 100;

        const rs = gains / losses;

        return 100 - (100 / (1 + rs));
    }

    function bollinger(values, period = 20, multiplier = 2) {
        if (values.length < period) return null;

        const recent = values.slice(-period);

        const mean =
            recent.reduce((a, b) => a + b, 0) /
            recent.length;

        const variance =
            recent.reduce(
                (sum, value) =>
                    sum + Math.pow(value - mean, 2),
                0
            ) / recent.length;

        const deviation = Math.sqrt(variance);

        return {
            middle: mean,
            upper: mean + multiplier * deviation,
            lower: mean - multiplier * deviation
        };
    }

    function macd(values) {
        if (values.length < 35) return null;

        const fast = ema(values, 12);
        const slow = ema(values, 26);

        if (fast === null || slow === null) {
            return null;
        }

        return fast - slow;
    }

    function atr(candles, period = 14) {
        if (candles.length < period + 1) {
            return null;
        }

        const ranges = [];

        for (
            let i = candles.length - period;
            i < candles.length;
            i++
        ) {
            const current = candles[i];
            const previous = candles[i - 1];

            const trueRange = Math.max(
                current.high - current.low,
                Math.abs(current.high - previous.close),
                Math.abs(current.low - previous.close)
            );

            ranges.push(trueRange);
        }

        return (
            ranges.reduce((a, b) => a + b, 0) /
            ranges.length
        );
    }

    // ------------------------------------------------------------
    // Analysis
    // ------------------------------------------------------------

    function analyze() {
        const candles = STATE.candles;

        if (candles.length < 50) {
            STATE.signal = "WAIT";
            STATE.confidence = 0;
            STATE.reason =
                `Collecting candles (${candles.length}/50)`;
            updatePanel();
            return;
        }

        const closes = candles.map(c => c.close);

        const price = closes[closes.length - 1];

        const ema9 = ema(closes, 9);
        const ema21 = ema(closes, 21);
        const ema50 = ema(closes, 50);

        const rsiValue = rsi(closes, 14);

        const bands =
            bollinger(closes, 20, 2);

        const macdValue =
            macd(closes);

        const atrValue =
            atr(candles, 14);

        if (
            ema9 === null ||
            ema21 === null ||
            ema50 === null ||
            rsiValue === null ||
            bands === null
        ) {
            STATE.signal = "WAIT";
            STATE.confidence = 0;
            STATE.reason = "Indicators are still loading";
            updatePanel();
            return;
        }

        let buyScore = 0;
        let sellScore = 0;

        const reasons = [];

        // EMA trend
        if (
            ema9 > ema21 &&
            ema21 > ema50
        ) {
            buyScore += 2;
            reasons.push("bullish EMA trend");
        }

        if (
            ema9 < ema21 &&
            ema21 < ema50
        ) {
            sellScore += 2;
            reasons.push("bearish EMA trend");
        }

        // Price vs EMA
        if (price > ema21) {
            buyScore += 1;
        }

        if (price < ema21) {
            sellScore += 1;
        }

        // RSI
        if (rsiValue > 50 && rsiValue < 70) {
            buyScore += 2;
            reasons.push("RSI bullish");
        }

        if (rsiValue < 50 && rsiValue > 30) {
            sellScore += 2;
            reasons.push("RSI bearish");
        }

        // Bollinger
        if (price > bands.middle) {
            buyScore += 1;
        }

        if (price < bands.middle) {
            sellScore += 1;
        }

        // MACD
        if (macdValue !== null) {
            if (macdValue > 0) {
                buyScore += 1;
            }

            if (macdValue < 0) {
                sellScore += 1;
            }
        }

        const maximumScore = 7;

        if (
            buyScore >= 5 &&
            buyScore > sellScore
        ) {
            STATE.signal = "BUY";
            STATE.confidence =
                clamp(
                    Math.round(
                        (buyScore / maximumScore) * 100
                    ),
                    0,
                    99
                );
        } else if (
            sellScore >= 5 &&
            sellScore > buyScore
        ) {
            STATE.signal = "SELL";
            STATE.confidence =
                clamp(
                    Math.round(
                        (sellScore / maximumScore) * 100
                    ),
                    0,
                    99
                );
        } else {
            STATE.signal = "WAIT";
            STATE.confidence =
                Math.round(
                    Math.max(
                        buyScore,
                        sellScore
                    ) / maximumScore * 100
                );
        }

        STATE.reason =
            reasons.length
                ? reasons.join(" • ")
                : "No strong alignment";

        updatePanel();
    }

    // ------------------------------------------------------------
    // Candle builder
    // ------------------------------------------------------------

    function addPrice(price, timestamp = nowSeconds()) {
        price = number(price);

        if (price === null || price <= 0) {
            return;
        }

        STATE.lastPrice = price;

        const start =
            candleStart(timestamp);

        if (
            !STATE.currentCandle ||
            STATE.currentCandle.time !== start
        ) {
            if (STATE.currentCandle) {
                STATE.candles.push(
                    STATE.currentCandle
                );

                if (
                    STATE.candles.length >
                    MAX_CANDLES
                ) {
                    STATE.candles.shift();
                }
            }

            STATE.currentCandle = {
                time: start,
                open: price,
                high: price,
                low: price,
                close: price
            };
        } else {
            STATE.currentCandle.high =
                Math.max(
                    STATE.currentCandle.high,
                    price
                );

            STATE.currentCandle.low =
                Math.min(
                    STATE.currentCandle.low,
                    price
                );

            STATE.currentCandle.close =
                price;
        }

        STATE.connected = true;

        analyze();
    }

    // ------------------------------------------------------------
    // Generic data extraction
    // ------------------------------------------------------------

    function inspectObject(obj) {
        if (!obj) return;

        // Common symbol fields
        const symbol =
            obj.symbol ||
            obj.asset ||
            obj.active ||
            obj.pair ||
            obj.instrument ||
            obj.ticker;

        if (
            typeof symbol === "string" &&
            symbol.length < 40
        ) {
            STATE.symbol = symbol;
        }

        // Direct price fields
        const priceFields = [
            "price",
            "close",
            "value",
            "rate",
            "quote",
            "ask",
            "bid"
        ];

        for (const field of priceFields) {
            if (obj[field] !== undefined) {
                const p = number(obj[field]);

                if (p !== null && p > 0) {
                    const timestamp =
                        number(
                            obj.timestamp ||
                            obj.time ||
                            obj.ts
                        ) || nowSeconds();

                    addPrice(
                        p,
                        timestamp > 10000000000
                            ? Math.floor(timestamp / 1000)
                            : timestamp
                    );

                    return;
                }
            }
        }

        // OHLC object
        if (
            obj.open !== undefined &&
            obj.high !== undefined &&
            obj.low !== undefined &&
            obj.close !== undefined
        ) {
            const o = number(obj.open);
            const h = number(obj.high);
            const l = number(obj.low);
            const c = number(obj.close);

            if (
                o !== null &&
                h !== null &&
                l !== null &&
                c !== null
            ) {
                const timestamp =
                    number(
                        obj.timestamp ||
                        obj.time ||
                        obj.ts
                    ) || nowSeconds();

                const t =
                    timestamp > 10000000000
                        ? Math.floor(timestamp / 1000)
                        : timestamp;

                const existing =
                    STATE.candles.find(
                        x => x.time === candleStart(t)
                    );

                if (!existing) {
                    STATE.candles.push({
                        time: candleStart(t),
                        open: o,
                        high: h,
                        low: l,
                        close: c
                    });

                    STATE.candles =
                        STATE.candles
                            .slice(-MAX_CANDLES);

                    STATE.lastPrice = c;
                    STATE.connected = true;

                    analyze();
                }
            }

            return;
        }

        // Recursively inspect nested objects
        for (const key of Object.keys(obj)) {
            const value = obj[key];

            if (
                value &&
                typeof value === "object"
            ) {
                inspectObject(value);
            }
        }
    }

    function inspectArray(arr) {
        if (!Array.isArray(arr)) return;

        // Try nested structures first
        for (const item of arr) {
            if (
                item &&
                typeof item === "object"
            ) {
                inspectObject(item);
            }
        }

        // Common OHLC array formats:
        // [timestamp, open, high, low, close]
        // [timestamp, open, close, high, low]
        if (arr.length >= 5) {
            for (let i = 0; i <= arr.length - 5; i++) {
                const t = number(arr[i]);
                const a = number(arr[i + 1]);
                const b = number(arr[i + 2]);
                const c = number(arr[i + 3]);
                const d = number(arr[i + 4]);

                if (
                    t !== null &&
                    a !== null &&
                    b !== null &&
                    c !== null &&
                    d !== null &&
                    t > 1000000000
                ) {
                    const timestamp =
                        t > 10000000000
                            ? Math.floor(t / 1000)
                            : t;

                    const values = [a, b, c, d];

                    const high =
                        Math.max(...values);

                    const low =
                        Math.min(...values);

                    const close = d;

                    STATE.candles.push({
                        time:
                            candleStart(timestamp),
                        open: a,
                        high,
                        low,
                        close
                    });

                    STATE.candles =
                        STATE.candles
                            .slice(-MAX_CANDLES);

                    STATE.lastPrice = close;
                    STATE.connected = true;
                }
            }

            analyze();
        }
    }

    function inspectMessage(data) {
        STATE.messages++;

        if (typeof data !== "string") {
            return;
        }

        STATE.lastMessage =
            data.slice(0, 500);

        let text = data.trim();

        // Socket.IO often prefixes JSON
        // with a numeric frame identifier.
        text = text.replace(
            /^[0-9]+-/,
            ""
        );

        // Remove Socket.IO packet prefix
        if (
            text.startsWith("42")
        ) {
            text = text.slice(2);
        }

        try {
            const parsed =
                JSON.parse(text);

            if (Array.isArray(parsed)) {
                inspectArray(parsed);

                if (
                    parsed.length > 1
                ) {
                    inspectObject(
                        parsed[1]
                    );
                }
            } else {
                inspectObject(parsed);
            }

            return;
        } catch (_) {
            // Not plain JSON.
        }

        // Look for numeric price-like values
        // inside raw messages as a fallback.
        const matches =
            text.match(
                /(?:price|close|value|rate)["']?\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)/gi
            );

        if (matches) {
            for (const match of matches) {
                const numberMatch =
                    match.match(
                        /([0-9]+(?:\.[0-9]+)?)$/
                    );

                if (numberMatch) {
                    addPrice(
                        Number(numberMatch[1])
                    );
                }
            }
        }
    }

    // ------------------------------------------------------------
    // WebSocket interception
    // ------------------------------------------------------------

    const OriginalWebSocket =
        window.WebSocket;

    if (
        OriginalWebSocket &&
        !window.__PO_SCANNER_WS_HOOKED__
    ) {
        window.__PO_SCANNER_WS_HOOKED__ = true;

        const PatchedWebSocket =
            function(...args) {

                const socket =
                    new OriginalWebSocket(...args);

                socket.addEventListener(
                    "open",
                    () => {
                        STATE.connected = true;
                        updatePanel();
                    }
                );

                socket.addEventListener(
                    "message",
                    event => {
                        inspectMessage(
                            event.data
                        );
                    }
                );

                socket.addEventListener(
                    "close",
                    () => {
                        updatePanel();
                    }
                );

                return socket;
            };

        PatchedWebSocket.prototype =
            OriginalWebSocket.prototype;

        Object.defineProperty(
            PatchedWebSocket,
            "CONNECTING",
            { value: 0 }
        );

        Object.defineProperty(
            PatchedWebSocket,
            "OPEN",
            { value: 1 }
        );

        Object.defineProperty(
            PatchedWebSocket,
            "CLOSING",
            { value: 2 }
        );

        Object.defineProperty(
            PatchedWebSocket,
            "CLOSED",
            { value: 3 }
        );

        window.WebSocket =
            PatchedWebSocket;
    }

    // ------------------------------------------------------------
    // Overlay
    // ------------------------------------------------------------

    function createPanel() {
        if (
            document.getElementById(
                "po-scanner-panel"
            )
        ) {
            return;
        }

        const panel =
            document.createElement("div");

        panel.id =
            "po-scanner-panel";

        panel.innerHTML = `
            <div class="po-scanner-header">
                <strong>PO MARKET SCANNER</strong>
                <button id="po-minimize">−</button>
            </div>

            <div class="po-scanner-body">

                <div class="po-row">
                    <span>Market</span>
                    <b id="po-market">
                        Detecting...
                    </b>
                </div>

                <div class="po-row">
                    <span>Timeframe</span>
                    <b>1 MIN</b>
                </div>

                <div id="po-signal">
                    WAIT
                </div>

                <div class="po-confidence">
                    Confidence:
                    <b id="po-confidence">
                        0%
                    </b>
                </div>

                <div class="po-row">
                    <span>Price</span>
                    <b id="po-price">—</b>
                </div>

                <div class="po-row">
                    <span>RSI</span>
                    <b id="po-rsi">—</b>
                </div>

                <div class="po-row">
                    <span>EMA 9</span>
                    <b id="po-ema9">—</b>
                </div>

                <div class="po-row">
                    <span>EMA 21</span>
                    <b id="po-ema21">—</b>
                </div>

                <div class="po-row">
                    <span>EMA 50</span>
                    <b id="po-ema50">—</b>
                </div>

                <div id="po-status">
                    Waiting for live market data
                </div>

                <div id="po-reason">
                    Waiting for candles...
                </div>

                <div class="po-disclaimer">
                    Analysis only • No automatic trading
                </div>

            </div>
        `;

        document.documentElement.appendChild(
            panel
        );

        const minimize =
            document.getElementById(
                "po-minimize"
            );

        const body =
            panel.querySelector(
                ".po-scanner-body"
            );

        minimize.onclick = () => {
            const hidden =
                body.style.display === "none";

            body.style.display =
                hidden ? "block" : "none";

            minimize.textContent =
                hidden ? "−" : "+";
        };
    }

    function updatePanel() {
        const panel =
            document.getElementById(
                "po-scanner-panel"
            );

        if (!panel) return;

        const market =
            document.getElementById(
                "po-market"
            );

        const signal =
            document.getElementById(
                "po-signal"
            );

        const confidence =
            document.getElementById(
                "po-confidence"
            );

        const price =
            document.getElementById(
                "po-price"
            );

        const status =
            document.getElementById(
                "po-status"
            );

        const reason =
            document.getElementById(
                "po-reason"
            );

        if (market) {
            market.textContent =
                STATE.symbol;
        }

        if (signal) {
            signal.textContent =
                STATE.signal;
        }

        if (confidence) {
            confidence.textContent =
                `${STATE.confidence}%`;
        }

        if (price) {
            price.textContent =
                STATE.lastPrice !== null
                    ? String(
                        STATE.lastPrice
                    )
                    : "—";
        }

        if (status) {
            status.textContent =
                STATE.connected
                    ? `Live data received • ${STATE.messages} messages`
                    : "Waiting for live market data";
        }

        if (reason) {
            reason.textContent =
                STATE.reason;
        }
    }

    // ------------------------------------------------------------
    // Startup
    // ------------------------------------------------------------

    function start() {
        createPanel();
        updatePanel();

        setInterval(
            updatePanel,
            1000
        );
    }

    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            start,
            { once: true }
        );
    } else {
        start();
    }

})();
