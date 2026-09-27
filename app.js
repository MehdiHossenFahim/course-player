/*
  Course Player runs entirely in the browser. Videos are read only after a learner
  chooses a folder; progress, playback positions, preferences, and durations live
  in this browser's localStorage.
*/
const STORAGE_KEY = 'course-player-data-v3';
const state = {
  courses: new Map(), activeCourseId: null, currentVideoUrl: null, currentTrackUrls: [],
  pendingResume: 0, lastPositionSavedAt: 0, durationJobs: new Set()
};

const els = {
  root: document.documentElement, theme: document.querySelector('#themeBtn'), themeIcon: document.querySelector('#themeIcon'),
  open: document.querySelectorAll('#openFolderBtn, #welcomeOpenBtn'), input: document.querySelector('#folderInput'),
  courseSelect: document.querySelector('#courseSelect'), welcome: document.querySelector('#welcomePanel'), layout: document.querySelector('#playerLayout'),
  savedNotice: document.querySelector('#savedCoursesNotice'), video: document.querySelector('#videoPlayer'), empty: document.querySelector('#emptyPlayer'),
  caption: document.querySelector('#captionBtn'), breadcrumb: document.querySelector('#breadcrumb'), lessonNumber: document.querySelector('#lessonNumber'),
  title: document.querySelector('#lessonTitle'), resumeHint: document.querySelector('#resumeHint'), complete: document.querySelector('#completeBtn'),
  previous: document.querySelector('#previousBtn'), next: document.querySelector('#nextBtn'), reset: document.querySelector('#resetBtn'),
  search: document.querySelector('#searchInput'), sections: document.querySelector('#sectionList'), progressLabel: document.querySelector('#progressLabel'),
  progressPercent: document.querySelector('#progressPercent'), progressBar: document.querySelector('#progressBar'), courseTime: document.querySelector('#courseTime')
};

const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const isVideo = name => /\.mp4$/i.test(name);
const isCaption = name => /_en\.vtt$/i.test(name);
const normalizePath = path => path.replace(/\\/g, '/').toLowerCase().replace(/_en\.vtt$|\.mp4$/, '');
const cleanTitle = name => name.replace(/^\d+\s+/, '').replace(/\.mp4$/i, '');
const displaySection = folder => folder.replace(/^\d+\s*-\s*/, '');

function loadStore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { preferences: { theme: saved.preferences?.theme || 'light', captionsEnabled: saved.preferences?.captionsEnabled !== false }, courses: saved.courses || {} };
  } catch { return { preferences: { theme: 'light', captionsEnabled: true }, courses: {} }; }
}
const store = loadStore();
function saveStore() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* Local browser storage can be disabled by the user. */ } }

