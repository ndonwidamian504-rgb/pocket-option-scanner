// Pocket Option Basilisk-Style Scanner
// Analysis only — does NOT place trades.

(function () {
  "use strict";

  const Scanner = {
    version: "1.0",

    // Calculate EMA
    ema(values, period) {
      if (values.length < period) return null;

      const multiplier = 2 / (period + 1);
      let ema = values
        .slice(0, period)
        .reduce((a, b) => a + b, 0) / period;

      for (let i = period; i < values.length; i++) {
        ema = (values[i] - ema) * multiplier + ema;
      }

      return ema;
    },

    // Calculate RSI
    rsi(values, period = 14) {
      if (values.length <= period) return 50;

      let gains = 0;
      let losses = 0;

      for (let i = 1; i <= period; i++) {
        const change = values[i] - values[i - 1];

        if (change >= 0) gains += change;
        else losses += Math.abs(change);
      }

      let avgGain = gains / period;
      let avgLoss = losses / period;

      for (let i = period + 1; i < values.length; i++) {
        const change = values[i] - values[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? Math.abs(change) : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
      }

      if (avgLoss === 0) return 100;

      const rs = avgGain / avgLoss;
      return 100 - 100 / (1 + rs);
    },

    // Bollinger Bands
    bollinger(values, period = 20, deviation = 2) {
      if (values.length < period) return null;

      const recent = values.slice(-period);
      const mean =
        recent.reduce((a, b) => a + b, 0) / recent.length;

      const variance =
        recent.reduce((sum, value) => {
          return sum + Math.pow(value - mean, 2);
        }, 0) / recent.length;

      const standardDeviation = Math.sqrt(variance);

      return {
        middle: mean,
        upper: mean + deviation * standardDeviation,
        lower: mean - deviation * standardDeviation
      };
    },

    analyze(prices) {
      if (!prices || prices.length < 50) {
        return {
          signal: "WAIT",
          confidence: 0,
          reason: "Waiting for enough chart data"
        };
      }

      const price = prices[prices.length - 1];

      const ema9 = this.ema(prices, 9);
      const ema21 = this.ema(prices, 21);
      const ema50 = this.ema(prices, 50);

      const rsi = this.rsi(prices);
      const bands = this.bollinger(prices);

      let buyScore = 0;
      let sellScore = 0;

      const reasons = [];

      // EMA trend
      if (ema9 > ema21) {
        buyScore++;
        reasons.push("EMA 9 above EMA 21");
      }

      if (ema9 < ema21) {
        sellScore++;
        reasons.push("EMA 9 below EMA 21");
      }

      if (ema21 > ema50) {
        buyScore++;
      }

      if (ema21 < ema50) {
        sellScore++;
      }

      // RSI
      if (rsi >= 50 && rsi < 70) {
        buyScore++;
        reasons.push("RSI bullish");
      }

      if (rsi <= 50 && rsi > 30) {
        sellScore++;
        reasons.push("RSI bearish");
      }

      // Bollinger Bands
      if (bands) {
        if (price <= bands.lower) {
          buyScore += 2;
          reasons.push("Price near lower Bollinger Band");
        }

        if (price >= bands.upper) {
          sellScore += 2;
          reasons.push("Price near upper Bollinger Band");
        }
      }

      const total = Math.max(buyScore, sellScore);

      let signal = "WAIT";

      if (buyScore >= 4 && buyScore > sellScore) {
        signal = "BUY / CALL";
      }

      if (sellScore >= 4 && sellScore > buyScore) {
        signal = "SELL / PUT";
      }

      const confidence = Math.min(
        95,
        Math.round((total / 6) * 100)
      );

      return {
        signal,
        confidence,
        rsi: rsi.toFixed(1),
        ema9: ema9.toFixed(5),
        ema21: ema21.toFixed(5),
        ema50: ema50.toFixed(5),
        price: price.toFixed(5),
        reason:
          reasons.length > 0
            ? reasons.join(" • ")
            : "No strong setup detected"
      };
    }
  };

  window.PocketOptionScanner = Scanner;

})();
