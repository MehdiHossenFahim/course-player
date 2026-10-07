# Local Course Player

A sleek, purely local, browser-based minimalist course player built with **React**, **Vite**, and **Tailwind CSS v4**.

![Local Course Player Demo](public/demo.jpg) *(Replace with actual screenshot if available)*

## Features

- **100% Local & Private**: No backend, no accounts, no data leaves your browser. Plays local videos directly from your disk using the File System Access API.
- **Wide Format Support**: Supports playback of `.mp4`, `.webm`, and `.mkv` video files.
- **Automatic Captions**: Automatically detects and loads `_en.vtt` or `_en.srt` subtitle files in the same directory.
- **Progress Tracking**: Remembers your exact watch position for every video, tracks overall course duration, and marks lessons as completed.
- **Recent Courses**: The Home screen shows a grid of your recently opened courses. Thanks to IndexedDB, you can simply click to reopen a previous folder (after a standard browser security prompt).
- **Auto Thumbnails**: Automatically captures the exact frame where you paused the video and uses it as the course thumbnail on the Home screen.
- **Minimalist Aesthetic**: Features a beautiful monochromatic "zinc" UI with support for both Light and Dark modes.

## Security & Privacy Note

Modern web browsers have strict security models that **do not allow** websites to maintain persistent read access to local folders across page reloads. 

When returning to the app and clicking a "Recent Course", the browser will prompt you to quickly grant permission again. This is a mandatory browser security feature designed to keep your local files safe from malicious websites.

## Development

To run the application locally:

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

## Deployment (Vercel)

This project is a standard Vite + React Single Page Application (SPA), fully ready for deployment on **Vercel**.

1. Push the repository to GitHub.
2. Import the project in Vercel.
3. Vercel will automatically detect the **Vite** framework.
4. The build command will default to `npm run build` and output directory to `dist`.
5. Deploy!

### Note on Vercel
Because the application strictly accesses local files on the user's computer via the File System Access API, no heavy storage or backend processing is needed. Vercel only serves the static HTML/JS/CSS assets.

## License

MIT License. See `LICENSE` for more information.
