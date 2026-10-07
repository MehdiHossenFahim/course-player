import React, { useState, useEffect, useRef, useMemo } from 'react';

const STORAGE_KEY = 'course-player-data-v4';

const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const isVideo = name => /\.(mp4|mkv|webm)$/i.test(name);
const isCaption = name => /_en\.(vtt|srt)$/i.test(name);
const normalizePath = path => path.replace(/\\/g, '/').toLowerCase().replace(/_en\.(vtt|srt)$|\.(mp4|mkv|webm)$/, '');
const cleanTitle = name => name.replace(/^\d+\s+/, '').replace(/\.(mp4|mkv|webm)$/i, '');
const displaySection = folder => folder.replace(/^\d+\s*-\s*/, '');

function hash(value) {
  let result = 5381;
  for (let index = 0; index < value.length; index += 1) result = ((result << 5) + result) ^ value.charCodeAt(index);
  return (result >>> 0).toString(36);
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

const idb = {
  db: null,
  async init() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('CoursePlayerDB', 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore('handles');
      req.onsuccess = e => { this.db = e.target.result; resolve(this.db); };
      req.onerror = () => reject(req.error);
    });
  },
  async get(key) {
    try {
      const db = await this.init();
      return new Promise((resolve, reject) => {
        const req = db.transaction('handles').objectStore('handles').get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch { return null; }
  },
  async set(key, val) {
    try {
      const db = await this.init();
      return new Promise((resolve, reject) => {
        const req = db.transaction('handles', 'readwrite').objectStore('handles').put(val, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {}
  },
  async delete(key) {
    try {
      const db = await this.init();
      return new Promise((resolve, reject) => {
        const req = db.transaction('handles', 'readwrite').objectStore('handles').delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {}
  }
};

export default function App() {
  const [store, setStore] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return { 
        preferences: { theme: saved.preferences?.theme || 'light', captionsEnabled: saved.preferences?.captionsEnabled !== false }, 
        courses: saved.courses || {} 
      };
    } catch { return { preferences: { theme: 'light', captionsEnabled: true }, courses: {} }; }
  });

  const [activeCourseId, setActiveCourseId] = useState(null);
  const [loadedCourses, setLoadedCourses] = useState(new Map());
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentVideoUrl, setCurrentVideoUrl] = useState(null);
  const [currentTrackUrl, setCurrentTrackUrl] = useState(null);
  const [captionsAvailable, setCaptionsAvailable] = useState(false);
  const [pendingResume, setPendingResume] = useState(0);

  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastTimeUpdate = useRef(0);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [store]);

  useEffect(() => {
    const dark = store.preferences.theme === 'dark';
    document.documentElement.classList.toggle('dark', dark);
    let metaTheme = document.querySelector('meta[name="theme-color"]');
    if (!metaTheme) {
      metaTheme = document.createElement('meta');
      metaTheme.name = 'theme-color';
      document.head.appendChild(metaTheme);
    }
    metaTheme.content = dark ? '#09090b' : '#fafafa';
  }, [store.preferences.theme]);

  const activeCourseData = loadedCourses.get(activeCourseId);
  const activeLesson = activeCourseData?.lessons[activeIndex];
  const courseRecord = store.courses[activeCourseId] || { completed: [], positions: {}, durations: {} };
  const completedSet = new Set(courseRecord.completed || []);

  const toggleTheme = () => {
    setStore(s => ({ ...s, preferences: { ...s.preferences, theme: s.preferences.theme === 'dark' ? 'light' : 'dark' } }));
  };

  async function selectFolder() {
    if ('showDirectoryPicker' in window) {
      try {
        const handle = await window.showDirectoryPicker({ mode: 'read' });
        const entries = await readDirectory(handle);
        const id = addCourse(entries, handle.name);
        if (id) await idb.set(id, handle);
        return;
      } catch (error) { if (error.name === 'AbortError') return; }
    }
    fileInputRef.current?.click();
  }

  async function openRecentCourse(id) {
    if (loadedCourses.has(id)) {
      setActiveCourseId(id);
      return;
    }
    try {
      const handle = await idb.get(id);
      if (handle && handle.queryPermission) {
        if (await handle.queryPermission({ mode: 'read' }) !== 'granted') {
          if (await handle.requestPermission({ mode: 'read' }) !== 'granted') return;
        }
        const entries = await readDirectory(handle);
        addCourse(entries, handle.name);
        return;
      }
    } catch (e) {
      console.warn('IDB restore failed', e);
    }
    alert('Please select the original folder for this course.');
    fileInputRef.current?.click();
  }

  async function deleteCourse(id) {
    if (!window.confirm('Remove this course from your recent list? Your local progress will be lost.')) return;
    
    setLoadedCourses(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });

    setStore(s => {
      const next = { ...s, courses: { ...s.courses } };
      delete next.courses[id];
      return next;
    });

    await idb.delete(id);
  }

  async function readDirectory(handle, prefix = '') {
    const files = [];
    for await (const [name, entry] of handle.entries()) {
      if (entry.kind === 'file' && (isVideo(name) || isCaption(name))) files.push({ file: await entry.getFile(), path: `${prefix}${name}` });
      if (entry.kind === 'directory') files.push(...await readDirectory(entry, `${prefix}${name}/`));
    }
    return files;
  }

  function handleFileInput(e) {
    if (e.target.files.length) {
      const fileList = [...e.target.files];
      const entries = fileList.filter(file => isVideo(file.name) || isCaption(file.name)).map(file => ({ file, path: file.webkitRelativePath || file.name }));
      const firstPath = entries[0]?.path || '';
      const courseName = firstPath.includes('/') ? firstPath.split('/')[0] : 'Selected course';
      addCourse(entries, courseName);
    }
    e.target.value = '';
  }

  function addCourse(entries, courseName) {
    const captions = new Map(entries.filter(entry => isCaption(entry.file.name)).map(entry => [normalizePath(entry.path), entry.file]));
    const lessons = entries.filter(entry => isVideo(entry.file.name)).map(entry => {
      const parts = entry.path.split('/');
      const folder = parts.length > 1 ? parts.at(-2) : 'Course videos';
      return { 
        id: `${entry.path}:${entry.file.size}:${entry.file.lastModified}`, 
        file: entry.file, 
        path: entry.path, 
        title: cleanTitle(entry.file.name), 
        section: displaySection(folder), 
        sectionOrder: folder, 
        caption: captions.get(normalizePath(entry.path)) 
      };
    }).sort((a, b) => natural.compare(a.sectionOrder, b.sectionOrder) || natural.compare(a.path, b.path));

    if (!lessons.length) { alert('No supported videos were found in that folder.'); return null; }
    
    const id = hash(`${courseName}|${lessons.map(l => l.id).join('|')}`);
    const newCourse = { id, name: courseName, lessons };
    
    setLoadedCourses(prev => {
      const next = new Map(prev);
      next.set(id, newCourse);
      return next;
    });

    setStore(s => {
      const next = { ...s, courses: { ...s.courses } };
      if (!next.courses[id]) {
        next.courses[id] = { name: courseName, completed: [], positions: {}, durations: {}, lastLessonId: null, lastOpened: Date.now() };
      } else {
        next.courses[id] = { ...next.courses[id], lastOpened: Date.now() };
      }
      return next;
    });

    setActiveCourseId(id);
    
    const existingRecord = store.courses[id];
    const lastLessonId = existingRecord?.lastLessonId;
    const lastIndex = lessons.findIndex(l => l.id === lastLessonId);
    activateLesson(id, newCourse, lastIndex >= 0 ? lastIndex : 0, existingRecord);
    measureMissingDurations(id, newCourse, existingRecord || { durations: {} });
    
    return id;
  }

  async function activateLesson(courseId, course, index, explicitRecord = null, shouldPlay = true) {
    const lesson = course.lessons[index];
    if (!lesson) return;
    
    savePlaybackPosition();
    
    if (currentVideoUrl) URL.revokeObjectURL(currentVideoUrl);
    if (currentTrackUrl) URL.revokeObjectURL(currentTrackUrl);
    
    const videoUrl = URL.createObjectURL(lesson.file);
    setCurrentVideoUrl(videoUrl);
    
    let trackUrl = null;
    let hasCaption = false;
    
    try {
      if (lesson.caption) {
        hasCaption = true;
        let blob = lesson.caption;
        if (lesson.caption.name.toLowerCase().endsWith('.srt')) {
          const text = await lesson.caption.text();
          const NL = String.fromCharCode(10); 
          let vttText = text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
          blob = new Blob(['WEBVTT' + NL + NL + vttText], { type: 'text/vtt' });
        }
        trackUrl = URL.createObjectURL(blob);
        setCurrentTrackUrl(trackUrl);
      } else {
        setCurrentTrackUrl(null);
      }
    } catch (err) {
      console.error('Caption load error:', err);
      setCurrentTrackUrl(null);
    }
    
    setCaptionsAvailable(hasCaption);
    setActiveIndex(index);
    
    const recToUse = explicitRecord || store.courses[courseId];
    if (recToUse) {
      setPendingResume(Number(recToUse.positions?.[lesson.id]) || 0);
    } else {
      setPendingResume(0);
    }
    
    setStore(s => {
      const next = { ...s, courses: { ...s.courses } };
      const rec = next.courses[courseId];
      if (rec) {
        next.courses[courseId] = { ...rec, lastLessonId: lesson.id, lastOpened: Date.now() };
      }
      return next;
    });

    if (videoRef.current) {
      videoRef.current.load();
      if (shouldPlay) videoRef.current.play().catch(() => {});
    }
  }

  function savePlaybackPosition(captureThumb = false) {
    if (!videoRef.current || !activeCourseId || activeIndex === -1) return;
    const lesson = activeCourseData?.lessons[activeIndex];
    if (!lesson || !Number.isFinite(videoRef.current.currentTime)) return;
    
    const atEnd = Number.isFinite(videoRef.current.duration) && videoRef.current.currentTime >= videoRef.current.duration - 3;
    
    let thumb = null;
    if (captureThumb && videoRef.current.readyState >= 2 && !atEnd) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoRef.current, 0, 0, 320, 180);
        thumb = canvas.toDataURL('image/jpeg', 0.6);
      } catch (e) {}
    }
    
    setStore(s => {
      const next = { ...s, courses: { ...s.courses } };
      const rec = next.courses[activeCourseId];
      if (rec) {
        const newPositions = { ...rec.positions };
        if (atEnd || videoRef.current.currentTime < 1) {
          delete newPositions[lesson.id];
        } else {
          newPositions[lesson.id] = Math.floor(videoRef.current.currentTime);
        }
        
        const updates = { positions: newPositions };
        if (thumb) updates.thumbnail = thumb;
        
        next.courses[activeCourseId] = { ...rec, ...updates };
      }
      return next;
    });
  }

  useEffect(() => {
    const handleUnload = () => savePlaybackPosition();
    const handleVis = () => { if (document.hidden) savePlaybackPosition(); };
    window.addEventListener('beforeunload', handleUnload);
    document.addEventListener('visibilitychange', handleVis);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      document.removeEventListener('visibilitychange', handleVis);
    };
  });

  const handleVideoLoadedMetadata = () => {
    if (!videoRef.current || !activeLesson) return;
    if (Number.isFinite(videoRef.current.duration) && videoRef.current.duration > 0) {
      setStore(s => {
        const next = { ...s, courses: { ...s.courses } };
        const rec = next.courses[activeCourseId];
        if (rec) {
          next.courses[activeCourseId] = { 
            ...rec, 
            durations: { ...rec.durations, [activeLesson.id]: Math.round(videoRef.current.duration) } 
          };
        }
        return next;
      });
    }
    if (pendingResume > 0 && pendingResume < videoRef.current.duration - 3) {
      videoRef.current.currentTime = pendingResume;
    }
    setPendingResume(0);
    refreshCaptionControl();
  };

  const refreshCaptionControl = () => {
    if (!videoRef.current) return;
    const tracks = Array.from(videoRef.current.textTracks || []).filter(t => t.kind === 'captions' || t.kind === 'subtitles');
    const domTracks = Array.from(videoRef.current.querySelectorAll('track'));
    const available = tracks.length > 0 || domTracks.length > 0 || !!activeLesson?.caption;
    setCaptionsAvailable(available);
    
    if (available) {
      tracks.forEach(t => { t.mode = store.preferences.captionsEnabled ? 'showing' : 'disabled'; });
      domTracks.forEach(t => {
        t.default = store.preferences.captionsEnabled;
        if (t.track) t.track.mode = store.preferences.captionsEnabled ? 'showing' : 'disabled';
      });
    }
  };

  const toggleCaptions = () => {
    setStore(s => ({ ...s, preferences: { ...s.preferences, captionsEnabled: !s.preferences.captionsEnabled } }));
  };

  useEffect(() => {
    refreshCaptionControl();
  }, [store.preferences.captionsEnabled, currentTrackUrl]);

  const handleVideoEnded = () => {
    if (!activeLesson) return;
    setStore(s => {
      const next = { ...s, courses: { ...s.courses } };
      const rec = next.courses[activeCourseId];
      if (rec) {
        const newPositions = { ...rec.positions };
        delete newPositions[activeLesson.id];
        const newCompleted = rec.completed.includes(activeLesson.id) ? rec.completed : [...rec.completed, activeLesson.id];
        next.courses[activeCourseId] = { ...rec, positions: newPositions, completed: newCompleted };
      }
      return next;
    });
    if (activeIndex < activeCourseData.lessons.length - 1) {
      activateLesson(activeCourseId, activeCourseData, activeIndex + 1);
    }
  };

  const handleVideoTimeUpdate = () => {
    const now = Date.now();
    if (now - lastTimeUpdate.current > 5000) {
      lastTimeUpdate.current = now;
      savePlaybackPosition(false);
    }
  };

  const toggleComplete = () => {
    if (!activeLesson) return;
    setStore(s => {
      const next = { ...s, courses: { ...s.courses } };
      const rec = next.courses[activeCourseId];
      if (rec) {
        const isDone = rec.completed.includes(activeLesson.id);
        const newCompleted = isDone 
          ? rec.completed.filter(id => id !== activeLesson.id) 
          : [...rec.completed, activeLesson.id];
        next.courses[activeCourseId] = { ...rec, completed: newCompleted, lastOpened: Date.now() };
      }
      return next;
    });
  };

  const resetProgress = () => {
    if (!activeCourseData || !window.confirm(`Reset all saved progress for "${activeCourseData.name}"?`)) return;
    setStore(s => {
      const next = { ...s, courses: { ...s.courses } };
      const rec = next.courses[activeCourseId];
      if (rec) {
        next.courses[activeCourseId] = { ...rec, completed: [], positions: {}, lastLessonId: activeCourseData.lessons[0]?.id || null };
      }
      return next;
    });
    activateLesson(activeCourseId, activeCourseData, 0, null, false);
  };

  const durationJobs = useRef(new Set());
  function readFileDuration(file) {
    return new Promise(resolve => {
      const probe = document.createElement('video');
      const url = URL.createObjectURL(file);
      let finished = false;
      const done = value => { 
        if (finished) return; 
        finished = true; 
        URL.revokeObjectURL(url); 
        probe.removeAttribute('src'); 
        probe.load(); 
        resolve(Number.isFinite(value) && value > 0 ? value : 0); 
      };
      probe.preload = 'metadata'; probe.onloadedmetadata = () => done(probe.duration); probe.onerror = () => done(0); probe.src = url;
      setTimeout(() => done(0), 12000);
    });
  }

  async function measureMissingDurations(courseId, courseData, record) {
    if (durationJobs.current.has(courseId)) return;
    durationJobs.current.add(courseId);
    
    const missing = courseData.lessons.filter(l => record.durations?.[l.id] === undefined);
    let next = 0;
    const worker = async () => {
      while (next < missing.length) {
        const lesson = missing[next++];
        const duration = await readFileDuration(lesson.file);
        setStore(s => {
          const n = { ...s, courses: { ...s.courses } };
          const rec = n.courses[courseId];
          if (rec) {
            n.courses[courseId] = { ...rec, durations: { ...rec.durations, [lesson.id]: duration ? Math.round(duration) : 0 } };
          }
          return n;
        });
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, missing.length) }, worker));
    durationJobs.current.delete(courseId);
  }

  const totalLessons = activeCourseData?.lessons.length || 0;
  const doneCount = completedSet.size;
  const progressPercent = totalLessons ? Math.round((doneCount / totalLessons) * 100) : 0;
  
  const measuredLessons = activeCourseData?.lessons.filter(l => courseRecord.durations?.[l.id] !== undefined) || [];
  const totalSeconds = measuredLessons.reduce((sum, l) => sum + courseRecord.durations[l.id], 0);
  const remainingSeconds = measuredLessons.filter(l => !completedSet.has(l.id)).reduce((sum, l) => sum + courseRecord.durations[l.id], 0);

  const sections = useMemo(() => {
    if (!activeCourseData) return [];
    const groups = new Map();
    activeCourseData.lessons.forEach((l, i) => {
      if (!groups.has(l.section)) groups.set(l.section, []);
      groups.get(l.section).push({ ...l, index: i });
    });
    return Array.from(groups.entries()).map(([section, lessons]) => {
      const duration = lessons.reduce((sum, l) => sum + (Number(courseRecord.durations?.[l.id]) || 0), 0);
      const known = lessons.filter(l => courseRecord.durations?.[l.id] !== undefined).length;
      return { section, lessons, duration, known };
    });
  }, [activeCourseData, courseRecord.durations]);

  const recentCourses = Object.entries(store.courses)
    .filter(([_, data]) => data.name)
    .sort((a, b) => (b[1].lastOpened || 0) - (a[1].lastOpened || 0));

  const isDark = store.preferences.theme === 'dark';

  return (
    <div className="min-h-screen selection:bg-zinc-200 dark:selection:bg-zinc-800">
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-zinc-200/50 bg-white/70 px-4 backdrop-blur-xl sm:px-6 lg:px-8 dark:border-zinc-800/50 dark:bg-[#09090b]/70">
        <div className="flex items-center gap-6">
          <div onClick={() => setActiveCourseId(null)} className="flex items-center gap-3 cursor-pointer group">
            <div className="flex size-8 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-bold text-white transition group-hover:scale-105 dark:bg-white dark:text-zinc-900">
              <svg width="12" height="12" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21.5 15.134C22.1667 15.5189 22.1667 16.4811 21.5 16.866L13.25 21.6292C12.5833 22.0141 11.75 21.5329 11.75 20.7631L11.75 11.2369C11.75 10.4671 12.5833 9.9859 13.25 10.3708L21.5 15.134Z" fill="currentColor"/>
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors">Course Player</span>
          </div>
          <div className="hidden h-5 w-px bg-zinc-200 sm:block dark:bg-zinc-800"></div>
          <select 
            value={activeCourseId || ''} 
            onChange={e => { setActiveCourseId(e.target.value); activateLesson(e.target.value, loadedCourses.get(e.target.value), store.courses[e.target.value]?.lastIndex || 0); }}
            disabled={loadedCourses.size === 0}
            className="hidden w-64 truncate rounded-md border-0 bg-transparent py-1.5 pl-0 pr-8 text-sm text-zinc-600 focus:ring-0 sm:block dark:text-zinc-400"
          >
            <option value="" disabled>Select a loaded course...</option>
            {Array.from(loadedCourses.values()).map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={toggleTheme} className="grid size-8 place-items-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 transition-colors" title="Toggle theme">
            {isDark ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </button>
          <button onClick={selectFolder} className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 shadow-sm">
            Open Folder
          </button>
          <input ref={fileInputRef} onChange={handleFileInput} className="hidden" type="file" webkitdirectory="" directory="" multiple accept="video/mp4,video/x-matroska,video/webm,.mkv,.vtt,.srt" />
        </div>
      </header>

      <main className="mx-auto max-w-[1600px]">
        {!activeCourseId ? (
          <div className="flex flex-col min-h-[calc(100vh-4rem)]">
            <div className="flex-1">
              {recentCourses.length > 0 ? (
            <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
              <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">Recent Courses</h1>
                  <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Pick up right where you left off.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {recentCourses.map(([id, data]) => {
                  const isLoaded = loadedCourses.has(id);
                  return (
                    <div 
                      key={id} 
                      className="group relative text-left flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200/50 shadow-sm transition hover:shadow-md hover:ring-zinc-300 dark:bg-[#09090b] dark:ring-zinc-800/50 dark:hover:ring-zinc-700"
                    >
                      <button
                        onClick={() => openRecentCourse(id)}
                        className="absolute inset-0 z-10 w-full h-full cursor-pointer focus:outline-none"
                        aria-label={`Open ${data.name}`}
                      ></button>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteCourse(id); }}
                        className="absolute top-3 right-3 z-20 flex size-8 items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur-md transition-all hover:bg-red-500 hover:scale-110 group-hover:opacity-100 focus:opacity-100 shadow-sm"
                        title="Remove course"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                      <div className="relative aspect-video w-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden border-b border-zinc-100 dark:border-zinc-800/50">
                        {data.thumbnail ? (
                          <img src={data.thumbnail} alt="" className="size-full object-cover transition duration-500 group-hover:scale-105" />
                        ) : (
                          <div className="grid size-full place-items-center text-zinc-300 dark:text-zinc-800">
                            <svg className="size-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" /></svg>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/20 opacity-0 transition-opacity group-hover:opacity-100 grid place-items-center pointer-events-none">
                          <div className="rounded-full bg-white/90 p-3 text-zinc-900 shadow-sm backdrop-blur-md transition-transform group-hover:scale-110">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>
                          </div>
                        </div>
                        {!isLoaded && (
                          <div className="absolute top-3 left-3 rounded-md bg-black/60 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-md pointer-events-none">
                            Requires Permission
                          </div>
                        )}
                      </div>
                      <div className="p-4 flex-1 flex flex-col justify-between pointer-events-none">
                        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-2">{data.name}</h3>
                        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                          {data.completed?.length || 0} lessons completed
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <section className="mx-auto max-w-2xl px-6 py-32 text-center sm:py-40">
              <div className="mx-auto mb-8 flex size-16 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-900">
                <svg className="size-8 text-zinc-400 dark:text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">Minimal Course Player</h1>
              <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                Select a local folder of videos to start. Everything is saved locally in your browser.
              </p>
              <div className="mt-10 flex justify-center gap-4">
                <button onClick={selectFolder} className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 shadow-sm">
                  Choose Folder
                </button>
              </div>
            </section>
          )}
          </div>
          <footer className="border-t border-zinc-200/50 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800/50 dark:text-zinc-400">
            Created by{' '}
            <a 
              href="https://www.linkedin.com/in/mehedihossenfahim/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="font-medium text-zinc-900 transition-colors hover:text-zinc-600 dark:text-white dark:hover:text-zinc-300"
            >
              Mehedi Hossen Fahim
            </a>
          </footer>
        </div>
        ) : (
          <section className="grid min-h-[calc(100vh-4rem)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0 px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
              <div className="mx-auto max-w-6xl">
                <div className="mb-4 flex items-center gap-2 text-xs font-medium text-zinc-400 dark:text-zinc-500">
                  <span>{activeCourseData?.name}</span>
                  <span>/</span>
                  <span className="text-zinc-900 dark:text-zinc-300">{activeLesson?.section}</span>
                </div>
                
                <div className="relative aspect-video overflow-hidden rounded-2xl bg-black ring-1 ring-zinc-200/50 shadow-2xl shadow-zinc-900/5 dark:ring-white/10">
                  <video 
                    ref={videoRef}
                    src={currentVideoUrl || ''}
                    onLoadedMetadata={handleVideoLoadedMetadata}
                    onEnded={handleVideoEnded}
                    onPause={() => savePlaybackPosition(true)}
                    onTimeUpdate={handleVideoTimeUpdate}
                    onDurationChange={refreshCaptionControl}
                    onLoadedData={refreshCaptionControl}
                    className="size-full" 
                    controls preload="metadata" playsInline
                  >
                    {currentTrackUrl && (
                      <track 
                        kind="subtitles" 
                        label="English" 
                        srcLang="en" 
                        src={currentTrackUrl} 
                        default={store.preferences.captionsEnabled} 
                      />
                    )}
                  </video>
                  {!currentVideoUrl && (
                    <div className="absolute inset-0 grid place-items-center bg-zinc-100 dark:bg-zinc-900">
                      <p className="text-sm font-medium text-zinc-400">Select a lesson</p>
                    </div>
                  )}
                  {captionsAvailable && (
                    <button 
                      onClick={toggleCaptions}
                      className="absolute top-4 right-4 rounded-full bg-black/60 px-3 py-1 text-[10px] font-bold tracking-wider text-white backdrop-blur-md transition hover:bg-black/80"
                    >
                      CC {store.preferences.captionsEnabled ? 'ON' : 'OFF'}
                    </button>
                  )}
                </div>

                <div className="mt-8 flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
                      {activeLesson?.title || 'Choose a lesson'}
                    </h1>
                    <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                      Lesson {activeIndex + 1} of {totalLessons}
                      {pendingResume > 0 ? ` · Resume from ${formatPosition(pendingResume)}` : ''}
                    </p>
                  </div>
                  <button 
                    onClick={toggleComplete}
                    disabled={!activeLesson}
                    className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-full border px-5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40
                      ${completedSet.has(activeLesson?.id) 
                        ? 'border-transparent bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' 
                        : 'border-zinc-200 bg-transparent text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900'}`}
                  >
                    {completedSet.has(activeLesson?.id) ? 'Completed ✓' : 'Mark as complete'}
                  </button>
                </div>

                <nav className="mt-8 flex items-center justify-between border-t border-zinc-100 pt-6 dark:border-zinc-800/50">
                  <button 
                    onClick={() => activateLesson(activeCourseId, activeCourseData, activeIndex - 1)}
                    disabled={activeIndex <= 0}
                    className="flex items-center gap-2 text-sm font-medium text-zinc-500 transition hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:text-white"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    Previous
                  </button>
                  <button 
                    onClick={() => activateLesson(activeCourseId, activeCourseData, activeIndex + 1)}
                    disabled={activeIndex >= totalLessons - 1}
                    className="flex items-center gap-2 text-sm font-medium text-zinc-500 transition hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:text-white"
                  >
                    Next
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </button>
                </nav>
              </div>
            </div>

            <aside className="border-t border-zinc-200/50 bg-white/30 lg:border-t-0 lg:border-l dark:border-zinc-800/50 dark:bg-black/10">
              <div className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto p-6 soft-scrollbar">
                
                <div className="mb-6 rounded-2xl bg-zinc-100/50 p-4 dark:bg-zinc-900/50">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[10px] font-bold tracking-widest text-zinc-400 dark:text-zinc-500">PROGRESS</p>
                      <p className="mt-1 text-lg font-semibold tracking-tight">{progressPercent}%</p>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{doneCount} / {totalLessons}</p>
                  </div>
                  <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div className="h-full rounded-full bg-zinc-900 transition-all duration-500 dark:bg-zinc-100" style={{ width: `${progressPercent}%` }}></div>
                  </div>
                  <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
                    {measuredLessons.length === totalLessons 
                      ? `${formatDuration(remainingSeconds)} left of ${formatDuration(totalSeconds)}` 
                      : `Scanning videos... (${measuredLessons.length}/${totalLessons})`}
                  </p>
                </div>

                <div className="mb-6 flex gap-2">
                  <div className="relative flex-1">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    <input 
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full rounded-full border-0 bg-zinc-100 py-2 pl-9 pr-4 text-xs text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-1 focus:ring-zinc-200 dark:bg-zinc-900 dark:text-white dark:focus:ring-zinc-800" 
                      type="search" 
                      placeholder="Search" 
                    />
                  </div>
                  <button onClick={resetProgress} className="rounded-full px-3 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-white transition-colors" title="Reset Course">
                    Reset
                  </button>
                </div>

                <div className="space-y-6">
                  {sections.map(s => {
                    const filtered = s.lessons.filter(l => !searchQuery || l.title.toLowerCase().includes(searchQuery.toLowerCase()));
                    if (searchQuery && filtered.length === 0) return null;
                    return (
                      <div key={s.section}>
                        <h3 className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                          {s.section}
                        </h3>
                        <div className="space-y-0.5">
                          {filtered.map(l => {
                            const isActive = activeIndex === l.index;
                            const isDone = completedSet.has(l.id);
                            return (
                              <button 
                                key={l.id}
                                onClick={() => activateLesson(activeCourseId, activeCourseData, l.index)}
                                className={`group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left text-sm transition-colors
                                  ${isActive ? 'bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-900 dark:text-white' : 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900/50'}`}
                              >
                                <div className={`flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors
                                  ${isDone 
                                    ? 'border-zinc-900 bg-zinc-900 dark:border-white dark:bg-white' 
                                    : isActive ? 'border-zinc-400 dark:border-zinc-500' : 'border-zinc-300 group-hover:border-zinc-400 dark:border-zinc-700 dark:group-hover:border-zinc-600'}`}>
                                  {isDone && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={isDark ? '#09090b' : 'white'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>}
                                </div>
                                <span className="min-w-0 flex-1 truncate">{l.title}</span>
                                <span className={`shrink-0 text-[10px] ${isActive ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-zinc-500'}`}>
                                  {courseRecord.durations?.[l.id] ? formatDuration(courseRecord.durations[l.id]) : ''}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </aside>
          </section>
        )}
      </main>
    </div>
  );
}
