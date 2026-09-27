# Course Player

A polished, browser-based learning interface for locally stored video courses. It turns a folder of lessons into a focused course experience with private progress tracking, playback resume, accessible captions, and zero video uploads.

## Features

- Plays course videos directly in the browser
- Builds the course outline automatically from the selected folder structure
- Groups lessons into sections and orders numbered files naturally
- Automatically marks a lesson complete when its video finishes
- Resumes each video from its last saved position, including after the browser is closed
- Supports multiple course folders in one browser session
- Displays overall completion, total course time, and remaining learning time
- Offers a per-course reset control for progress and saved playback positions
- Includes a saved dark-mode preference
- Supports matching English `.vtt` subtitle files and embedded subtitle/caption tracks through a CC on/off control
- Includes previous and next lesson navigation
- Stores preferences, progress, positions, and calculated durations in local browser storage
- Works without uploading or copying course videos
- Uses a locally compiled Tailwind CSS build, ready for static hosting
- Responsive layout for desktop and smaller screens

## Run locally

1. Download or clone this repository.
2. Open `index.html` in a current version of **Google Chrome** or **Microsoft Edge**.
3. Select **Choose course folder**.
4. Choose the top-level folder that contains your course sections and MP4 files.

The player reads that folder only in your browser session. Your videos remain on your computer. You can use **Add course** to load another folder and switch between loaded courses from the course selector in the header.

### Privacy and saved data

No course videos, captions, progress, or playback positions are uploaded. The app stores its learner data in your browser's `localStorage` under a private Course Player key.

For browser-security reasons, a page cannot reopen a local folder automatically after a full browser restart. Choose the same folder again and the player will match it to its saved local progress and resume position.

## Course folder structure

The player uses subfolders as course sections. Numbered folder and video names are sorted in their natural order.

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

For sidecar subtitles, place the WebVTT file beside the video and use the same name followed by `_en.vtt`. The CC button also detects and controls caption tracks embedded inside compatible MP4 files.

## Publishing on GitHub Pages

The committed `styles.css` is already the production-ready Tailwind output. To change the Tailwind source later, run `npm install` once, then run:

```bash
npm run build:css
```

Push the project files to a GitHub repository, then enable **Settings → Pages** and publish from your chosen branch. The interface will be live as a static site.

For privacy and browser security, a published site cannot automatically read a visitor’s computer. Each visitor chooses their own course folder after opening the site; no course files are sent to GitHub Pages or this project.

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

Chrome and Edge provide the best experience because they support the folder picker used by the app. Other browsers can use the built-in folder-selection fallback where supported.

## License

Use, adapt, and personalize this project for your own course library.
