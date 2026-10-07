import os
import requests

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")


def send_signal(
    market,
    signal,
    confidence,
    timeframe="1m",
    reason=""
):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("Telegram credentials are not configured.")
        return False

    message = (
        f"📊 POCKET OPTION SCANNER\n\n"
        f"Market: {market}\n"
        f"Timeframe: {timeframe}\n"
        f"Signal: {signal}\n"
        f"Confidence: {confidence}%\n"
        f"Reason: {reason}\n\n"
        f"⚠️ Analysis only — manual trading."
    )

    url = (
        f"https://api.telegram.org/bot"
        f"{TELEGRAM_BOT_TOKEN}/sendMessage"
    )

    try:
        response = requests.post(
            url,
            json={
                "chat_id": TELEGRAM_CHAT_ID,
                "text": message
            },
            timeout=10
        )

        return response.ok

    except Exception as error:
        print("Telegram error:", error)
        return False
