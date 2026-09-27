# 🎬 Course Player

**Stop juggling file explorer, VLC, and your code editor just to watch a lesson.**

Course Player turns any folder of local video lessons into a real learning dashboard — right in your browser. Pick a folder once, and it remembers your progress, resumes exactly where you left off, and shows you how much of the course you've actually finished (spoiler: probably less than you think).

No uploads. No accounts. No servers. Your files never leave your machine — ever.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Try%20it%20now-2ea44f?style=for-the-badge)](https://course-player-omega.vercel.app/)
[![View Code](https://img.shields.io/badge/Code-GitHub-181717?style=for-the-badge&logo=github)](https://github.com/MehdiHossenFahim/course-player)

---

## Why this exists

If you learn to code from downloaded video lessons, you know the drill:

- 📁 Dig through folders to find "which video was I on again"
- 🎬 Open it in a random media player
- 💻 Alt-tab to your code editor
- 🔁 Forget your progress the second you close your laptop

Course Player fixes that. One folder in, one clean learning interface out.

## Features

- Plays your local course videos directly in the browser — nothing leaves your device
- Automatically builds a course outline from your folder structure
- Groups lessons into sections and sorts numbered files in natural order
- Marks a lesson complete automatically when the video finishes
- Resumes every video from its last saved position — even after closing the browser
- Supports multiple course folders in one session, switch between them anytime
- Shows overall completion %, total course time, and time remaining
- Per-course reset for progress and saved positions
- Dark mode that actually remembers you chose it
- Subtitle support: matching `.vtt` files and embedded caption tracks, toggle with one click
- Previous/next lesson navigation
- Fully responsive — desktop or laptop, doesn't matter

## Run it locally

1. Download or clone this repository.
2. Open `index.html` in a current version of **Google Chrome** or **Microsoft Edge**.
3. Click **Choose course folder**.
4. Select the top-level folder containing your course sections and video files.

The player reads that folder only for your current browser session. Nothing is copied, uploaded, or sent anywhere. Use **Add course** to load another folder and switch between them from the course selector in the header.

### Privacy, for real

No videos, captions, progress, or playback positions are ever uploaded. Everything lives in your browser's `localStorage`, under a private Course Player key, on your device, full stop.

Because of browser security rules, a page can't automatically reopen a local folder after a full browser restart — that's a browser limitation, not a bug. Just pick the same folder again and the player will match it right back to your saved progress.

## Course folder structure

Course Player treats subfolders as sections and sorts numbered names naturally:

```text
My Course/
├── 01 - Introduction/
│   ├── 001 Welcome.mp4
│   └── 001 Welcome_en.vtt
├── 02 - Getting Started/
│   └── 001 Setup.mp4
└── 03 - Final Project/
    └── 001 Build the project.mp4
```

For subtitles, place a `.vtt` file next to its video with the same name plus `_en.vtt`. The CC button also auto-detects caption tracks embedded in compatible MP4 files.

## Project structure

```text
.
├── index.html     # Page structure
├── app.js         # Local folder reader, player controls, captions, and persistence
├── tailwind.css   # Tailwind source and small custom component rules
├── styles.css     # Compiled production stylesheet
├── package.json   # Tailwind build command
└── README.md
```

## Browser support

Chrome and Edge give the full experience since they support the folder picker this app relies on. Other browsers can use the built-in folder-selection fallback where available.

## Contributing

Found a bug, or have an idea that would make this better? Issues and pull requests are welcome — this is very much a living project.

## License

MIT — use it, fork it, adapt it for your own course library. See [LICENSE](LICENSE) for details.
