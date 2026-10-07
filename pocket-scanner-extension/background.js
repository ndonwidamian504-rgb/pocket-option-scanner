const attachedTabs = new Set();

async function attachToPocketOption(tabId) {
  if (attachedTabs.has(tabId)) return;

  try {
    await chrome.debugger.attach(
      {
        tabId: tabId
      },
      "1.3"
    );

    attachedTabs.add(tabId);

    console.log(
      "[Pocket Scanner] Debugger attached to tab:",
      tabId
    );

    await chrome.debugger.sendCommand(
      {
        tabId: tabId
      },
      "Network.enable"
    );

    console.log(
      "[Pocket Scanner] Network monitoring enabled"
    );

  } catch (error) {
    console.log(
      "[Pocket Scanner] Debugger error:",
      error
    );
  }
}


// Detect Pocket Option tabs
chrome.tabs.onUpdated.addListener(
  async (tabId, changeInfo, tab) => {

    if (!tab.url) return;

    if (
      tab.url.startsWith(
        "https://pocketoption.com/"
      )
    ) {
      await attachToPocketOption(tabId);
    }
  }
);


// Also check when extension starts
chrome.tabs.query(
  {},
  async tabs => {

    for (const tab of tabs) {

      if (
        tab.url &&
        tab.url.startsWith(
          "https://pocketoption.com/"
        )
      ) {
        await attachToPocketOption(tab.id);
      }
    }
  }
);


// Capture WebSocket frames
chrome.debugger.onEvent.addListener(
  (source, method, params) => {

    if (
      method !==
      "Network.webSocketFrameReceived"
    ) {
      return;
    }

    const tabId = source.tabId;

    if (!tabId) return;

    const payload =
      params?.response?.payloadData;

    if (!payload) return;

    console.log(
      "[Pocket Scanner] WebSocket frame:",
      payload
    );

    // Send the raw frame to the Pocket Option page
    chrome.tabs.sendMessage(
      tabId,
      {
        type: "POCKET_OPTION_WS_FRAME",
        payload: payload
      }
    ).catch(() => {});
  }
);


// Clean up closed tabs
chrome.tabs.onRemoved.addListener(
  tabId => {
    attachedTabs.delete(tabId);
  }
);
