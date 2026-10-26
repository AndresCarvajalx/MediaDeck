if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  globalThis.browser = chrome;
}

const tabMediaMap = new Map();

function injectContentScriptIntoAllTabs() {
  browser.tabs.query({}).then(tabs => {
    for (const tab of tabs) {
      if (tab.id && tab.url && !tab.url.startsWith('about:') && !tab.url.startsWith('moz-extension:') && !tab.url.startsWith('chrome:')) {
        browser.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ['content/content.js']
        }).catch(() => {});
      }
    }
  }).catch(() => {});
}

injectContentScriptIntoAllTabs();

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;

  if (message.type === 'MEDIA_UPDATE') {
    const tabId = sender?.tab?.id;
    if (tabId === undefined) return;
    const frameId = sender?.frameId || 0;
    const key = `${tabId}:${frameId}`;

    if (!message.mediaList || message.mediaList.length === 0) {
      tabMediaMap.delete(key);
    } else {
      const enrichedMedia = message.mediaList.map(item => ({
        ...item,
        tabId: tabId,
        windowId: sender.tab.windowId,
        tabTitle: sender.tab.title || '',
        tabFavicon: sender.tab.favIconUrl || ''
      }));
      tabMediaMap.set(key, enrichedMedia);
    }

    updateBadge();
    broadcastState();
    return;
  }

  if (message.type === 'GET_ALL_MEDIA') {
    queryAllTabs();
    sendResponse({ media: getAllMediaList() });
    return true;
  }

  if (message.type === 'MEDIA_ACTION') {
    const { tabId, action, mediaId, ...params } = message;
    const targetTabId = typeof tabId === 'string' ? parseInt(tabId, 10) : tabId;

    if (targetTabId) {
      browser.tabs.sendMessage(targetTabId, {
        action: action,
        mediaId: mediaId,
        ...params
      }).catch(() => {
        executeDirectAction(targetTabId, action, params);
      });
    }
    sendResponse({ status: 'sent' });
    return true;
  }

  if (message.type === 'FOCUS_TAB') {
    const { tabId, windowId } = message;
    const targetTabId = typeof tabId === 'string' ? parseInt(tabId, 10) : tabId;
    if (targetTabId) {
      browser.tabs.update(targetTabId, { active: true }).catch(() => {});
    }
    if (windowId) {
      browser.windows.update(windowId, { focused: true }).catch(() => {});
    }
    sendResponse({ status: 'focused' });
    return true;
  }
});

function executeDirectAction(tabId, action, params = {}) {
  browser.scripting.executeScript({
    target: { tabId: tabId, allFrames: true },
    func: (act, p) => {
      const video = document.querySelector('video.html5-main-video') ||
                    document.querySelector('.html5-video-player video') ||
                    Array.from(document.querySelectorAll('video, audio')).find(e => !e.paused) ||
                    document.querySelector('video, audio');
      if (!video) return;

      switch (act) {
        case 'PLAY':
          if (video.paused) video.play().catch(() => {});
          break;

        case 'PAUSE':
          if (!video.paused) video.pause();
          break;

        case 'TOGGLE_PLAY':
          if (video.paused) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
          break;

        case 'SKIP_FORWARD': {
          const delta = (p && p.seconds) || 10;
          video.currentTime = Math.min(video.duration || Infinity, (video.currentTime || 0) + delta);
          break;
        }

        case 'SKIP_BACKWARD': {
          const delta = (p && p.seconds) || 10;
          video.currentTime = Math.max(0, (video.currentTime || 0) - delta);
          break;
        }

        case 'SEEK':
          if (p && typeof p.currentTime === 'number') {
            video.currentTime = Math.max(0, Math.min(video.duration || Infinity, p.currentTime));
          }
          break;

        case 'NEXT_TRACK':
          document.querySelector('.ytp-next-button, [data-testid="control-button-skip-forward"], ytmusic-player-bar .next-button')?.click();
          break;

        case 'PREV_TRACK':
          if (video.currentTime > 3) {
            video.currentTime = 0;
          } else {
            document.querySelector('.ytp-prev-button, [data-testid="control-button-skip-back"], ytmusic-player-bar .previous-button')?.click();
          }
          break;

        case 'TOGGLE_MUTE':
          video.muted = !video.muted;
          break;

        case 'SET_VOLUME':
          if (p && typeof p.volume === 'number') {
            video.volume = Math.max(0, Math.min(1, p.volume));
            video.muted = (video.volume === 0);
          }
          break;

        case 'SET_RATE':
          if (p && typeof p.rate === 'number') {
            video.playbackRate = p.rate;
          }
          break;

        case 'TOGGLE_SUBTITLES':
          document.querySelector('.ytp-subtitles-button')?.click();
          break;

        case 'TOGGLE_PIP':
          if (document.pictureInPictureElement) {
            document.exitPictureInPicture().catch(() => {});
          } else {
            video.removeAttribute('disablepictureinpicture');
            if (typeof video.requestPictureInPicture === 'function') {
              video.requestPictureInPicture().catch(() => {});
            }
          }
          break;
      }
    },
    args: [action, params]
  }).catch(() => {});
}

function broadcastState() {
  browser.runtime.sendMessage({
    type: 'MEDIA_STATE_CHANGED',
    allMedia: getAllMediaList()
  }).catch(() => {});
}

function getAllMediaList() {
  const allItems = [];
  for (const [, mediaList] of tabMediaMap.entries()) {
    for (const item of mediaList) {
      allItems.push(item);
    }
  }

  const tabItemMap = new Map();
  for (const item of allItems) {
    const dedupeKey = `${item.tabId}___${item.title || item.domain}`;
    if (!tabItemMap.has(dedupeKey)) {
      tabItemMap.set(dedupeKey, item);
    } else {
      const existing = tabItemMap.get(dedupeKey);
      if (!item.paused && existing.paused) {
        tabItemMap.set(dedupeKey, item);
      } else if (item.currentTime > existing.currentTime && existing.paused) {
        tabItemMap.set(dedupeKey, item);
      }
    }
  }

  const result = Array.from(tabItemMap.values());

  result.sort((a, b) => {
    if (!a.paused && b.paused) return -1;
    if (a.paused && !b.paused) return 1;
    return (b.lastUpdated || 0) - (a.lastUpdated || 0);
  });

  return result;
}

function queryAllTabs() {
  browser.tabs.query({}).then(tabs => {
    tabs.forEach(tab => {
      if (tab.id && tab.url && !tab.url.startsWith('about:') && !tab.url.startsWith('moz-extension:') && !tab.url.startsWith('chrome:')) {
        browser.tabs.sendMessage(tab.id, { action: 'QUERY_MEDIA' }).catch(() => {});
      }
    });
  }).catch(() => {});
}

browser.tabs.onRemoved.addListener(tabId => {
  for (const key of tabMediaMap.keys()) {
    if (key.startsWith(`${tabId}:`)) {
      tabMediaMap.delete(key);
    }
  }
  updateBadge();
  broadcastState();
});

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    for (const key of tabMediaMap.keys()) {
      if (key.startsWith(`${tabId}:`)) {
        tabMediaMap.delete(key);
      }
    }
    updateBadge();
    broadcastState();
  }
});

function updateBadge() {
  const allMedia = getAllMediaList();
  const playingCount = allMedia.filter(m => !m.paused).length;

  if (browser.action && browser.action.setBadgeText) {
    if (playingCount > 0) {
      browser.action.setBadgeText({ text: playingCount.toString() });
      browser.action.setBadgeBackgroundColor({ color: '#7c5cbf' });
    } else {
      browser.action.setBadgeText({ text: '' });
    }
  }
}
