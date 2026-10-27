# MediaDeck for Firefox

> **Author:** [AndresCarvajalx](https://github.com/AndresCarvajalx/MediaDeck)  
> **Version:** 1.0.0  
> **Compatibility:** Mozilla Firefox (Manifest V3)

**MediaDeck** is a modern and clean Firefox extension inspired by Chromium's Global Media Controls. It allows you to control audio and video playback across all your open tabs directly from a unified toolbar popup.

---

## Features

- **Universal Media Control:** Automatically detects `<video>` and `<audio>` elements across YouTube, Twitch, Spotify Web, SoundCloud, Vimeo, Netflix, and any website using an HTML5 media player.
- **Play and Pause:** Centered primary playback control with real-time state synchronization.
- **Rewind and Fast-Forward:** Dedicated buttons to skip backward 10 seconds or jump forward 10 seconds.
- **Interactive Timeline:** Responsive progress bar with a pill-style scrubber thumb to seek playback by dragging or clicking. Displays current elapsed time and total duration (or "LIVE" indicator for live streams).
- **Picture-in-Picture (PiP):** Instantly toggle Picture-in-Picture floating windows directly from the card button without intrusive prompts.
- **Focus Tab:** Switch immediately to the tab playing the media by clicking its thumbnail, title, or the window focus button.
- **Track Navigation (Previous / Next):** Full playlist navigation support for platforms implementing the MediaSession API (YouTube, Spotify, etc.).
- **Closed Captions (CC):** Bottom-bar toggle to enable or disable captions where supported.
- **Volume and Mute Control:** Dedicated slider and toggle button to adjust volume or mute the active media item.
- **Playback Speed Selector:** Quick speed selector chips (0.75x, 1.0x, 1.25x, 1.5x, 2.0x).
- **Dark Theme Interface:** Clean, native-feeling dark theme styled with subtle borders and purple accent highlights.

---

## Project Structure

```text
MediaDeck/
├── manifest.json              # Extension configuration (Firefox Manifest V3)
├── background/
│   └── background.js          # Central media and tab coordination
├── content/
│   └── content.js             # In-page HTML5 media and MediaSession listener
├── popup/
│   ├── popup.html             # Toolbar popup markup
│   ├── popup.css              # Dark theme styling and UI layout
│   └── popup.js               # Popup player logic, event handling, and controls
├── icons/
│   ├── icon.svg               # Scalable vector icon
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
├── LICENSE                    # MIT License
└── README.md
```

---

## Installation and Testing in Firefox

1. Open **Mozilla Firefox**.
2. Navigate to the following address in your URL bar:
   ```text
   about:debugging#/runtime/this-firefox
   ```
   *(or open `about:debugging` and select **"This Firefox"** from the left sidebar).*
3. Click on the **"Load Temporary Add-on..."** button.
4. Navigate to the project directory and select the `manifest.json` file.
5. The **MediaDeck** icon will appear in your Firefox toolbar ready for use.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Credits

Developed by **AndresCarvajalx** ([GitHub](https://github.com/AndresCarvajalx/MediaDeck)).
