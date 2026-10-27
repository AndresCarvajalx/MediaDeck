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
  const quickVolIcon = document.getElementById('quick-vol-icon');
  const speedChips = document.querySelectorAll('.chip');

  let currentMediaList = [];
  let isDraggingSlider = false;
  let activeMediaItem = null;

  const ICONS = {
    play: `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>`,
    pause: `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"/></svg>`,
    prev: `<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" fill="currentColor"/></svg>`,
    next: `<svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" fill="currentColor"/></svg>`,
    rewind10: `<svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
      <text x="12" y="14.8" font-size="7" font-weight="bold" font-family="system-ui, sans-serif" text-anchor="middle" fill="currentColor">10</text>
    </svg>`,
    forward10: `<svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
      <text x="12" y="14.8" font-size="7" font-weight="bold" font-family="system-ui, sans-serif" text-anchor="middle" fill="currentColor">10</text>
    </svg>`,
    pip: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="5" width="18" height="14" rx="2"/>
      <rect x="13" y="11" width="6" height="6" rx="1" fill="currentColor"/>
    </svg>`,
    focusTab: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>`,
    musicNote: `<svg class="artwork-placeholder" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" fill="currentColor" />
      <circle cx="18" cy="16" r="3" fill="currentColor" />
    </svg>`,
    volHigh: `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />`,
    volMute: `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"/>
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />`
  };

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
      mediaListContainer.innerHTML = '';
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
    const card = document.createElement('div');
    card.className = 'media-card';
    card.setAttribute('data-tab-id', media.tabId);
    card.setAttribute('data-media-id', media.mediaId);

    const duration = media.duration || 0;
    const currentTime = media.currentTime || 0;
    const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

    const faviconSrc = media.tabFavicon || media.favicon || `https://www.google.com/s2/favicons?domain=${media.domain}&sz=32`;

    card.innerHTML = `
      <div class="card-top">
        <div class="artwork-container" title="Ir a pestaña">
          ${media.artwork
            ? `<img class="artwork-img" src="${escapeHTML(media.artwork)}" alt="Cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
               <div style="display:none;">${ICONS.musicNote}</div>`
            : ICONS.musicNote
          }
        </div>

        <div class="media-details">
          <div class="source-header">
            <div class="domain-badge" title="Ir a ${escapeHTML(media.domain)}">
              <img class="domain-favicon" src="${escapeHTML(faviconSrc)}" onerror="this.style.display='none'">
              <span class="domain-name">${escapeHTML(media.domain)}</span>
            </div>
            <div class="top-actions">
              ${media.canPiP ? `
                <button class="btn-icon-subtle pip-btn ${media.isPiP ? 'active' : ''}" title="${media.isPiP ? 'Salir de Picture-in-Picture' : 'Activar Picture-in-Picture'}">
                  ${ICONS.pip}
                </button>
              ` : ''}
              <button class="btn-icon-subtle focus-tab-btn" title="Ir a la pestaña">
                ${ICONS.focusTab}
              </button>
            </div>
          </div>

          <div class="media-title" title="${escapeHTML(media.title)}">${escapeHTML(media.title)}</div>
          <div class="media-artist" title="${escapeHTML(media.artist)}">${escapeHTML(media.artist)}</div>
        </div>

        <button class="btn-play-pause" title="${media.paused ? 'Reproducir' : 'Pausar'}">
          ${media.paused ? ICONS.play : ICONS.pause}
        </button>
      </div>

      <div class="card-controls">
        <button class="control-btn prev-btn" title="Anterior">
          ${ICONS.prev}
        </button>
        <button class="control-btn rewind-btn" title="Rebobinar 10s">
          ${ICONS.rewind10}
        </button>

        <div class="seeker-container">
          <div class="seeker-track">
            <div class="seeker-fill" style="width: ${progressPct}%"></div>
            <div class="seeker-thumb" style="left: ${progressPct}%"></div>
          </div>
          <input type="range" class="seeker-slider" min="0" max="${duration || 100}" step="0.5" value="${currentTime}">
          <div class="seeker-times">
            <span class="current-time-text">${formatTime(currentTime)}</span>
            <span class="duration-text">${media.isLive ? 'EN VIVO' : formatTime(duration)}</span>
          </div>
        </div>

        <button class="control-btn forward-btn" title="Adelantar 10s">
          ${ICONS.forward10}
        </button>
        <button class="control-btn next-btn" title="Siguiente">
          ${ICONS.next}
        </button>
      </div>
    `;

    attachCardEventListeners(card, media);
    return card;
  }

  function updateCardElement(card, media) {
    card.setAttribute('data-tab-id', media.tabId);
    card.setAttribute('data-media-id', media.mediaId);

    const playPauseBtn = card.querySelector('.btn-play-pause');
    if (playPauseBtn) {
      playPauseBtn.innerHTML = media.paused ? ICONS.play : ICONS.pause;
      playPauseBtn.title = media.paused ? 'Reproducir' : 'Pausar';
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

    // PiP Button
    const pipBtn = card.querySelector('.pip-btn');
    if (pipBtn) {
      pipBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectCard();
        pipBtn.classList.toggle('active');
        sendMediaAction(getTabId(), getMediaId(), 'TOGGLE_PIP');
      });
    }

    // Play / Pause Button with immediate optimistic feedback
    const playPauseBtn = card.querySelector('.btn-play-pause');
    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectCard();

        const isCurrentlyPaused = playPauseBtn.innerHTML.includes('M8 5v14l11-7z');
        playPauseBtn.innerHTML = isCurrentlyPaused ? ICONS.pause : ICONS.play;
        playPauseBtn.title = isCurrentlyPaused ? 'Pausar' : 'Reproducir';
        media.paused = !isCurrentlyPaused;

        sendMediaAction(getTabId(), getMediaId(), 'TOGGLE_PLAY');
      });
    }

    // Rewind 10s with immediate UI response
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

    // Forward 10s with immediate UI response
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

    // Previous Track
    const prevBtn = card.querySelector('.prev-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectCard();
        sendMediaAction(getTabId(), getMediaId(), 'PREV_TRACK');
      });
    }

    // Next Track
    const nextBtn = card.querySelector('.next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectCard();
        sendMediaAction(getTabId(), getMediaId(), 'NEXT_TRACK');
      });
    }

    // Slider Drag & Seek
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
      quickVolIcon.innerHTML = ICONS.volMute;
      quickVolumeSlider.value = 0;
      quickVolumeText.textContent = '0%';
    } else {
      const vol = media.volume !== undefined ? media.volume : 1;
      quickVolIcon.innerHTML = vol > 0 ? ICONS.volHigh : ICONS.volMute;
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
    quickVolIcon.innerHTML = val > 0 ? ICONS.volHigh : ICONS.volMute;
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
      quickVolIcon.innerHTML = willMute ? ICONS.volMute : (activeMediaItem.volume > 0 ? ICONS.volHigh : ICONS.volMute);
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

  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