function hash(value) {
  let result = 5381;
  for (let index = 0; index < value.length; index += 1) result = ((result << 5) + result) ^ value.charCodeAt(index);
  return (result >>> 0).toString(36);
}
function activeCourse() { return state.courses.get(state.activeCourseId); }
function courseRecord(course) {
  if (!store.courses[course.id]) store.courses[course.id] = { name: course.name, completed: [], positions: {}, durations: {}, lastLessonId: null, lastOpened: Date.now() };
  return store.courses[course.id];
}
function formatDuration(value) {
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60), secs = seconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m`;
  return secs ? `${secs}s` : '—';
}
function formatPosition(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function applyTheme() {
  const dark = store.preferences.theme === 'dark';
  els.root.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]').content = dark ? '#020617' : '#f8fafc';
  els.themeIcon.textContent = dark ? '☀' : '◐';
  els.theme.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
  els.theme.setAttribute('aria-label', els.theme.title);
}

async function selectFolder() {
  if ('showDirectoryPicker' in window) {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      addCourse(await readDirectory(handle), handle.name);
      return;
    } catch (error) { if (error.name === 'AbortError') return; }
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

function addCourse(entries, courseName) {
  const captions = new Map(entries.filter(entry => isCaption(entry.file.name)).map(entry => [normalizePath(entry.path), entry.file]));
  const lessons = entries.filter(entry => isVideo(entry.file.name)).map(entry => {
    const parts = entry.path.split('/');
    const folder = parts.length > 1 ? parts.at(-2) : 'Course videos';
    return { id: `${entry.path}:${entry.file.size}:${entry.file.lastModified}`, file: entry.file, path: entry.path, title: cleanTitle(entry.file.name), section: displaySection(folder), sectionOrder: folder, caption: captions.get(normalizePath(entry.path)) };
  }).sort((first, second) => natural.compare(first.sectionOrder, second.sectionOrder) || natural.compare(first.path, second.path));
  if (!lessons.length) { alert('No MP4 videos were found in that folder.'); return; }
  const id = hash(`${courseName}|${lessons.map(lesson => lesson.id).join('|')}`);
  const course = { id, name: courseName, lessons, activeIndex: -1, completed: new Set() };
  const record = courseRecord(course);
  record.name = courseName; record.lastOpened = Date.now();
  course.completed = new Set((record.completed || []).filter(lessonId => lessons.some(lesson => lesson.id === lessonId)));
  state.courses.set(id, course);
  saveStore(); renderCourseSelect(); setActiveCourse(id);
}

function renderCourseSelect() {
  els.courseSelect.replaceChildren();
  for (const course of state.courses.values()) {
    const option = document.createElement('option'); option.value = course.id; option.textContent = course.name; els.courseSelect.append(option);
  }
  els.courseSelect.disabled = state.courses.size === 0;
  if (state.activeCourseId) els.courseSelect.value = state.activeCourseId;
}
function setActiveCourse(id) {
  savePlaybackPosition();
  state.activeCourseId = id;
  const course = activeCourse(); if (!course) return;
  const record = courseRecord(course); record.lastOpened = Date.now(); saveStore();
  els.welcome.hidden = true; els.layout.hidden = false; els.courseSelect.value = id; els.search.value = '';
  renderSections(); updateProgress();
  const lastIndex = course.lessons.findIndex(lesson => lesson.id === record.lastLessonId);
  activateLesson(lastIndex >= 0 ? lastIndex : 0, false);
  measureMissingDurations(course);
}

function clearPlayerSource() {
  if (state.currentVideoUrl) URL.revokeObjectURL(state.currentVideoUrl);
  state.currentTrackUrls.forEach(URL.revokeObjectURL); state.currentTrackUrls = []; state.currentVideoUrl = null;
  els.video.pause(); els.video.replaceChildren(); els.video.removeAttribute('src'); els.video.load();
}
function activateLesson(index, shouldPlay = true) {
  const course = activeCourse(), lesson = course?.lessons[index]; if (!lesson) return;
  savePlaybackPosition(); clearPlayerSource();
  const record = courseRecord(course);
  state.currentVideoUrl = URL.createObjectURL(lesson.file); els.video.src = state.currentVideoUrl;
  if (lesson.caption) {
    const track = document.createElement('track'); track.kind = 'subtitles'; track.label = 'English'; track.srclang = 'en'; track.default = store.preferences.captionsEnabled;
    const trackUrl = URL.createObjectURL(lesson.caption); track.src = trackUrl; state.currentTrackUrls.push(trackUrl); els.video.append(track);
  }
  course.activeIndex = index; record.lastLessonId = lesson.id; record.lastOpened = Date.now(); state.pendingResume = Number(record.positions?.[lesson.id]) || 0;
  saveStore(); els.empty.hidden = true;
  els.breadcrumb.textContent = `${course.name} / ${lesson.section}`;
  els.lessonNumber.textContent = `LESSON ${index + 1} OF ${course.lessons.length}`;
  els.title.textContent = lesson.title;
  els.resumeHint.textContent = state.pendingResume > 0 ? `Resume from ${formatPosition(state.pendingResume)}` : '';
  els.complete.disabled = false; els.previous.disabled = index === 0; els.next.disabled = index === course.lessons.length - 1;
  syncLessonStates(); updateCompleteButton(); refreshCaptionControl();
  els.video.load();
  if (shouldPlay) els.video.play().catch(() => {});
}

function renderSections() {
  const course = activeCourse(); if (!course) return;
  const record = courseRecord(course), groups = new Map();
  course.lessons.forEach(lesson => { if (!groups.has(lesson.section)) groups.set(lesson.section, []); groups.get(lesson.section).push(lesson); });
  els.sections.replaceChildren();
  for (const [section, lessons] of groups) {
    const fragment = document.querySelector('#sectionTemplate').content.cloneNode(true), details = fragment.querySelector('details');
    fragment.querySelector('.section-title').textContent = section;
    const duration = lessons.reduce((total, lesson) => total + (Number(record.durations?.[lesson.id]) || 0), 0);
    const known = lessons.filter(lesson => record.durations?.[lesson.id] > 0).length;
    fragment.querySelector('.section-count').textContent = known === lessons.length ? `${lessons.length} · ${formatDuration(duration)}` : `${lessons.length} lessons`;
    const list = fragment.querySelector('.lesson-list');
    lessons.forEach(lesson => {
      const index = course.lessons.indexOf(lesson), button = document.createElement('button');
      button.type = 'button'; button.dataset.index = index;
      button.className = 'lesson flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-[13px] leading-5 text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800';
      const status = document.createElement('span'); status.className = 'lesson-status mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-slate-300 text-[10px] dark:border-slate-600'; status.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span'); label.className = 'min-w-0 flex-1'; label.textContent = lesson.title;
      const time = document.createElement('span'); time.className = 'shrink-0 text-[11px] text-slate-400'; time.textContent = record.durations?.[lesson.id] ? formatDuration(record.durations[lesson.id]) : '';
      button.append(status, label, time); button.addEventListener('click', () => activateLesson(index)); list.append(button);
    });
    els.sections.append(details);
  }
  syncLessonStates();
}

function updateCompleteButton() {
  const course = activeCourse(), lesson = course?.lessons[course.activeIndex], complete = lesson && course.completed.has(lesson.id);
  els.complete.textContent = complete ? 'Completed ✓' : 'Mark complete';
  els.complete.classList.toggle('border-emerald-300', !!complete); els.complete.classList.toggle('bg-emerald-50', !!complete); els.complete.classList.toggle('text-emerald-800', !!complete);
}
function syncLessonStates() {
  const course = activeCourse(); if (!course) return;
  document.querySelectorAll('.lesson').forEach(button => {
    const lesson = course.lessons[Number(button.dataset.index)], active = course.activeIndex === Number(button.dataset.index), done = course.completed.has(lesson.id);
    button.classList.toggle('bg-blue-50', active); button.classList.toggle('text-blue-800', active); button.classList.toggle('dark:bg-blue-950/50', active); button.classList.toggle('dark:text-blue-200', active); button.classList.toggle('font-semibold', active);
    const status = button.querySelector('.lesson-status'); status.textContent = done ? '✓' : ''; status.classList.toggle('border-emerald-600', done); status.classList.toggle('bg-emerald-600', done); status.classList.toggle('text-white', done);
  });
}
function updateProgress() {
  const course = activeCourse(); if (!course) return;
  const record = courseRecord(course), total = course.lessons.length, done = course.completed.size, percent = total ? Math.round((done / total) * 100) : 0;
  const measured = course.lessons.filter(lesson => record.durations?.[lesson.id] > 0), totalSeconds = measured.reduce((sum, lesson) => sum + record.durations[lesson.id], 0);
  const remainingSeconds = measured.filter(lesson => !course.completed.has(lesson.id)).reduce((sum, lesson) => sum + record.durations[lesson.id], 0);
  els.progressLabel.textContent = `${done} of ${total} completed`; els.progressPercent.textContent = `${percent}%`; els.progressBar.style.width = `${percent}%`;
  els.courseTime.textContent = measured.length === total ? `Total course time: ${formatDuration(totalSeconds)} · ${formatDuration(remainingSeconds)} remaining` : `Calculating course time… ${measured.length} of ${total} lessons measured`;
}

function persistCourse(course) {
  const record = courseRecord(course); record.completed = [...course.completed]; record.lastOpened = Date.now(); saveStore();
}
function markComplete(course, lesson, complete = true) {
  if (complete) course.completed.add(lesson.id); else course.completed.delete(lesson.id);
  persistCourse(course); syncLessonStates(); updateCompleteButton(); updateProgress();
}
function toggleComplete() {
  const course = activeCourse(), lesson = course?.lessons[course.activeIndex]; if (lesson) markComplete(course, lesson, !course.completed.has(lesson.id));
}
function resetProgress() {
  const course = activeCourse(); if (!course || !confirm(`Reset all saved progress for “${course.name}”?`)) return;
  const record = courseRecord(course); course.completed.clear(); record.completed = []; record.positions = {}; record.lastLessonId = course.lessons[0]?.id || null; saveStore();
  activateLesson(0, false); renderSections(); updateProgress();
}

function savePlaybackPosition() {
  const course = activeCourse(), lesson = course?.lessons[course.activeIndex];
  if (!lesson || !Number.isFinite(els.video.currentTime)) return;
  const record = courseRecord(course), atEnd = Number.isFinite(els.video.duration) && els.video.currentTime >= els.video.duration - 3;
  if (atEnd || els.video.currentTime < 1) delete record.positions[lesson.id]; else record.positions[lesson.id] = Math.floor(els.video.currentTime);
  saveStore();
}
function searchLessons(query) {
  const value = query.trim().toLowerCase();
  document.querySelectorAll('.lesson').forEach(button => button.classList.toggle('hidden', !button.textContent.toLowerCase().includes(value)));
  document.querySelectorAll('.course-section').forEach(section => section.classList.toggle('hidden', Boolean(value) && !section.querySelector('.lesson:not(.hidden)')));
}

function refreshCaptionControl() {
  // textTracks includes sidecar WebVTT and any captions/subtitles carried inside the MP4.
  const tracks = Array.from(els.video.textTracks || []).filter(track => track.kind === 'captions' || track.kind === 'subtitles'), available = tracks.length > 0;
  els.caption.classList.toggle('hidden', !available); els.caption.disabled = !available;
  if (available) tracks.forEach(track => { track.mode = store.preferences.captionsEnabled ? 'showing' : 'disabled'; });
  els.caption.setAttribute('aria-pressed', String(available && store.preferences.captionsEnabled));
  els.caption.title = available ? (store.preferences.captionsEnabled ? 'Turn captions off' : 'Turn captions on') : 'Captions unavailable';
}
function toggleCaptions() { store.preferences.captionsEnabled = !store.preferences.captionsEnabled; saveStore(); refreshCaptionControl(); }

function readFileDuration(file) {
  return new Promise(resolve => {
    const probe = document.createElement('video'), url = URL.createObjectURL(file);
    let finished = false;
    const done = value => { if (finished) return; finished = true; URL.revokeObjectURL(url); probe.removeAttribute('src'); probe.load(); resolve(Number.isFinite(value) && value > 0 ? value : 0); };
    probe.preload = 'metadata'; probe.onloadedmetadata = () => done(probe.duration); probe.onerror = () => done(0); probe.src = url;
    setTimeout(() => done(0), 12000);
  });
}
async function measureMissingDurations(course) {
  if (state.durationJobs.has(course.id)) return; state.durationJobs.add(course.id);
  const record = courseRecord(course), missing = course.lessons.filter(lesson => !(record.durations?.[lesson.id] > 0)); let next = 0;
  const worker = async () => {
    while (next < missing.length) {
      const lesson = missing[next++], duration = await readFileDuration(lesson.file);
      if (duration) { record.durations[lesson.id] = Math.round(duration); saveStore(); }
      if (activeCourse()?.id === course.id) updateProgress();
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, missing.length) }, worker));
  state.durationJobs.delete(course.id);
  if (activeCourse()?.id === course.id) { renderSections(); updateProgress(); }
}

els.open.forEach(button => button.addEventListener('click', selectFolder));
els.input.addEventListener('change', event => { if (event.target.files.length) addCourse(fromInput(event.target.files), 'Selected course'); event.target.value = ''; });
els.courseSelect.addEventListener('change', event => setActiveCourse(event.target.value));
els.theme.addEventListener('click', () => { store.preferences.theme = store.preferences.theme === 'dark' ? 'light' : 'dark'; saveStore(); applyTheme(); });
els.complete.addEventListener('click', toggleComplete); els.reset.addEventListener('click', resetProgress); els.caption.addEventListener('click', toggleCaptions);
els.previous.addEventListener('click', () => activateLesson(activeCourse().activeIndex - 1));
els.next.addEventListener('click', () => activateLesson(activeCourse().activeIndex + 1));
els.search.addEventListener('input', event => searchLessons(event.target.value));
els.video.addEventListener('loadedmetadata', () => {
  const course = activeCourse(), lesson = course?.lessons[course.activeIndex]; if (!course || !lesson) return;
  const record = courseRecord(course); if (Number.isFinite(els.video.duration) && els.video.duration > 0) { record.durations[lesson.id] = Math.round(els.video.duration); saveStore(); updateProgress(); }
  if (state.pendingResume > 0 && state.pendingResume < els.video.duration - 3) els.video.currentTime = state.pendingResume;
  state.pendingResume = 0; refreshCaptionControl();
});
els.video.addEventListener('durationchange', refreshCaptionControl);
els.video.addEventListener('loadeddata', refreshCaptionControl);
els.video.addEventListener('timeupdate', () => { if (Date.now() - state.lastPositionSavedAt > 5000) { state.lastPositionSavedAt = Date.now(); savePlaybackPosition(); } });
els.video.addEventListener('pause', savePlaybackPosition);
els.video.addEventListener('ended', () => { const course = activeCourse(), lesson = course?.lessons[course.activeIndex]; if (!lesson) return; delete courseRecord(course).positions[lesson.id]; markComplete(course, lesson, true); if (course.activeIndex < course.lessons.length - 1) activateLesson(course.activeIndex + 1); });
if (els.video.textTracks?.addEventListener) els.video.textTracks.addEventListener('addtrack', refreshCaptionControl);
document.addEventListener('visibilitychange', () => { if (document.hidden) savePlaybackPosition(); });
window.addEventListener('beforeunload', savePlaybackPosition);

applyTheme();
const savedCount = Object.keys(store.courses).length;
if (savedCount) { els.savedNotice.hidden = false; els.savedNotice.textContent = `${savedCount} saved course${savedCount === 1 ? '' : 's'} found on this device. Choose the same course folder again to continue where you left off.`; }
