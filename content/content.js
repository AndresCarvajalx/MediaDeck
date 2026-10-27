(function () {
  'use strict';

  if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
    globalThis.browser = chrome;
  }

  const mediaElements = new Map();
  let idCounter = 0;
  let lastReportTime = 0;
  let reportTimeout = null;

  function generateMediaId() {
    return `gmc_${Date.now()}_${++idCounter}_${Math.random().toString(36).substr(2, 5)}`;
  }

  function isValidMediaElement(elem) {
    if (!elem || !document.contains(elem)) return false;

    const hostname = window.location.hostname.replace(/^www\./, '');
    const isVideo = elem.tagName.toLowerCase() === 'video';

    if (hostname.includes('youtube.com')) {
      if (elem.closest('ytd-video-preview, ytd-inline-preview-renderer, ytd-thumbnail, #preview')) {
        return false;
      }

      const mainVideo = document.querySelector('video.html5-main-video') || document.querySelector('.html5-video-player video');
      if (mainVideo && elem === mainVideo) {
        return true;
      }
      if (mainVideo && elem !== mainVideo) {
        return false;
      }
    }

    if (isVideo && elem.paused) {
      if (elem.offsetWidth === 0 && elem.offsetHeight === 0 && elem.videoWidth === 0) {
        return false;
      }

      const style = window.getComputedStyle(elem);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }

      if (elem.hasAttribute('hidden') || elem.getAttribute('aria-hidden') === 'true') {
        return false;
      }
    }

    if (elem.duration > 0 && elem.duration < 2.5 && elem.paused) {
      return false;
    }

    const hasMedia = (elem.duration > 0) || (elem.currentTime > 0) || (elem.readyState > 0) || !elem.paused;
    if (!hasMedia) return false;

    return true;
  }

  function getMediaMetadata(elem) {
    const hostname = window.location.hostname.replace(/^www\./, '');
    let title = '';
    let artist = '';
    let artwork = '';
    let hasSubtitles = false;
    let subtitlesEnabled = false;

    try {
      const mediaSession = window.wrappedJSObject?.navigator?.mediaSession;
      if (mediaSession && mediaSession.metadata) {
        const meta = mediaSession.metadata;
        if (meta.title) title = meta.title;
        if (meta.artist) artist = meta.artist;
        if (meta.artwork && meta.artwork.length > 0) {
          artwork = meta.artwork[meta.artwork.length - 1].src;
        }
      }
    } catch (e) {}

    if (hostname.includes('youtube.com')) {
      if (!title) {
        const titleElem = document.querySelector('ytd-watch-metadata #title h1, #title h1 yt-formatted-string, h1.title, .ytp-title-link, ytmusic-player-bar .title');
        if (titleElem && titleElem.textContent.trim()) {
          title = titleElem.textContent.trim();
        }
      }

      if (!artist) {
        const channelElem = document.querySelector('ytd-watch-metadata #channel-name #text, #owner #channel-name, #upload-info #channel-name, .ytp-title-channel-name, ytmusic-player-bar .byline');
        if (channelElem && channelElem.textContent.trim()) {
          artist = channelElem.textContent.trim();
        }
      }

      if (!artwork) {
        const params = new URLSearchParams(window.location.search);
        const v = params.get('v');
        if (v) {
          artwork = `https://i.ytimg.com/vi/${v}/hqdefault.jpg`;
        }
      }

      const ytCcBtn = document.querySelector('.ytp-subtitles-button');
      if (ytCcBtn) {
        hasSubtitles = true;
        subtitlesEnabled = ytCcBtn.getAttribute('aria-pressed') === 'true';
      }
    }

    if (hostname.includes('spotify.com')) {
      if (!title) {
        const titleEl = document.querySelector('[data-testid="context-item-info-title"]');
        if (titleEl) title = titleEl.textContent.trim();
      }
      if (!artist) {
        const artistEl = document.querySelector('[data-testid="context-item-info-artist"]');
        if (artistEl) artist = artistEl.textContent.trim();
      }
      if (!artwork) {
        const coverEl = document.querySelector('[data-testid="cover-art-image"]');
        if (coverEl) artwork = coverEl.src;
      }
    }

    if (hostname.includes('twitch.tv')) {
      if (!title) {
        const titleEl = document.querySelector('h1[data-a-target="stream-title"]');
        if (titleEl) title = titleEl.textContent.trim();
      }
      if (!artist) {
        const chEl = document.querySelector('h2[data-a-target="stream-channel-name-item"], a[data-a-target="user-channel-link"]');
        if (chEl) artist = chEl.textContent.trim();
      }
    }

    if (!title) {
      if (elem && elem.title) {
        title = elem.title;
      } else {
        const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
        if (ogTitle) {
          title = ogTitle;
        } else {
          title = document.title
            .replace(/ - YouTube$/, '')
            .replace(/ \| Spotify$/, '')
            .replace(/ - Twitch$/, '')
            .replace(/ - Soundcloud$/, '')
            .trim();
        }
      }
    }

    if (!artist) {
      artist = hostname;
    }

    if (!artwork) {
      if (elem && elem.poster) {
        artwork = elem.poster;
      } else {
        const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
        if (ogImage) artwork = ogImage;
      }
    }

    if (!hasSubtitles && elem && elem.textTracks && elem.textTracks.length > 0) {
      hasSubtitles = true;
      for (let i = 0; i < elem.textTracks.length; i++) {
        if (elem.textTracks[i].mode === 'showing') {
          subtitlesEnabled = true;
          break;
        }
      }
    }

    let favicon = '';
    const iconEl = document.querySelector('link[rel~="icon"]') || document.querySelector('link[rel*="icon"]');
    if (iconEl && iconEl.href) {
      favicon = iconEl.href;
    } else {
      favicon = `${window.location.origin}/favicon.ico`;
    }

    return {
      title: title || 'Reproduciendo multimedia',
      artist: artist || hostname,
      artwork: artwork || '',
      domain: hostname,
      favicon: favicon,
      hasSubtitles,
      subtitlesEnabled
    };
  }

  function getMediaInfo(id, elem) {
    const meta = getMediaMetadata(elem);
    const isVideo = elem.tagName.toLowerCase() === 'video';
    const isPiP = isVideo && (
      document.pictureInPictureElement === elem ||
      (document.pictureInPictureElement !== null && !elem.paused)
    );
    const canPiP = isVideo;

    const duration = isFinite(elem.duration) && !isNaN(elem.duration) ? elem.duration : 0;
    const isLive = elem.duration === Infinity || (elem.seekable && elem.seekable.length > 0 && elem.seekable.end(elem.seekable.length - 1) === Infinity);

    return {
      mediaId: id,
      isVideo: isVideo,
      paused: elem.paused,
      currentTime: elem.currentTime || 0,
      duration: duration,
      isLive: isLive,
      volume: elem.volume !== undefined ? elem.volume : 1,
      muted: elem.muted || false,
      playbackRate: elem.playbackRate || 1,
      isPiP: isPiP,
      canPiP: canPiP,
      title: meta.title,
      artist: meta.artist,
      artwork: meta.artwork,
      domain: meta.domain,
      favicon: meta.favicon,
      hasSubtitles: meta.hasSubtitles,
      subtitlesEnabled: meta.subtitlesEnabled,
      lastUpdated: Date.now()
    };
  }

  function sendMediaReport() {
    const hostname = window.location.hostname.replace(/^www\./, '');
    let selected = [];

    if (hostname.includes('youtube.com')) {
      const mainVid = document.querySelector('video.html5-main-video') || document.querySelector('.html5-video-player video');
      if (mainVid && document.contains(mainVid)) {
        let foundId = null;
        for (const [id, el] of mediaElements.entries()) {
          if (el === mainVid) {
            foundId = id;
            break;
          }
        }
        if (!foundId) {
          foundId = generateMediaId();
          mediaElements.set(foundId, mainVid);
        }
        selected = [{ id: foundId, elem: mainVid }];
      }
    }

    if (selected.length === 0) {
      const candidates = [];
      mediaElements.forEach((elem, id) => {
        if (!document.contains(elem)) {
          mediaElements.delete(id);
          return;
        }
        if (isValidMediaElement(elem)) {
          candidates.push({ id, elem });
        }
      });

      if (candidates.length === 0) {
        try {
          browser.runtime.sendMessage({
            type: 'MEDIA_UPDATE',
            mediaList: []
          }).catch(() => {});
        } catch (e) {}
        return;
      }

      const playingCandidates = candidates.filter(c => !c.elem.paused);
      if (playingCandidates.length > 0) {
        selected = playingCandidates;
      } else {
        candidates.sort((a, b) => {
          const timeDiff = (b.elem.currentTime || 0) - (a.elem.currentTime || 0);
          if (Math.abs(timeDiff) > 1) return timeDiff;

          const aRect = a.elem.getBoundingClientRect();
          const bRect = b.elem.getBoundingClientRect();
          return (bRect.width * bRect.height) - (aRect.width * aRect.height);
        });
        selected = [candidates[0]];
      }
    }

    const uniqueList = [];
    const seenTitles = new Set();

    for (const item of selected) {
      const info = getMediaInfo(item.id, item.elem);
      const dedupeKey = `${info.domain}___${info.title}`;
      if (!seenTitles.has(dedupeKey)) {
        seenTitles.add(dedupeKey);
        uniqueList.push(info);
      }
    }

    try {
      browser.runtime.sendMessage({
        type: 'MEDIA_UPDATE',
        mediaList: uniqueList
      }).catch(() => {});
    } catch (e) {}
  }

  function queueReport(immediate = false) {
    if (immediate) {
      if (reportTimeout) clearTimeout(reportTimeout);
      sendMediaReport();
      lastReportTime = Date.now();
      return;
    }

    const now = Date.now();
    if (now - lastReportTime > 500) {
      if (reportTimeout) clearTimeout(reportTimeout);
      sendMediaReport();
      lastReportTime = now;
    } else if (!reportTimeout) {
      reportTimeout = setTimeout(() => {
        reportTimeout = null;
        sendMediaReport();
        lastReportTime = Date.now();
      }, 500 - (now - lastReportTime));
    }
  }

  function registerMediaElement(elem) {
    if (!elem) return;

    for (const [, el] of mediaElements.entries()) {
      if (el === elem) return;
    }

    const id = generateMediaId();
    mediaElements.set(id, elem);

    const events = ['play', 'pause', 'ended', 'volumechange', 'ratechange', 'enterpictureinpicture', 'leavepictureinpicture', 'loadedmetadata'];
    events.forEach(evt => {
      elem.addEventListener(evt, () => queueReport(true));
    });

    elem.addEventListener('timeupdate', () => queueReport(false));

    queueReport(true);
  }

  function scanMedia() {
    document.querySelectorAll('video, audio').forEach(el => registerMediaElement(el));
    injectYouTubePiPButton();
  }

  function injectYouTubePiPButton() {
    if (!window.location.hostname.includes('youtube.com')) return;
    const rightControls = document.querySelector('.ytp-right-controls');
    if (!rightControls || document.querySelector('.ytp-mediadeck-pip')) return;

    const btn = document.createElement('button');
    btn.className = 'ytp-button ytp-mediadeck-pip';
    btn.title = 'Picture-in-Picture (MediaDeck)';
    btn.style.cssText = 'vertical-align: top; display: inline-flex; align-items: center; justify-content: center; width: 46px; height: 100%;';
    btn.innerHTML = `<svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%" style="width: 22px; height: 22px; fill: #fff;">
      <path d="M25,17 L17,17 L17,23 L25,23 L25,17 Z M29,25 L29,11 C29,9.9 28.1,9 27,9 L9,9 C7.9,9 7,9.9 7,11 L7,25 C7,26.1 7.9,27 9,27 L27,27 C28.1,27 29,26.1 29,25 Z M27,25 L9,25 L9,11 L27,11 L27,25 Z" />
    </svg>`;

    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
      if (!video) return;

      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
      } else {
        video.removeAttribute('disablepictureinpicture');
        if (typeof video.requestPictureInPicture === 'function') {
          video.requestPictureInPicture().catch(() => {});
        }
      }
    };

    const targetPos = rightControls.querySelector('.ytp-size-button') || rightControls.querySelector('.ytp-fullscreen-button');
    if (targetPos) {
      rightControls.insertBefore(btn, targetPos);
    } else {
      rightControls.appendChild(btn);
    }
  }

  function executeMediaAction(action, params = {}, mediaId = null) {
    const hostname = window.location.hostname.replace(/^www\./, '');
    let elem = null;

    if (hostname.includes('youtube.com')) {
      elem = document.querySelector('video.html5-main-video') ||
             document.querySelector('.html5-video-player video') ||
             document.querySelector('video');
    } else {
      if (mediaId && mediaElements.has(mediaId)) {
        elem = mediaElements.get(mediaId);
      }
      if (!elem || !document.contains(elem)) {
        elem = Array.from(document.querySelectorAll('video, audio')).find(e => !e.paused && document.contains(e)) ||
               document.querySelector('video, audio') ||
               Array.from(mediaElements.values())[0];
      }
    }

    if (!elem && !document.querySelector('.ytp-play-button, [data-testid="control-button-playpause"]')) {
      return false;
    }

    try {
      switch (action) {
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
          const delta = params.seconds || 10;
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
          const delta = params.seconds || 10;
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

        case 'SEEK': {
          if (elem && typeof params.currentTime === 'number' && !isNaN(params.currentTime)) {
            const max = (elem.duration && isFinite(elem.duration)) ? elem.duration : Infinity;
            elem.currentTime = Math.max(0, Math.min(max, params.currentTime));
            elem.dispatchEvent(new Event('timeupdate'));
          }
          break;
        }

        case 'NEXT_TRACK': {
          if (hostname.includes('youtube.com')) {
            const ytNext = document.querySelector('.ytp-next-button, ytmusic-player-bar .next-button, #right-controls .next-button');
            if (ytNext) { ytNext.click(); break; }
          }
          if (hostname.includes('spotify.com')) {
            const spNext = document.querySelector('[data-testid="control-button-skip-forward"]');
            if (spNext) { spNext.click(); break; }
          }
          break;
        }

        case 'PREV_TRACK': {
          if (elem && elem.currentTime > 3) {
            elem.currentTime = 0;
            break;
          }
          if (hostname.includes('youtube.com')) {
            const ytPrev = document.querySelector('.ytp-prev-button, ytmusic-player-bar .previous-button');
            if (ytPrev) { ytPrev.click(); break; }
          }
          if (hostname.includes('spotify.com')) {
            const spPrev = document.querySelector('[data-testid="control-button-skip-back"]');
            if (spPrev) { spPrev.click(); break; }
          }
          if (elem) elem.currentTime = 0;
          break;
        }

        case 'SET_VOLUME': {
          if (elem && typeof params.volume === 'number' && !isNaN(params.volume)) {
            elem.volume = Math.max(0, Math.min(1, params.volume));
            elem.muted = (elem.volume === 0);
          }
          break;
        }

        case 'TOGGLE_MUTE': {
          if (hostname.includes('youtube.com')) {
            const ytMute = document.querySelector('.ytp-mute-button');
            if (ytMute) { ytMute.click(); break; }
          }
          if (elem) elem.muted = !elem.muted;
          break;
        }

        case 'SET_RATE': {
          if (elem && typeof params.rate === 'number' && isFinite(params.rate) && params.rate > 0) {
            elem.playbackRate = params.rate;
          }
          break;
        }

        case 'TOGGLE_SUBTITLES': {
          if (hostname.includes('youtube.com')) {
            document.querySelector('.ytp-subtitles-button')?.click();
          } else if (elem && elem.textTracks && elem.textTracks.length > 0) {
            let anyShowing = false;
            for (let i = 0; i < elem.textTracks.length; i++) {
              if (elem.textTracks[i].mode === 'showing') {
                anyShowing = true;
                elem.textTracks[i].mode = 'hidden';
              }
            }
            if (!anyShowing && elem.textTracks[0]) {
              elem.textTracks[0].mode = 'showing';
            }
          }
          break;
        }

        case 'TOGGLE_PIP': {
          const video = (elem && elem.tagName.toLowerCase() === 'video') ? elem :
                        document.querySelector('video.html5-main-video') ||
                        document.querySelector('.html5-video-player video') ||
                        Array.from(document.querySelectorAll('video')).find(v => !v.paused) ||
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
    } catch (err) {
      console.warn('MediaDeck: Error executing action:', err);
    }

    queueReport(true);
    return true;
  }

  if (window.__gmc_observer) {
    try { window.__gmc_observer.disconnect(); } catch (e) {}
  }

  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        m.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
              registerMediaElement(node);
            } else if (node.querySelectorAll) {
              const medias = node.querySelectorAll('video, audio');
              if (medias.length > 0) {
                medias.forEach(el => registerMediaElement(el));
              }
            }
          }
        });
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  window.__gmc_observer = observer;

  scanMedia();

  window.addEventListener('yt-navigate-finish', () => {
    setTimeout(() => {
      scanMedia();
      queueReport(true);
    }, 200);
  });

  window.addEventListener('yt-page-data-updated', () => {
    setTimeout(() => {
      queueReport(true);
    }, 200);
  });

  function handleMessage(message, sender, sendResponse) {
    if (!message || !message.action) return;

    if (message.action === 'QUERY_MEDIA') {
      sendMediaReport();
      sendResponse({ status: 'ok' });
      return true;
    }

    const { action, mediaId, ...params } = message;
    const handled = executeMediaAction(action, params, mediaId);

    if (handled) {
      sendResponse({ status: 'ok' });
    } else {
      sendResponse({ status: 'no_media' });
    }
    return true;
  }

  if (window.__gmc_listener) {
    try {
      browser.runtime.onMessage.removeListener(window.__gmc_listener);
    } catch (e) {}
  }
  window.__gmc_listener = handleMessage;
  browser.runtime.onMessage.addListener(handleMessage);

  if (window.__gmc_interval) {
    clearInterval(window.__gmc_interval);
  }
  window.__gmc_interval = setInterval(() => {
    scanMedia();
  }, 3000);
})();
