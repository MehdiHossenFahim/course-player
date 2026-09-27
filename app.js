/* A browser-only course player. It reads the folder the learner chooses; no video files are copied. */
const state = { lessons: [], activeIndex: -1, completed: new Set(), currentUrl: null, captionsOn: true };
const els = {
  open: document.querySelectorAll('#openFolderBtn, #welcomeOpenBtn'), input: document.querySelector('#folderInput'),
  welcome: document.querySelector('#welcomePanel'), layout: document.querySelector('#playerLayout'), video: document.querySelector('#videoPlayer'),
  empty: document.querySelector('#emptyPlayer'), title: document.querySelector('#lessonTitle'), number: document.querySelector('#lessonNumber'),
  breadcrumb: document.querySelector('#breadcrumb'), complete: document.querySelector('#completeBtn'), previous: document.querySelector('#previousBtn'),
  next: document.querySelector('#nextBtn'), sections: document.querySelector('#sectionList'), search: document.querySelector('#searchInput'),
  label: document.querySelector('#progressLabel'), percent: document.querySelector('#progressPercent'), bar: document.querySelector('#progressBar'), courseName: document.querySelector('#courseName'), caption: document.querySelector('#captionBtn')
};

const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const isVideo = name => /\.mp4$/i.test(name);
const isCaption = name => /_en\.vtt$/i.test(name);
const cleanTitle = name => name.replace(/^\d+\s+/, '').replace(/\.mp4$/i, '');
const courseKey = () => `course-player:${state.lessons[0]?.course || 'default'}`;

function normalizePath(path) { return path.replace(/\\/g, '/').toLowerCase().replace(/_en\.vtt$|\.mp4$/, ''); }
function displaySection(folder) { return folder.replace(/^\d+\s*-\s*/, ''); }

async function selectFolder() {
  if ('showDirectoryPicker' in window) {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      const files = await readDirectory(handle);
      loadCourse(files, handle.name);
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }
  els.input.click();
}

async function readDirectory(handle, prefix = '') {
  const files = [];
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind === 'file' && (isVideo(name) || isCaption(name))) files.push({ file: await entry.getFile(), path: `${prefix}${name}` });
    if (entry.kind === 'directory') files.push(...await readDirectory(entry, `${prefix}${name}/`));
  }
  return files;
}

function fromInput(fileList) {
  return [...fileList].filter(file => isVideo(file.name) || isCaption(file.name)).map(file => ({ file, path: file.webkitRelativePath || file.name }));
}

function loadCourse(entries, courseName) {
  const captions = new Map(entries.filter(item => isCaption(item.file.name)).map(item => [normalizePath(item.path), item.file]));
  state.lessons = entries.filter(item => isVideo(item.file.name)).map(item => {
    const parts = item.path.split('/');
    const folder = parts.length > 1 ? parts[parts.length - 2] : 'Course videos';
    return { file: item.file, path: item.path, course: courseName, section: displaySection(folder), sectionOrder: folder, title: cleanTitle(item.file.name), caption: captions.get(normalizePath(item.path)) };
  }).sort((a, b) => natural.compare(a.sectionOrder, b.sectionOrder) || natural.compare(a.path, b.path));
  state.completed = new Set(JSON.parse(localStorage.getItem(courseKey()) || '[]'));
  state.activeIndex = -1;
  els.courseName.textContent = courseName;
  els.welcome.hidden = true;
  els.layout.hidden = false;
  renderSections();
  updateProgress();
  if (state.lessons.length) activateLesson(0);
}

function renderSections() {
  // Avoid relying on newer collection helpers so the player works in older Chromium browsers too.
  const groups = new Map();
  state.lessons.forEach(lesson => {
    if (!groups.has(lesson.section)) groups.set(lesson.section, []);
    groups.get(lesson.section).push(lesson);
  });
  els.sections.replaceChildren();
  for (const [section, lessons] of groups) {
    const node = document.querySelector('#sectionTemplate').content.cloneNode(true);
    const details = node.querySelector('details');
    node.querySelector('.section-title').textContent = section;
    node.querySelector('.section-count').textContent = `${lessons.length} lessons`;
    const list = node.querySelector('.lesson-list');
    lessons.forEach(lesson => {
      const index = state.lessons.indexOf(lesson);
      const button = document.createElement('button');
      button.className = 'lesson'; button.type = 'button'; button.dataset.index = index;
      button.innerHTML = '<span class="lesson-status" aria-hidden="true"></span><span></span>';
      button.lastElementChild.textContent = lesson.title;
      button.addEventListener('click', () => activateLesson(index));
      list.append(button);
    });
    els.sections.append(details);
  }
  syncLessonStates();
}

