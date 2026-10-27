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
      }).then(response => {
        if (!response || response.status === 'no_media') {
          executeDirectAction(targetTabId, action, params);
        }
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
      const hostname = window.location.hostname.replace(/^www\./, '');
      let elem = null;

      if (hostname.includes('youtube.com')) {
        elem = document.querySelector('video.html5-main-video') ||
               document.querySelector('.html5-video-player video') ||
               document.querySelector('video');
      } else {
        elem = Array.from(document.querySelectorAll('video, audio')).find(e => !e.paused && document.contains(e)) ||
               document.querySelector('video, audio');
      }

      if (!elem && !document.querySelector('.ytp-play-button, [data-testid="control-button-playpause"]')) {
        return;
      }

      switch (act) {
        case 'PLAY': {
          if (hostname.includes('youtube.com')) {
            if (elem && elem.paused) {
              const ytPlay = document.querySelector('.ytp-play-button');
              if (ytPlay) { ytPlay.click(); }
              else { elem.play().catch(() => {}); }
            }
          } else if (hostname.includes('spotify.com')) {
            const spPlay = document.querySelector('[data-testid="control-button-playpause"]');
            if (elem && elem.paused && spPlay) spPlay.click();
            else if (elem && elem.paused) elem.play().catch(() => {});
          } else if (elem && elem.paused) {
            elem.play().catch(() => {});
          }
          break;
        }

        case 'PAUSE': {
          if (hostname.includes('youtube.com')) {
            if (elem && !elem.paused) {
              const ytPlay = document.querySelector('.ytp-play-button');
              if (ytPlay) { ytPlay.click(); }
              else { elem.pause(); }
            }
          } else if (hostname.includes('spotify.com')) {
            const spPlay = document.querySelector('[data-testid="control-button-playpause"]');
            if (elem && !elem.paused && spPlay) spPlay.click();
            else if (elem && !elem.paused) elem.pause();
          } else if (elem && !elem.paused) {
            elem.pause();
          }
          break;
        }

        case 'TOGGLE_PLAY': {
          if (hostname.includes('youtube.com')) {
            const ytPlay = document.querySelector('.ytp-play-button');
            if (ytPlay) {
              ytPlay.click();
            } else {
              const player = document.getElementById('movie_player') || document.body;
              player.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', keyCode: 75, which: 75, bubbles: true }));
              if (elem) {
                if (elem.paused) elem.play().catch(() => {});
                else elem.pause();
              }
            }
          } else if (hostname.includes('spotify.com')) {
            const spBtn = document.querySelector('[data-testid="control-button-playpause"]');
            if (spBtn) {
              spBtn.click();
            } else if (elem) {
              if (elem.paused) elem.play().catch(() => {});
              else elem.pause();
            }
          } else if (hostname.includes('twitch.tv')) {
            const twBtn = document.querySelector('button[data-a-target="player-play-pause-button"]');
            if (twBtn) {
              twBtn.click();
            } else if (elem) {
              if (elem.paused) elem.play().catch(() => {});
              else elem.pause();
            }
          } else if (elem) {
            if (elem.paused) {
              elem.play().catch(() => {});
            } else {
              elem.pause();
            }
          }
          break;
        }

        case 'SKIP_FORWARD': {
          const delta = (p && p.seconds) || 10;
          if (hostname.includes('youtube.com')) {
            const player = document.getElementById('movie_player') || document.body;
            player.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', code: 'KeyL', keyCode: 76, which: 76, bubbles: true }));
            player.dispatchEvent(new KeyboardEvent('keyup', { key: 'l', code: 'KeyL', keyCode: 76, bubbles: true }));
          }
          if (elem && isFinite(elem.duration)) {
            elem.currentTime = Math.min(elem.duration || Infinity, (elem.currentTime || 0) + delta);
          } else if (elem) {
            elem.currentTime = (elem.currentTime || 0) + delta;
          }
          break;
        }

        case 'SKIP_BACKWARD': {
          const delta = (p && p.seconds) || 10;
          if (hostname.includes('youtube.com')) {
            const player = document.getElementById('movie_player') || document.body;
            player.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', code: 'KeyJ', keyCode: 74, which: 74, bubbles: true }));
            player.dispatchEvent(new KeyboardEvent('keyup', { key: 'j', code: 'KeyJ', keyCode: 74, bubbles: true }));
          }
          if (elem) {
            elem.currentTime = Math.max(0, (elem.currentTime || 0) - delta);
          }
          break;
        }

        case 'SEEK':
          if (elem && p && typeof p.currentTime === 'number') {
            const max = (elem.duration && isFinite(elem.duration)) ? elem.duration : Infinity;
            elem.currentTime = Math.max(0, Math.min(max, p.currentTime));
            elem.dispatchEvent(new Event('timeupdate'));
          }
          break;

        case 'NEXT_TRACK':
          if (hostname.includes('youtube.com')) {
            document.querySelector('.ytp-next-button, ytmusic-player-bar .next-button, #right-controls .next-button')?.click();
          } else if (hostname.includes('spotify.com')) {
            document.querySelector('[data-testid="control-button-skip-forward"]')?.click();
          }
          break;

        case 'PREV_TRACK':
          if (elem && elem.currentTime > 3) {
            elem.currentTime = 0;
          } else if (hostname.includes('youtube.com')) {
            document.querySelector('.ytp-prev-button, ytmusic-player-bar .previous-button')?.click();
          } else if (hostname.includes('spotify.com')) {
            document.querySelector('[data-testid="control-button-skip-back"]')?.click();
          }
          break;

        case 'TOGGLE_MUTE':
          if (hostname.includes('youtube.com')) {
            document.querySelector('.ytp-mute-button')?.click();
          } else if (elem) {
            elem.muted = !elem.muted;
          }
          break;

        case 'SET_VOLUME':
          if (elem && p && typeof p.volume === 'number') {
            elem.volume = Math.max(0, Math.min(1, p.volume));
            elem.muted = (elem.volume === 0);
          }
          break;

        case 'SET_RATE':
          if (elem && p && typeof p.rate === 'number') {
            elem.playbackRate = p.rate;
          }
          break;

        case 'TOGGLE_SUBTITLES':
          if (hostname.includes('youtube.com')) {
            document.querySelector('.ytp-subtitles-button')?.click();
          }
          break;

        case 'TOGGLE_PIP': {
          const video = (elem && elem.tagName.toLowerCase() === 'video') ? elem :
                        document.querySelector('video.html5-main-video') ||
                        document.querySelector('.html5-video-player video') ||
                        document.querySelector('video');
          if (video) {
            if (document.pictureInPictureElement) {
              document.exitPictureInPicture().catch(() => {});
            } else {
              video.removeAttribute('disablepictureinpicture');
              if (typeof video.requestPictureInPicture === 'function') {
                video.requestPictureInPicture().catch(() => {});
              }
            }
          }
          break;
        }
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
    return a.tabId - b.tabId;
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
