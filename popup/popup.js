(function () {
  'use strict';

  if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
    globalThis.browser = chrome;
  }

  const mediaListContainer = document.getElementById('media-list');
  const emptyStateContainer = document.getElementById('empty-state');
  const globalCcToggle = document.getElementById('global-cc-toggle');
  const toggleSettingsRow = document.getElementById('toggle-settings-row');
  const settingsChevron = document.getElementById('settings-chevron');
  const quickSettingsPanel = document.getElementById('quick-settings-panel');
  const quickMuteBtn = document.getElementById('quick-mute-btn');
  const quickVolumeSlider = document.getElementById('quick-volume-slider');
  const quickVolumeText = document.getElementById('quick-volume-text');
  const quickVolIconContainer = document.getElementById('quick-vol-icon-container');
  const speedChips = document.querySelectorAll('.chip');

  let currentMediaList = [];
  let isDraggingSlider = false;
  let activeMediaItem = null;

  function getIcon(name) {
    const tmpl = document.getElementById(`tmpl-icon-${name}`);
    if (!tmpl) return document.createElement('span');
    return tmpl.content.firstElementChild.cloneNode(true);
  }

  function setIcon(elem, name) {
    if (!elem) return;
    elem.replaceChildren(getIcon(name));
  }

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const padSecs = secs < 10 ? `0${secs}` : secs;

    if (hrs > 0) {
      const padMins = mins < 10 ? `0${mins}` : mins;
      return `${hrs}:${padMins}:${padSecs}`;
    }
    return `${mins}:${padSecs}`;
  }

  function sendMediaAction(tabId, mediaId, action, params = {}) {
    const targetTabId = typeof tabId === 'string' ? parseInt(tabId, 10) : tabId;
    browser.runtime.sendMessage({
      type: 'MEDIA_ACTION',
      tabId: targetTabId,
      mediaId: mediaId,
      action: action,
      ...params
    }).catch(err => {
      console.warn('MediaDeck: Action dispatch error', err);
    });
  }

  function focusTab(tabId, windowId) {
    const targetTabId = typeof tabId === 'string' ? parseInt(tabId, 10) : tabId;
    browser.runtime.sendMessage({
      type: 'FOCUS_TAB',
      tabId: targetTabId,
      windowId: windowId
    }).catch(() => {});
  }

  function renderMediaCards(mediaList) {
    const deduplicated = [];
    const seenKeys = new Set();
    for (const m of (mediaList || [])) {
      const key = `${m.tabId}___${m.title || m.domain}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        deduplicated.push(m);
      }
    }
    currentMediaList = deduplicated;

    if (currentMediaList.length === 0) {
      mediaListContainer.replaceChildren();
      emptyStateContainer.classList.remove('hidden');
      activeMediaItem = null;
      updateQuickSettings(null);
      return;
    }

    emptyStateContainer.classList.add('hidden');

    if (!activeMediaItem || !currentMediaList.some(m => m.tabId === activeMediaItem.tabId)) {
      activeMediaItem = currentMediaList.find(m => !m.paused) || currentMediaList[0];
    } else {
      const updated = currentMediaList.find(m => m.tabId === activeMediaItem.tabId);
      if (updated) activeMediaItem = updated;
    }
    updateQuickSettings(activeMediaItem);

    if (isDraggingSlider) {
      updateExistingDOM(currentMediaList);
      return;
    }

    const existingCards = new Map();
    mediaListContainer.querySelectorAll('.media-card').forEach(card => {
      const tid = card.getAttribute('data-tab-id');
      if (tid) existingCards.set(tid, card);
    });

    const newTabIds = new Set(currentMediaList.map(m => String(m.tabId)));

    existingCards.forEach((card, tid) => {
      if (!newTabIds.has(tid)) {
        card.remove();
      }
    });

    currentMediaList.forEach(media => {
      const tid = String(media.tabId);
      let card = existingCards.get(tid);
      if (!card) {
        card = createCardElement(media);
        mediaListContainer.appendChild(card);
      } else {
        updateCardElement(card, media);
      }
    });

    updateSelectedCardVisual();
  }

  function updateSelectedCardVisual() {
    mediaListContainer.querySelectorAll('.media-card').forEach(card => {
      const tid = parseInt(card.getAttribute('data-tab-id'), 10);
      if (activeMediaItem && tid === activeMediaItem.tabId) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });
  }

  function createCardElement(media) {
    const tmpl = document.getElementById('tmpl-media-card');
    const card = tmpl.content.firstElementChild.cloneNode(true);

    card.setAttribute('data-tab-id', media.tabId);
    card.setAttribute('data-media-id', media.mediaId);

    const artworkContainer = card.querySelector('.artwork-container');
    const artworkImg = card.querySelector('.artwork-img');
    const placeholderWrap = card.querySelector('.artwork-placeholder-wrap');
    placeholderWrap.replaceChildren(getIcon('musicNote'));

    if (media.artwork) {
      artworkImg.src = media.artwork;
      artworkImg.style.display = 'block';
      placeholderWrap.style.display = 'none';
      artworkImg.onerror = () => {
        artworkImg.style.display = 'none';
        placeholderWrap.style.display = 'block';
      };
    } else {
      artworkImg.style.display = 'none';
      placeholderWrap.style.display = 'block';
    }

    const domainBadge = card.querySelector('.domain-badge');
    const domainFavicon = card.querySelector('.domain-favicon');
    const domainName = card.querySelector('.domain-name');
    domainName.textContent = media.domain || '';
    domainBadge.title = `Ir a ${media.domain || 'pestaña'}`;

    const faviconSrc = media.tabFavicon || media.favicon || `https://www.google.com/s2/favicons?domain=${media.domain}&sz=32`;
    domainFavicon.src = faviconSrc;
    domainFavicon.style.display = 'inline-block';
    domainFavicon.onerror = () => {
      domainFavicon.style.display = 'none';
    };

    const pipBtn = card.querySelector('.pip-btn');
    if (media.canPiP) {
      setIcon(pipBtn, 'pip');
      pipBtn.classList.toggle('active', !!media.isPiP);
      pipBtn.title = media.isPiP ? 'Salir de Picture-in-Picture' : 'Activar Picture-in-Picture';
    } else {
      pipBtn.remove();
    }

    const focusBtn = card.querySelector('.focus-tab-btn');
    setIcon(focusBtn, 'focusTab');

    const titleEl = card.querySelector('.media-title');
    titleEl.textContent = media.title || '';
    titleEl.title = media.title || '';

    const artistEl = card.querySelector('.media-artist');
    artistEl.textContent = media.artist || '';
    artistEl.title = media.artist || '';

    const playPauseBtn = card.querySelector('.btn-play-pause');
    setIcon(playPauseBtn, media.paused ? 'play' : 'pause');
    playPauseBtn.title = media.paused ? 'Reproducir' : 'Pausar';
    playPauseBtn.setAttribute('data-is-paused', media.paused ? 'true' : 'false');

    const prevBtn = card.querySelector('.prev-btn');
    setIcon(prevBtn, 'prev');

    const rewindBtn = card.querySelector('.rewind-btn');
    setIcon(rewindBtn, 'rewind10');

    const forwardBtn = card.querySelector('.forward-btn');
    setIcon(forwardBtn, 'forward10');

    const nextBtn = card.querySelector('.next-btn');
    setIcon(nextBtn, 'next');

    const duration = media.duration || 0;
    const currentTime = media.currentTime || 0;
    const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

    const fill = card.querySelector('.seeker-fill');
    const thumb = card.querySelector('.seeker-thumb');
    const slider = card.querySelector('.seeker-slider');
    const curTimeText = card.querySelector('.current-time-text');
    const durText = card.querySelector('.duration-text');

    fill.style.width = `${progressPct}%`;
    thumb.style.left = `${progressPct}%`;
    slider.max = duration || 100;
    slider.value = currentTime;
    curTimeText.textContent = formatTime(currentTime);
    durText.textContent = media.isLive ? 'EN VIVO' : formatTime(duration);

    attachCardEventListeners(card, media);
    return card;
  }

  function updateCardElement(card, media) {
    card.setAttribute('data-tab-id', media.tabId);
    card.setAttribute('data-media-id', media.mediaId);

    const playPauseBtn = card.querySelector('.btn-play-pause');
    if (playPauseBtn) {
      setIcon(playPauseBtn, media.paused ? 'play' : 'pause');
      playPauseBtn.title = media.paused ? 'Reproducir' : 'Pausar';
      playPauseBtn.setAttribute('data-is-paused', media.paused ? 'true' : 'false');
    }

    const titleEl = card.querySelector('.media-title');
    if (titleEl && titleEl.textContent !== media.title) {
      titleEl.textContent = media.title;
      titleEl.title = media.title;
    }

    const artistEl = card.querySelector('.media-artist');
    if (artistEl && artistEl.textContent !== media.artist) {
      artistEl.textContent = media.artist;
      artistEl.title = media.artist;
    }

    const pipBtn = card.querySelector('.pip-btn');
    if (pipBtn) {
      pipBtn.classList.toggle('active', !!media.isPiP);
      pipBtn.title = media.isPiP ? 'Salir de Picture-in-Picture' : 'Activar Picture-in-Picture';
    }

    if (!isDraggingSlider) {
      const duration = media.duration || 0;
      const currentTime = media.currentTime || 0;
      const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

      const fill = card.querySelector('.seeker-fill');
      const thumb = card.querySelector('.seeker-thumb');
      const slider = card.querySelector('.seeker-slider');
      const curTimeText = card.querySelector('.current-time-text');
      const durText = card.querySelector('.duration-text');

      if (fill) fill.style.width = `${progressPct}%`;
      if (thumb) thumb.style.left = `${progressPct}%`;
      if (slider) {
        slider.max = duration || 100;
        slider.value = currentTime;
      }
      if (curTimeText) curTimeText.textContent = formatTime(currentTime);
      if (durText) durText.textContent = media.isLive ? 'EN VIVO' : formatTime(duration);
    }
  }

  function updateExistingDOM(mediaList) {
    mediaList.forEach(m => {
      const card = mediaListContainer.querySelector(`.media-card[data-tab-id="${m.tabId}"]`);
      if (card) updateCardElement(card, m);
    });
  }

  function attachCardEventListeners(card, media) {
    const windowId = media.windowId;
    const getTabId = () => parseInt(card.getAttribute('data-tab-id'), 10) || media.tabId;
    const getMediaId = () => card.getAttribute('data-media-id') || media.mediaId;

    const selectCard = () => {
      const tid = getTabId();
      const selected = currentMediaList.find(m => m.tabId === tid);
      if (selected) {
        activeMediaItem = selected;
        updateQuickSettings(activeMediaItem);
        updateSelectedCardVisual();
      }
    };

    card.addEventListener('click', (e) => {
      if (e.target.closest('button, input, a, .slider')) return;
      selectCard();
    });

    const artwork = card.querySelector('.artwork-container');
    if (artwork) {
      artwork.addEventListener('click', (e) => {
        e.stopPropagation();
        focusTab(getTabId(), windowId);
      });
    }

    const domainBadge = card.querySelector('.domain-badge');
    const titleEl = card.querySelector('.media-title');
    if (domainBadge) {
      domainBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        focusTab(getTabId(), windowId);
      });
    }
    if (titleEl) {
      titleEl.addEventListener('click', (e) => {
        e.stopPropagation();
        focusTab(getTabId(), windowId);
      });
    }

    const focusBtn = card.querySelector('.focus-tab-btn');
    if (focusBtn) {
      focusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        focusTab(getTabId(), windowId);
      });
    }

    const pipBtn = card.querySelector('.pip-btn');
    if (pipBtn) {
      pipBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectCard();
        pipBtn.classList.toggle('active');
        sendMediaAction(getTabId(), getMediaId(), 'TOGGLE_PIP');
      });
    }

    const playPauseBtn = card.querySelector('.btn-play-pause');
    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectCard();

        const wasPaused = playPauseBtn.getAttribute('data-is-paused') === 'true';
        setIcon(playPauseBtn, wasPaused ? 'pause' : 'play');
        playPauseBtn.title = wasPaused ? 'Pausar' : 'Reproducir';
        playPauseBtn.setAttribute('data-is-paused', wasPaused ? 'false' : 'true');
        media.paused = !wasPaused;

        sendMediaAction(getTabId(), getMediaId(), 'TOGGLE_PLAY');
      });
    }

    const rewindBtn = card.querySelector('.rewind-btn');
    if (rewindBtn) {
      rewindBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectCard();

        const slider = card.querySelector('.seeker-slider');
        const curTimeText = card.querySelector('.current-time-text');
        const fill = card.querySelector('.seeker-fill');
        const thumb = card.querySelector('.seeker-thumb');
        if (slider) {
          const newTime = Math.max(0, (parseFloat(slider.value) || 0) - 10);
          slider.value = newTime;
          if (curTimeText) curTimeText.textContent = formatTime(newTime);
          const max = parseFloat(slider.max) || 100;
          const pct = Math.min(100, Math.max(0, (newTime / max) * 100));
          if (fill) fill.style.width = `${pct}%`;
          if (thumb) thumb.style.left = `${pct}%`;
        }

        sendMediaAction(getTabId(), getMediaId(), 'SKIP_BACKWARD', { seconds: 10 });
      });
    }

    const forwardBtn = card.querySelector('.forward-btn');
    if (forwardBtn) {
      forwardBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectCard();

        const slider = card.querySelector('.seeker-slider');
        const curTimeText = card.querySelector('.current-time-text');
        const fill = card.querySelector('.seeker-fill');
        const thumb = card.querySelector('.seeker-thumb');
        if (slider) {
          const max = parseFloat(slider.max) || 100;
          const newTime = Math.min(max, (parseFloat(slider.value) || 0) + 10);
          slider.value = newTime;
          if (curTimeText) curTimeText.textContent = formatTime(newTime);
          const pct = Math.min(100, Math.max(0, (newTime / max) * 100));
          if (fill) fill.style.width = `${pct}%`;
          if (thumb) thumb.style.left = `${pct}%`;
        }

        sendMediaAction(getTabId(), getMediaId(), 'SKIP_FORWARD', { seconds: 10 });
      });
    }

    const prevBtn = card.querySelector('.prev-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectCard();
        sendMediaAction(getTabId(), getMediaId(), 'PREV_TRACK');
      });
    }

    const nextBtn = card.querySelector('.next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectCard();
        sendMediaAction(getTabId(), getMediaId(), 'NEXT_TRACK');
      });
    }

    const slider = card.querySelector('.seeker-slider');
    const fill = card.querySelector('.seeker-fill');
    const thumb = card.querySelector('.seeker-thumb');
    const curTimeText = card.querySelector('.current-time-text');

    if (slider) {
      slider.addEventListener('mousedown', () => {
        isDraggingSlider = true;
        selectCard();
      });

      slider.addEventListener('touchstart', () => {
        isDraggingSlider = true;
        selectCard();
      }, { passive: true });

      slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        const max = parseFloat(e.target.max) || 100;
        const pct = Math.min(100, Math.max(0, (val / max) * 100));

        if (fill) fill.style.width = `${pct}%`;
        if (thumb) thumb.style.left = `${pct}%`;
        if (curTimeText) curTimeText.textContent = formatTime(val);
      });

      const finishSeek = () => {
        isDraggingSlider = false;
        const targetTime = parseFloat(slider.value);
        if (!isNaN(targetTime)) {
          sendMediaAction(getTabId(), getMediaId(), 'SEEK', { currentTime: targetTime });
        }
      };

      slider.addEventListener('change', finishSeek);
      slider.addEventListener('mouseup', finishSeek);
      slider.addEventListener('touchend', finishSeek);
    }
  }

  window.addEventListener('mouseup', () => {
    isDraggingSlider = false;
  });

  window.addEventListener('touchend', () => {
    isDraggingSlider = false;
  });

  function updateQuickSettings(media) {
    if (!media) {
      globalCcToggle.checked = false;
      globalCcToggle.disabled = true;
      quickVolumeSlider.disabled = true;
      quickMuteBtn.disabled = true;
      return;
    }

    globalCcToggle.disabled = false;
    globalCcToggle.checked = !!media.subtitlesEnabled;

    quickVolumeSlider.disabled = false;
    quickMuteBtn.disabled = false;

    if (media.muted) {
      setIcon(quickVolIconContainer, 'volMute');
      quickVolumeSlider.value = 0;
      quickVolumeText.textContent = '0%';
    } else {
      const vol = media.volume !== undefined ? media.volume : 1;
      setIcon(quickVolIconContainer, vol > 0 ? 'volHigh' : 'volMute');
      quickVolumeSlider.value = vol;
      quickVolumeText.textContent = `${Math.round(vol * 100)}%`;
    }

    const currentRate = media.playbackRate || 1;
    speedChips.forEach(chip => {
      const speed = parseFloat(chip.getAttribute('data-speed'));
      if (Math.abs(speed - currentRate) < 0.05) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
  }

  globalCcToggle.addEventListener('change', () => {
    if (activeMediaItem) {
      sendMediaAction(activeMediaItem.tabId, activeMediaItem.mediaId, 'TOGGLE_SUBTITLES');
    }
  });

  toggleSettingsRow.addEventListener('click', () => {
    const isCollapsed = quickSettingsPanel.classList.toggle('collapsed');
    settingsChevron.classList.toggle('rotated', !isCollapsed);
  });

  quickVolumeSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    quickVolumeText.textContent = `${Math.round(val * 100)}%`;
    setIcon(quickVolIconContainer, val > 0 ? 'volHigh' : 'volMute');
    if (activeMediaItem) {
      activeMediaItem.volume = val;
      activeMediaItem.muted = (val === 0);
      sendMediaAction(activeMediaItem.tabId, activeMediaItem.mediaId, 'SET_VOLUME', { volume: val });
    }
  });

  quickMuteBtn.addEventListener('click', () => {
    if (activeMediaItem) {
      const willMute = !activeMediaItem.muted;
      activeMediaItem.muted = willMute;
      setIcon(quickVolIconContainer, willMute ? 'volMute' : (activeMediaItem.volume > 0 ? 'volHigh' : 'volMute'));
      if (willMute) {
        quickVolumeSlider.value = 0;
        quickVolumeText.textContent = '0%';
      } else {
        const v = activeMediaItem.volume || 1;
        quickVolumeSlider.value = v;
        quickVolumeText.textContent = `${Math.round(v * 100)}%`;
      }
      sendMediaAction(activeMediaItem.tabId, activeMediaItem.mediaId, 'TOGGLE_MUTE');
    }
  });

  speedChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const speed = parseFloat(chip.getAttribute('data-speed'));
      speedChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      if (activeMediaItem) {
        activeMediaItem.playbackRate = speed;
        sendMediaAction(activeMediaItem.tabId, activeMediaItem.mediaId, 'SET_RATE', { rate: speed });
      }
    });
  });

  browser.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'MEDIA_STATE_CHANGED') {
      renderMediaCards(message.allMedia);
    }
  });

  function init() {
    browser.runtime.sendMessage({ type: 'GET_ALL_MEDIA' }).then(response => {
      if (response && response.media) {
        renderMediaCards(response.media);
      }
    }).catch(err => {
      console.warn('MediaDeck: Initial fetch error', err);
    });
  }

  init();
})();