function activateLesson(index) {
  const lesson = state.lessons[index];
  if (!lesson) return;
  if (state.currentUrl) URL.revokeObjectURL(state.currentUrl);
  state.currentUrl = URL.createObjectURL(lesson.file);
  els.video.src = state.currentUrl;
  els.video.replaceChildren();
  if (lesson.caption) { const track = document.createElement('track'); track.kind = 'subtitles'; track.label = 'English'; track.srclang = 'en'; track.src = URL.createObjectURL(lesson.caption); track.default = true; els.video.append(track); }
  state.activeIndex = index;
  els.empty.hidden = true; els.title.textContent = lesson.title; els.number.textContent = `LESSON ${index + 1} OF ${state.lessons.length}`;
  els.breadcrumb.textContent = `${lesson.course} / ${lesson.section}`;
  els.complete.disabled = false; els.previous.disabled = index === 0; els.next.disabled = index === state.lessons.length - 1;
  els.caption.disabled = !lesson.caption; updateCaptions();
  syncLessonStates(); updateCompleteButton();
  els.video.play().catch(() => {});
}

function toggleComplete() {
  const lesson = state.lessons[state.activeIndex]; if (!lesson) return;
  if (state.completed.has(lesson.path)) state.completed.delete(lesson.path); else state.completed.add(lesson.path);
  localStorage.setItem(courseKey(), JSON.stringify([...state.completed])); syncLessonStates(); updateCompleteButton(); updateProgress();
}
function updateCompleteButton() { const done = state.completed.has(state.lessons[state.activeIndex]?.path); els.complete.textContent = done ? 'Completed ✓' : 'Mark as complete'; els.complete.classList.toggle('is-complete', done); }
function updateCaptions() { const track = els.video.textTracks[0]; if (track) track.mode = state.captionsOn ? 'showing' : 'disabled'; els.caption.setAttribute('aria-pressed', String(state.captionsOn && !!track)); els.caption.title = state.captionsOn ? 'Turn captions off' : 'Turn captions on'; }
function syncLessonStates() { document.querySelectorAll('.lesson').forEach(button => { const lesson = state.lessons[button.dataset.index]; button.classList.toggle('active', Number(button.dataset.index) === state.activeIndex); button.classList.toggle('done', state.completed.has(lesson.path)); }); }
function updateProgress() { const total = state.lessons.length, done = state.completed.size, pct = total ? Math.round(done / total * 100) : 0; els.label.textContent = `${done} of ${total} completed`; els.percent.textContent = `${pct}%`; els.bar.style.width = `${pct}%`; }
function searchLessons(query) { const value = query.trim().toLowerCase(); document.querySelectorAll('.lesson').forEach(button => { const show = button.textContent.toLowerCase().includes(value); button.classList.toggle('hidden', !show); }); document.querySelectorAll('.course-section').forEach(section => section.classList.toggle('hidden', !!value && !section.querySelector('.lesson:not(.hidden)'))); }

els.open.forEach(button => button.addEventListener('click', selectFolder));
els.input.addEventListener('change', event => { if (event.target.files.length) loadCourse(fromInput(event.target.files), 'Selected course'); });
els.complete.addEventListener('click', toggleComplete);
els.caption.addEventListener('click', () => { state.captionsOn = !state.captionsOn; updateCaptions(); });
els.previous.addEventListener('click', () => activateLesson(state.activeIndex - 1));
els.next.addEventListener('click', () => activateLesson(state.activeIndex + 1));
els.search.addEventListener('input', event => searchLessons(event.target.value));
els.video.addEventListener('ended', () => { if (state.activeIndex < state.lessons.length - 1) activateLesson(state.activeIndex + 1); });
