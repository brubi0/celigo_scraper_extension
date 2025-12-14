/**
 * Celigo U Scraper - Background Service Worker
 * Handles message passing and coordination between popup and content scripts
 */

// Track active connections
const connections = new Map();

/**
 * Handle installation
 */
chrome.runtime.onInstalled.addListener((details) => {
    console.log('Celigo U Scraper installed:', details.reason);
    
    if (details.reason === 'install') {
        // Set default storage values
        chrome.storage.local.set({
            settings: {
                autoExtract: false,
                includeRawText: false,
                maxTextLength: 10000
            },
            history: []
        });
    }
});

/**
 * Handle messages from popup or content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background received message:', message.action);

    switch (message.action) {
        case 'getActiveTabInfo':
            handleGetActiveTabInfo(sendResponse);
            return true;

        case 'executeInAllFrames':
            handleExecuteInAllFrames(message, sender, sendResponse);
            return true;

        case 'saveToHistory':
            handleSaveToHistory(message.data, sendResponse);
            return true;

        case 'getHistory':
            handleGetHistory(sendResponse);
            return true;

        default:
            sendResponse({ success: false, error: 'Unknown action' });
    }

    return true;
});

/**
 * Get information about the active tab
 */
async function handleGetActiveTabInfo(sendResponse) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (tab && tab.url) {
            sendResponse({
                success: true,
                data: {
                    tabId: tab.id,
                    url: tab.url,
                    title: tab.title,
                    isCeligoU: tab.url.includes('training.celigo.com')
                }
            });
        } else {
            sendResponse({ success: false, error: 'No active tab' });
        }
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Execute script in all frames of a tab
 */
async function handleExecuteInAllFrames(message, sender, sendResponse) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
            sendResponse({ success: false, error: 'No active tab' });
            return;
        }

        // Execute extraction in all frames and aggregate results
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: () => {
                // This runs in each frame
                if (typeof window.celigoUScraper !== 'undefined') {
                    return window.celigoUScraper.extract();
                }
                return null;
            }
        });

        // Aggregate results from all frames
        const aggregated = {
            flipCards: [],
            hotspots: [],
            knowledgeChecks: [],
            accordions: [],
            tabs: [],
            textBlocks: [],
            lists: [],
            images: [],
            videos: []
        };

        results.forEach(result => {
            if (result.result) {
                Object.keys(aggregated).forEach(key => {
                    if (Array.isArray(result.result[key])) {
                        aggregated[key].push(...result.result[key]);
                    }
                });
            }
        });

        sendResponse({ success: true, data: aggregated });
    } catch (error) {
        console.error('Execute in frames error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Save extraction to history
 */
async function handleSaveToHistory(data, sendResponse) {
    try {
        const storage = await chrome.storage.local.get(['history']);
        const history = storage.history || [];
        
        // Add new entry
        history.unshift({
            id: Date.now(),
            timestamp: new Date().toISOString(),
            url: data.url,
            course: data.course,
            lesson: data.lesson,
            itemCount: data.itemCount,
            data: data.extractedData
        });

        // Keep only last 50 entries
        if (history.length > 50) {
            history.splice(50);
        }

        await chrome.storage.local.set({ history });
        sendResponse({ success: true });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Get extraction history
 */
async function handleGetHistory(sendResponse) {
    try {
        const storage = await chrome.storage.local.get(['history']);
        sendResponse({ success: true, data: storage.history || [] });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handle tab updates - inject scripts if needed
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url?.includes('training.celigo.com')) {
        console.log('Celigo U page loaded:', tab.url);
    }
});

/**
 * Handle extension icon click (alternative to popup)
 */
chrome.action.onClicked?.addListener(async (tab) => {
    // If no popup, could trigger extraction directly
    if (tab.url?.includes('training.celigo.com')) {
        await chrome.tabs.sendMessage(tab.id, { action: 'scrapeMainPage' });
    }
});

console.log('Celigo U Scraper: Background service worker started');
