// Pocket Option Scanner Overlay
// Analysis only — never places trades.

(function () {
  "use strict";

  if (window.__PO_SCANNER_LOADED__) return;
  window.__PO_SCANNER_LOADED__ = true;

  const panel = document.createElement("div");

  panel.id = "po-scanner-panel";

  panel.innerHTML = `
    <div class="po-header">
      <span>PO SCANNER</span>
      <button id="po-minimize">−</button>
    </div>

    <div class="po-body">

      <div class="po-market">
        <span>MARKET</span>
        <strong id="po-market">Detecting...</strong>
      </div>

      <div class="po-timeframe">
        <span>TIMEFRAME</span>
        <strong>1 MIN</strong>
      </div>

      <div id="po-signal" class="po-signal">
        WAIT
      </div>

      <div class="po-confidence">
        Confidence:
        <strong id="po-confidence">0%</strong>
      </div>

      <div class="po-info">
        <div>Price: <span id="po-price">--</span></div>
        <div>RSI: <span id="po-rsi">--</span></div>
        <div>EMA 9: <span id="po-ema9">--</span></div>
        <div>EMA 21: <span id="po-ema21">--</span></div>
        <div>EMA 50: <span id="po-ema50">--</span></div>
      </div>

      <div class="po-reason">
        <strong>Analysis</strong>
        <p id="po-reason">
          Waiting for chart data...
        </p>
      </div>

      <button id="po-scan-button">
        SCAN MARKET
      </button>

      <div class="po-status" id="po-status">
        Scanner ready
      </div>

    </div>
  `;

  document.body.appendChild(panel);

  const marketElement =
    document.querySelector(
      '[class*="asset"], [class*="symbol"], [class*="instrument"]'
    );

  if (marketElement) {
    document.getElementById("po-market").textContent =
      marketElement.textContent.trim().slice(0, 30);
  }

  function getVisiblePrices() {
    /*
      This first version looks for numeric price values
      visible in the Pocket Option page.

      If Pocket Option exposes the chart data through
      canvas/WebSocket rather than normal page text,
      the live-data connector will be added separately.
    */

    const numbers = [];

    const elements = document.querySelectorAll(
      "span, div, td"
    );

    elements.forEach((element) => {
      const text = element.textContent.trim();

      if (/^\d+(\.\d+)?$/.test(text)) {
        const number = Number(text);

        if (
          number > 0 &&
          number < 1000000 &&
          Number.isFinite(number)
        ) {
          numbers.push(number);
        }
      }
    });

    return numbers.slice(-300);
  }

  function scan() {
    const prices = getVisiblePrices();

    if (
      !window.PocketOptionScanner ||
      prices.length < 50
    ) {
      document.getElementById("po-status").textContent =
        "Waiting for live chart data...";

      document.getElementById("po-reason").textContent =
        "Open a Pocket Option chart and wait for market data.";

      return;
    }

    const result =
      window.PocketOptionScanner.analyze(prices);

    document.getElementById("po-signal").textContent =
      result.signal;

    document.getElementById("po-confidence").textContent =
      result.confidence + "%";

    document.getElementById("po-price").textContent =
      result.price;

    document.getElementById("po-rsi").textContent =
      result.rsi;

    document.getElementById("po-ema9").textContent =
      result.ema9;

    document.getElementById("po-ema21").textContent =
      result.ema21;

    document.getElementById("po-ema50").textContent =
      result.ema50;

    document.getElementById("po-reason").textContent =
      result.reason;

    document.getElementById("po-status").textContent =
      "Analysis updated";

    const signal =
      document.getElementById("po-signal");

    signal.className = "po-signal";

    if (result.signal.includes("BUY")) {
      signal.classList.add("buy");
    } else if (result.signal.includes("SELL")) {
      signal.classList.add("sell");
    } else {
      signal.classList.add("wait");
    }
  }

  document
    .getElementById("po-scan-button")
    .addEventListener("click", scan);

  document
    .getElementById("po-minimize")
    .addEventListener("click", () => {

      const body =
        document.querySelector(".po-body");

      if (body.style.display === "none") {
        body.style.display = "block";
        document.getElementById(
          "po-minimize"
        ).textContent = "−";
      } else {
        body.style.display = "none";
        document.getElementById(
          "po-minimize"
        ).textContent = "+";
      }
    });

  // Initial scan
  setTimeout(scan, 3000);

})();
