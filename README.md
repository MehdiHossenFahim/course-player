# Course Player

A clean, browser-based learning interface for locally stored video courses. It turns a folder of lessons into a focused course experience: an in-page video player, structured sections, subtitles, lesson search, and saved progress.

## Features

- Plays course videos directly in the browser
- Builds the course outline automatically from the selected folder structure
- Groups lessons into sections and orders numbered files naturally
- Displays matching English `.vtt` subtitle files with a CC on/off toggle
- Includes previous and next lesson navigation
- Lets learners mark lessons complete and tracks overall progress
- Saves progress in the browser using `localStorage`
- Works without uploading or copying course videos
- Responsive layout for desktop and smaller screens

## Run locally

1. Download or clone this repository.
2. Open `index.html` in a current version of **Google Chrome** or **Microsoft Edge**.
3. Select **Choose course folder**.
4. Choose the top-level folder that contains your course sections and MP4 files.

The player reads that folder only in your browser session. Your videos remain on your computer.

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

For subtitles, place the WebVTT file beside the video and use the same name followed by `_en.vtt`.

## Publishing on GitHub Pages

Push these project files to a GitHub repository, then enable **Settings → Pages** and publish from your chosen branch. The interface will be live as a static site.

For privacy and browser security, a published site cannot automatically read a visitor’s computer. Each visitor chooses their own course folder after opening the site; no course files are sent to GitHub Pages or this project.

## Project structure

```text
.
├── index.html     # Page structure
├── styles.css     # Responsive visual design
└── app.js         # Folder reader, player controls, subtitles, and progress
```

## Browser support

Chrome and Edge provide the best experience because they support the folder picker used by the app. Other browsers can use the built-in folder-selection fallback where supported.

## License

Use, adapt, and personalize this project for your own course library.
