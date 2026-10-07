/*
  Pocket Option Scanner
  Live market-stream listener
  Analysis only — no automatic trading
*/

(() => {
  "use strict";

  console.log("[Pocket Scanner] Live-stream listener loaded");

  const STATE = {
    symbol: "Unknown",
    prices: [],
    candles: [],
    lastPrice: null,
    lastUpdate: 0
  };

  // --------------------------------------------------
  // Floating scanner panel
  // --------------------------------------------------

  function createPanel() {
    if (document.getElementById("po-scanner-panel")) return;

    const panel = document.createElement("div");

    panel.id = "po-scanner-panel";

    panel.innerHTML = `
      <div id="po-scanner-title">POCKET OPTION SCANNER</div>
      <div id="po-scanner-status">Waiting for live market data</div>
      <div id="po-scanner-symbol">Market: --</div>
      <div id="po-scanner-price">Price: --</div>
      <div id="po-scanner-signal">Signal: WAIT</div>
      <div id="po-scanner-confidence">Confidence: --</div>
      <div id="po-scanner-info">Analysis only</div>
    `;

    Object.assign(panel.style, {
      position: "fixed",
      top: "90px",
      right: "20px",
      width: "245px",
      padding: "14px",
      background: "rgba(15,15,20,0.96)",
      color: "#ffffff",
      border: "1px solid #555",
      borderRadius: "10px",
      zIndex: "2147483647",
      fontFamily: "Arial, sans-serif",
      fontSize: "13px",
      boxShadow: "0 4px 20px rgba(0,0,0,.5)"
    });

    document.documentElement.appendChild(panel);
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function showConnected() {
    setText("po-scanner-status", "LIVE MARKET DATA CONNECTED");
  }

  // --------------------------------------------------
  // Number extraction
  // --------------------------------------------------

  function number(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }

    return null;
  }

  // --------------------------------------------------
  // Find price recursively
  // --------------------------------------------------

  function findPrice(obj) {
    if (obj === null || obj === undefined) return null;

    if (typeof obj === "number") {
      if (obj > 0) return obj;
      return null;
    }

    if (typeof obj === "string") {
      const n = number(obj);
      if (n !== null && n > 0) return n;
      return null;
    }

    if (Array.isArray(obj)) {
      // Common tick formats:
      // [timestamp, price]
      // [asset, timestamp, price]
      // [timestamp, open, high, low, close]

      for (let i = obj.length - 1; i >= 0; i--) {
        const n = number(obj[i]);

        if (n !== null && n > 0) {
          // Avoid timestamps when possible.
          if (n < 10000000000) {
            return n;
          }
        }
      }

      return null;
    }

    if (typeof obj === "object") {
      const keys = [
        "price",
        "quote",
        "rate",
        "value",
        "close",
        "last",
        "ask",
        "bid"
      ];

      for (const key of keys) {
        if (obj[key] !== undefined) {
          const n = number(obj[key]);

          if (n !== null && n > 0) {
            return n;
          }
        }
      }

      for (const key of Object.keys(obj)) {
        const result = findPrice(obj[key]);

        if (result !== null) {
          return result;
        }
      }
    }

    return null;
  }

  // --------------------------------------------------
  // Find symbol
  // --------------------------------------------------

  function findSymbol(obj) {
    if (!obj) return null;

    if (typeof obj === "string") {
      if (
        obj.length >= 3 &&
        obj.length <= 30 &&
        !obj.includes("http") &&
        !obj.includes("update")
      ) {
        return obj;
      }

      return null;
    }

    if (Array.isArray(obj)) {
      for (const item of obj) {
        const result = findSymbol(item);
        if (result) return result;
      }

      return null;
    }

    if (typeof obj === "object") {
      const keys = [
        "asset",
        "symbol",
        "instrument",
        "active",
        "market"
      ];

      for (const key of keys) {
        if (typeof obj[key] === "string") {
          return obj[key];
        }
      }

      return null;
    }

    return null;
  }

  // --------------------------------------------------
  // Candle construction
  // --------------------------------------------------

  function addPrice(price, timestamp = Date.now()) {
    if (!price || !Number.isFinite(price)) return;

    STATE.lastPrice = price;
    STATE.lastUpdate = Date.now();

    STATE.prices.push({
      time: timestamp,
      price: price
    });

    // Keep recent tick history
    if (STATE.prices.length > 5000) {
      STATE.prices.shift();
    }

    buildCandles();

    setText("po-scanner-price", "Price: " + price);
    showConnected();

    analyze();
  }

  function buildCandles() {
    const map = new Map();

    for (const tick of STATE.prices) {
      const minute =
        Math.floor(tick.time / 60000) * 60000;

      if (!map.has(minute)) {
        map.set(minute, {
          time: minute,
          open: tick.price,
          high: tick.price,
          low: tick.price,
          close: tick.price
        });
      } else {
        const candle = map.get(minute);

        candle.high = Math.max(
          candle.high,
          tick.price
        );

        candle.low = Math.min(
          candle.low,
          tick.price
        );

        candle.close = tick.price;
      }
    }

    STATE.candles = Array.from(map.values())
      .sort((a, b) => a.time - b.time)
      .slice(-250);
  }

  // --------------------------------------------------
  // Indicators
  // --------------------------------------------------

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
        (values[i] - result) * multiplier + result;
    }

    return result;
  }

  function rsi(values, period = 14) {
    if (values.length <= period) return null;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const change = values[i] - values[i - 1];

      if (change >= 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    let averageGain = gains / period;
    let averageLoss = losses / period;

    for (let i = period + 1; i < values.length; i++) {
      const change = values[i] - values[i - 1];

      const gain = Math.max(change, 0);
      const loss = Math.max(-change, 0);

      averageGain =
        ((averageGain * (period - 1)) + gain) / period;

      averageLoss =
        ((averageLoss * (period - 1)) + loss) / period;
    }

    if (averageLoss === 0) return 100;

    const rs = averageGain / averageLoss;

    return 100 - (100 / (1 + rs));
  }

  function bollinger(values, period = 20) {
    if (values.length < period) return null;

    const recent = values.slice(-period);

    const mean =
      recent.reduce((a, b) => a + b, 0) / period;

    const variance =
      recent.reduce(
        (sum, value) =>
          sum + Math.pow(value - mean, 2),
        0
      ) / period;

    const deviation = Math.sqrt(variance);

    return {
      middle: mean,
      upper: mean + deviation * 2,
      lower: mean - deviation * 2
    };
  }

  // --------------------------------------------------
  // Analysis
  // --------------------------------------------------

  function analyze() {
    const closes = STATE.candles.map(c => c.close);

    if (closes.length < 50) {
      setText(
        "po-scanner-signal",
        "Signal: WAIT — collecting candles"
      );

      setText(
        "po-scanner-confidence",
        "Confidence: " +
        Math.min(
          99,
          Math.round((closes.length / 50) * 100)
        ) +
        "%"
      );

      return;
    }

    const price = closes[closes.length - 1];

    const ema9 = ema(closes, 9);
    const ema21 = ema(closes, 21);
    const ema50 = ema(closes, 50);

    const currentRSI = rsi(closes, 14);
    const bands = bollinger(closes, 20);

    let buy = 0;
    let sell = 0;

    // Trend
    if (ema9 > ema21) buy++;
    if (ema9 < ema21) sell++;

    if (ema21 > ema50) buy++;
    if (ema21 < ema50) sell++;

    // RSI
    if (currentRSI > 50 && currentRSI < 70) buy++;
    if (currentRSI < 50 && currentRSI > 30) sell++;

    // Bollinger
    if (bands) {
      if (price > bands.middle) buy++;
      if (price < bands.middle) sell++;
    }

    let signal = "WAIT";
    let confidence = 50;

    if (buy >= 4 && buy > sell) {
      signal = "BUY";
      confidence = 70 + Math.min(25, buy * 5);
    } else if (sell >= 4 && sell > buy) {
      signal = "SELL";
      confidence = 70 + Math.min(25, sell * 5);
    } else {
      confidence = 50 + Math.abs(buy - sell) * 5;
    }

    setText(
      "po-scanner-signal",
      "Signal: " + signal
    );

    setText(
      "po-scanner-confidence",
      "Confidence: " + Math.min(99, confidence) + "%"
    );
  }

  // --------------------------------------------------
  // Socket.IO message parser
  // --------------------------------------------------

  function processSocketMessage(raw) {
    if (typeof raw !== "string") return;

    /*
      Socket.IO market messages commonly look like:

      42["updateStream", {...}]

      or

      42["updateHistoryNewFast", {...}]
    */

    let message = raw;

    // Socket.IO event packet
    if (message.startsWith("42")) {
      message = message.substring(2);
    }

    // Engine.IO ping/pong/control packets
    if (
      message === "2" ||
      message === "3" ||
      message === "40" ||
      message === "41"
    ) {
      return;
    }

    let parsed;

    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }

    if (!Array.isArray(parsed)) return;

    const eventName = parsed[0];
    const eventData = parsed[1];

    if (
      eventName !== "updateStream" &&
      eventName !== "updateHistoryNewFast"
    ) {
      return;
    }

    console.log(
      "[Pocket Scanner] Pocket Option event:",
      eventName,
      eventData
    );

    const symbol = findSymbol(eventData);

    if (symbol) {
      STATE.symbol = symbol;

      setText(
        "po-scanner-symbol",
        "Market: " + symbol
      );
    }

    // Historical candles
    if (eventName === "updateHistoryNewFast") {
      processHistory(eventData);
    }

    // Live stream
    if (eventName === "updateStream") {
      const price = findPrice(eventData);

      if (price !== null) {
        addPrice(price);
      }
    }
  }

  // --------------------------------------------------
  // Historical data parser
  // --------------------------------------------------

  function processHistory(data) {
    if (!data) return;

    const history = [];

    function search(obj) {
      if (!obj) return;

      if (Array.isArray(obj)) {
        // Possible candle:
        // [timestamp, open, close, high, low]

        if (
          obj.length >= 4 &&
          typeof obj[0] === "number"
        ) {
          const numbers = obj
            .map(number)
            .filter(v => v !== null);

          if (numbers.length >= 4) {
            history.push(numbers);
          }
        }

        for (const item of obj) {
          if (typeof item === "object") {
            search(item);
          }
        }

        return;
      }

      if (typeof obj === "object") {
        for (const key of Object.keys(obj)) {
          search(obj[key]);
        }
      }
    }

    search(data);

    if (history.length === 0) return;

    for (const candle of history) {
      const timestamp = candle[0] * (
        candle[0] < 10000000000 ? 1000 : 1
      );

      const values = candle.slice(1);

      const open = values[0];
      const close = values[1] ?? values[0];
      const high = values[2] ?? Math.max(open, close);
      const low = values[3] ?? Math.min(open, close);

      if (
        Number.isFinite(timestamp) &&
        Number.isFinite(open) &&
        Number.isFinite(close)
      ) {
        STATE.candles.push({
          time: timestamp,
          open,
          high,
          low,
          close
        });
      }
    }

    STATE.candles = STATE.candles
      .sort((a, b) => a.time - b.time)
      .slice(-250);

    const closes = STATE.candles.map(c => c.close);

    if (closes.length) {
      STATE.lastPrice = closes[closes.length - 1];

      setText(
        "po-scanner-price",
        "Price: " + STATE.lastPrice
      );

      showConnected();

      analyze();
    }
  }

  // --------------------------------------------------
  // WebSocket interception
  // --------------------------------------------------

  const OriginalWebSocket = window.WebSocket;

  if (!OriginalWebSocket) {
    console.log(
      "[Pocket Scanner] WebSocket unavailable"
    );
    return;
  }

  function PatchedWebSocket(...args) {
    const socket =
      new OriginalWebSocket(...args);

    socket.addEventListener(
      "message",
      event => {
        try {
          processSocketMessage(event.data);
        } catch (error) {
          console.log(
            "[Pocket Scanner] Parser error:",
            error
          );
        }
      }
    );

    return socket;
  }

  PatchedWebSocket.prototype =
    OriginalWebSocket.prototype;

  Object.setPrototypeOf(
    PatchedWebSocket,
    OriginalWebSocket
  );

  window.WebSocket = PatchedWebSocket;

  // --------------------------------------------------
  // Start
  // --------------------------------------------------

  function start() {
    createPanel();

    console.log(
      "[Pocket Scanner] Waiting for Pocket Option market stream..."
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      start
    );// Receive WebSocket frames captured by background.js

chrome.runtime.onMessage.addListener(
  message => {

    if (
      message?.type !==
      "POCKET_OPTION_WS_FRAME"
    ) {
      return;
    }

    const payload = message.payload;

    console.log(
      "[Pocket Scanner] Network frame received:",
      payload
    );

    try {
      processSocketMessage(payload);
    } catch (error) {
      console.log(
        "[Pocket Scanner] Frame processing error:",
        error
      );
    }
  }
);  } else {
    start();
  }

})();
