(() => {
  'use strict';
  const data = window.KABSON_TIMETABLE;
  const byId = (id) => document.getElementById(id);
  if (!data || !Array.isArray(data.teachers) || !Array.isArray(data.days)) {
    byId('teacherResults').textContent = 'ยังโหลดตารางสอนไม่สำเร็จ กรุณาลองเปิดหน้าอีกครั้ง';
    return;
  }

  const teachers = data.teachers.slice().sort((a, b) => a.name.localeCompare(b.name, 'th'));
  const dayNames = new Map(data.days.map((day) => [day.number, day.name]));
  const periods = data.periods.slice().sort((a, b) => a.number - b.number);
  let selectedTeacher = null;
  let selectedDay = todayInBangkok();
  let toastTimer;

  document.title = `ตารางสอนครู ${data.term} | ${data.school}`;
  byId('schoolName').textContent = data.school;
  byId('headerTerm').textContent = `ภาคเรียน ${data.term}`;
  byId('publishedLabel').textContent = `ภาคเรียน ${data.term}`;
  byId('teacherCount').textContent = `${teachers.length} ครู`;
  byId('termValue').textContent = data.term;
  byId('footerVersion').textContent = `ภาคเรียน ${data.term} · ฉบับประกาศ #${data.publicationId}`;
  byId('versionNote').textContent = `ฉบับประกาศ #${data.publicationId} · รหัส ${data.fingerprint} · เมื่อมีตารางใหม่ โรงเรียนจะอัปเดตหน้านี้`;
  if (data.lineOaUrl) {
    byId('lineButton').href = data.lineOaUrl;
    byId('lineButton').hidden = false;
    byId('linePending').hidden = true;
  }

  const search = byId('teacherSearch');
  search.addEventListener('focus', () => document.body.classList.add('search-open'));
  search.addEventListener('input', () => { document.body.classList.add('search-open'); renderTeacherChoices(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && document.activeElement !== search) {
      event.preventDefault();
      search.focus();
    }
  });
  byId('shareButton').addEventListener('click', shareTeacher);
  byId('printButton').addEventListener('click', () => window.print());
  window.addEventListener('popstate', () => {
    const code = new URL(location.href).searchParams.get('teacher');
    selectTeacher(teachers.find((teacher) => teacher.code === code) || null, false);
  });

  const requestedCode = new URL(location.href).searchParams.get('teacher');
  const rememberedCode = safeStorageGet('kabson-teacher-code');
  const initial = teachers.find((teacher) => teacher.code === requestedCode)
    || teachers.find((teacher) => teacher.code === rememberedCode) || null;
  renderTeacherChoices();
  if (initial) selectTeacher(initial, Boolean(requestedCode));

  function renderTeacherChoices() {
    const root = byId('teacherResults');
    root.replaceChildren();
    const query = search.value.trim().toLocaleLowerCase('th');
    const matches = teachers.filter((teacher) => `${teacher.name} ${teacher.code}`.toLocaleLowerCase('th').includes(query));
    if (!matches.length) {
      const message = document.createElement('span');
      message.className = 'no-results';
      message.textContent = 'ไม่พบครูตามคำค้น';
      root.append(message);
      return;
    }
    for (const teacher of matches) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'teacher-choice' + (selectedTeacher?.code === teacher.code ? ' is-selected' : '');
      button.textContent = teacher.name;
      const code = document.createElement('small');
      code.textContent = teacher.code;
      button.append(code);
      button.setAttribute('aria-pressed', String(selectedTeacher?.code === teacher.code));
      button.addEventListener('click', () => {
        search.value = '';
        search.blur();
        document.body.classList.remove('search-open');
        selectTeacher(teacher, true);
      });
      root.append(button);
    }
  }

  function selectTeacher(teacher, updateUrl) {
    selectedTeacher = teacher;
    document.body.classList.toggle('has-selection', Boolean(teacher));
    byId('teacherView').hidden = !teacher;
    byId('emptyState').hidden = Boolean(teacher);
    if (updateUrl) {
      const url = new URL(location.href);
      if (teacher) url.searchParams.set('teacher', teacher.code);
      else url.searchParams.delete('teacher');
      history.replaceState(null, '', url);
    }
    if (!teacher) { renderTeacherChoices(); return; }
    safeStorageSet('kabson-teacher-code', teacher.code);
    byId('teacherName').textContent = teacher.name;
    byId('teacherCode').textContent = `รหัสครู ${teacher.code}`;
    byId('lessonCount').textContent = String(teacher.lessons);
    const dayLoads = data.days.map((day) => ({
      day: day.number, name: day.name,
      count: teacher.slots.filter((slot) => slot.day === day.number && slot.kind === 'class').length
    }));
    const busiest = dayLoads.reduce((best, current) => current.count > best.count ? current : best, dayLoads[0]);
    byId('busyDay').textContent = busiest?.count ? busiest.name : '—';
    byId('busyDetail').textContent = busiest?.count ? `${busiest.count} คาบสอน` : 'ไม่มีคาบสอน';
    const title = `ตารางสอน ${teacher.name} | ภาคเรียน ${data.term}`;
    document.title = title;
    if (!dayNames.has(selectedDay)) selectedDay = data.days[0]?.number;
    renderDayTabs();
    renderAgenda();
    renderWeekTable();
    renderTeacherChoices();
  }

  function slotAt(day, period) {
    return selectedTeacher.slots.find((slot) => slot.day === day && slot.period === period);
  }

  function slotDisplay(slot) {
    const card = document.createElement('div');
    const kind = slot?.kind === 'class' ? 'class' : slot ? 'activity' : 'free';
    card.className = `slot slot-${kind}`;
    if (slot) {
      if (/พักกลางวัน/.test(slot.title)) card.classList.add('slot-lunch');
      if (/ประชุม/.test(slot.title)) card.classList.add('slot-meeting');
      if (/PLC/i.test(slot.title)) card.classList.add('slot-plc');
    }
    const title = document.createElement('span');
    title.className = 'slot-title';
    title.textContent = slot?.title || 'ว่าง';
    card.append(title);
    if (slot?.kind === 'class') {
      const details = [slot.subjectCode, slot.sections?.join(', '), slot.room && `ห้อง ${slot.room}`].filter(Boolean);
      const detail = document.createElement('span');
      detail.className = 'slot-detail';
      detail.textContent = details.join(' · ');
      card.append(detail);
    }
    return card;
  }

  function periodLabel(period) {
    const wrap = document.createElement('div');
    const number = document.createElement('span');
    number.className = 'period-number';
    number.textContent = `คาบ ${period.number}`;
    wrap.append(number);
    if (period.startTime && period.endTime) {
      const time = document.createElement('span');
      time.className = 'period-time';
      time.textContent = `${period.startTime}–${period.endTime}`;
      wrap.append(time);
    }
    return wrap;
  }

  function renderWeekTable() {
    const table = byId('weekTable');
    const head = table.tHead || table.createTHead();
    const body = table.tBodies[0] || table.createTBody();
    head.replaceChildren(); body.replaceChildren();
    const header = head.insertRow();
    const corner = document.createElement('th');
    corner.scope = 'col'; corner.textContent = 'คาบ'; header.append(corner);
    for (const day of data.days) {
      const cell = document.createElement('th');
      cell.scope = 'col'; cell.textContent = day.name; header.append(cell);
    }
    for (const period of periods) {
      const row = body.insertRow();
      const label = row.insertCell(); label.append(periodLabel(period));
      for (const day of data.days) row.insertCell().append(slotDisplay(slotAt(day.number, period.number)));
    }
  }

  function renderDayTabs() {
    const root = byId('dayTabs'); root.replaceChildren();
    for (const day of data.days) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'day-tab'; button.role = 'tab';
      button.textContent = day.name;
      button.setAttribute('aria-selected', String(selectedDay === day.number));
      button.addEventListener('click', () => { selectedDay = day.number; renderDayTabs(); renderAgenda(); });
      root.append(button);
    }
  }

  function renderAgenda() {
    const root = byId('mobileAgenda'); root.replaceChildren();
    root.setAttribute('aria-label', `ตารางวัน${dayNames.get(selectedDay) || ''}`);
    for (const period of periods) {
      const row = document.createElement('div'); row.className = 'agenda-row';
      const label = document.createElement('div'); label.className = 'agenda-period';
      label.textContent = `คาบ ${period.number}`;
      if (period.startTime && period.endTime) {
        const time = document.createElement('small'); time.textContent = `${period.startTime}–${period.endTime}`; label.append(time);
      }
      row.append(label, slotDisplay(slotAt(selectedDay, period.number)));
      root.append(row);
    }
  }

  async function shareTeacher() {
    if (!selectedTeacher) return;
    const url = new URL(location.href);
    url.searchParams.set('teacher', selectedTeacher.code);
    const title = `ตารางสอน ${selectedTeacher.name} ภาคเรียน ${data.term}`;
    try {
      if (navigator.share) await navigator.share({ title, url: url.toString() });
      else { await navigator.clipboard.writeText(url.toString()); showToast('คัดลอกลิงก์แล้ว'); }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      try { await navigator.clipboard.writeText(url.toString()); showToast('คัดลอกลิงก์แล้ว'); }
      catch { showToast('คัดลอกไม่ได้ กรุณาคัดลอก URL จากแถบที่อยู่'); }
    }
  }

  function todayInBangkok() {
    try {
      const name = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Asia/Bangkok' }).format(new Date());
      return ({ Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 })[name] || data.days[0]?.number;
    } catch { return data.days[0]?.number; }
  }
  function safeStorageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function safeStorageSet(key, value) { try { localStorage.setItem(key, value); } catch { /* Private browsing. */ } }
  function showToast(message) {
    const toast = byId('toast'); toast.textContent = message; toast.classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
  }
})();
