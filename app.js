(() => {
  'use strict';
  const data = window.KABSON_TIMETABLE;
  const byId = (id) => document.getElementById(id);
  if (!data || !Array.isArray(data.teachers) || !Array.isArray(data.classes) || !Array.isArray(data.days)) {
    byId('teacherResults').textContent = 'ยังโหลดตารางสอนไม่สำเร็จ กรุณาลองเปิดหน้าอีกครั้ง';
    return;
  }

  const query = new URL(location.href).searchParams;
  const view = query.get('view') === 'student' || (query.has('class') && !query.has('teacher')) ? 'student' : 'teacher';
  const isStudent = view === 'student';
  const items = (isStudent ? data.classes : data.teachers).slice()
    .sort((a, b) => isStudent ? a.code.localeCompare(b.code, 'th', { numeric: true }) : a.name.localeCompare(b.name, 'th'));
  const dayNames = new Map(data.days.map((day) => [day.number, day.name]));
  const periods = data.periods.slice().sort((a, b) => a.number - b.number);
  const search = byId('teacherSearch');
  const todayDay = currentDayInBangkok();
  let selectedItem = null;
  let selectedDay = todayDay || data.days[0]?.number;
  let lastDialogTrigger = null;
  let toastTimer;

  byId('teacherNav').setAttribute('aria-current', isStudent ? 'false' : 'page');
  byId('studentNav').setAttribute('aria-current', isStudent ? 'page' : 'false');
  byId('teacherNav').classList.toggle('is-active', !isStudent);
  byId('studentNav').classList.toggle('is-active', isStudent);
  document.body.classList.toggle('student-mode', isStudent);
  document.title = `ตาราง${isStudent ? 'นักเรียน' : 'ครู'} ${data.term} | ${data.school}`;
  byId('schoolName').textContent = data.school;
  byId('headerTerm').textContent = `ภาคเรียน ${data.term}`;
  byId('publishedLabel').textContent = `ภาคเรียน ${data.term}`;
  byId('teacherCount').textContent = `${items.length} ${isStudent ? 'ห้อง' : 'ครู'}`;
  byId('termValue').textContent = data.term;
  byId('footerVersion').textContent = `ภาคเรียน ${data.term} · ฉบับประกาศ #${data.publicationId}`;
  byId('versionNote').textContent = `ฉบับประกาศ #${data.publicationId} · รหัส ${data.fingerprint} · เมื่อมีตารางใหม่ โรงเรียนจะอัปเดตหน้านี้`;
  byId('teacherSupport').hidden = isStudent;
  byId('heroMain').textContent = isStudent ? 'ตารางเรียนของห้อง' : 'ตารางสอนของคุณ';
  byId('heroLead').textContent = isStudent
    ? 'เลือกชั้นและห้องเพื่อดูวิชา ครูผู้สอน ห้องเรียน และกิจกรรมได้ทันที ทั้งบนมือถือและคอมพิวเตอร์'
    : 'เลือกครูหนึ่งครั้ง แล้วเปิดดูคาบสอน ห้องเรียน และกิจกรรมได้ทันที ทั้งบนมือถือและคอมพิวเตอร์';
  byId('findTitle').textContent = isStudent ? 'เลือกชั้นและห้องเรียน' : 'ค้นหาตารางของครู';
  byId('searchLabel').textContent = isStudent ? 'ชั้นหรือห้องเรียน' : 'ชื่อหรือรหัสครู';
  search.setAttribute('aria-label', isStudent ? 'ชั้นหรือห้องเรียน' : 'ชื่อหรือรหัสครู');
  search.placeholder = isStudent ? 'พิมพ์ชั้นหรือห้อง เช่น 3/1' : 'พิมพ์ชื่อ หรือรหัสครู เช่น 0403';
  byId('scheduleKicker').textContent = isStudent ? 'ตารางเรียนรายห้อง' : 'ตารางสอนรายบุคคล';
  byId('lessonLabel').textContent = isStudent ? 'คาบเรียนต่อสัปดาห์' : 'คาบสอนต่อสัปดาห์';
  byId('lessonNote').textContent = isStudent ? 'นับเฉพาะคาบเรียนจริง' : 'นับเฉพาะคาบสอนจริง';
  byId('busyLabel').textContent = isStudent ? 'วันเรียนมากที่สุด' : 'วันสอนมากที่สุด';
  byId('emptyTitle').textContent = isStudent ? 'เลือกห้องเพื่อเปิดตาราง' : 'เลือกครูเพื่อเปิดตาราง';
  byId('emptyLead').textContent = isStudent
    ? 'กดห้องจากรายการด้านบน หรือค้นหาด้วยชั้นเรียน'
    : 'กดชื่อจากรายการด้านบน หรือค้นหาด้วยรหัสครู';
  if (data.lineOaUrl) {
    byId('lineButton').href = data.lineOaUrl;
    byId('lineButton').hidden = false;
    byId('linePending').hidden = true;
  }

  search.addEventListener('focus', () => document.body.classList.add('search-open'));
  search.addEventListener('input', () => { document.body.classList.add('search-open'); renderChoices(); });
  document.addEventListener('pointerdown', (event) => {
    if (!byId('finder').contains(event.target)) document.body.classList.remove('search-open');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && document.activeElement !== search) {
      event.preventDefault();
      search.focus();
    } else if (event.key === 'Escape' && document.activeElement === search) {
      search.blur();
      document.body.classList.remove('search-open');
    }
  });
  byId('shareButton').addEventListener('click', shareSelection);
  byId('printButton').addEventListener('click', () => window.print());
  byId('weekLayoutButton').addEventListener('click', () => setMobileLayout('week'));
  byId('dayLayoutButton').addEventListener('click', () => setMobileLayout('day'));
  byId('periodJump').addEventListener('change', jumpToPeriod);
  byId('closeSlotDialog').addEventListener('click', () => byId('slotDialog').close());
  byId('slotDialog').addEventListener('close', () => lastDialogTrigger?.focus());
  for (const period of periods) {
    const option = document.createElement('option');
    option.value = String(period.number);
    option.textContent = `คาบ ${period.number}`;
    byId('periodJump').append(option);
  }
  window.addEventListener('popstate', () => {
    const code = new URL(location.href).searchParams.get(isStudent ? 'class' : 'teacher');
    selectItem(items.find((item) => item.code === code) || null, false);
  });

  const requestedCode = query.get(isStudent ? 'class' : 'teacher');
  const rememberedCode = safeStorageGet(isStudent ? 'kabson-class-code' : 'kabson-teacher-code');
  const initial = items.find((item) => item.code === requestedCode)
    || items.find((item) => item.code === rememberedCode) || null;
  renderChoices();
  if (initial) selectItem(initial, requestedCode && requestedCode !== initial.code ? 'replace' : false);

  function renderChoices() {
    const root = byId('teacherResults');
    root.replaceChildren();
    const term = search.value.trim().toLocaleLowerCase('th');
    const matches = items.filter((item) => `${item.name} ${item.code}`.toLocaleLowerCase('th').includes(term));
    if (!matches.length) {
      const message = document.createElement('span');
      message.className = 'no-results';
      message.textContent = isStudent ? 'ไม่พบห้องเรียนตามคำค้น' : 'ไม่พบครูตามคำค้น';
      root.append(message);
      return;
    }
    for (const item of matches) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'teacher-choice' + (selectedItem?.code === item.code ? ' is-selected' : '');
      button.textContent = item.name;
      if (!isStudent) {
        const code = document.createElement('small');
        code.textContent = item.code;
        button.append(code);
      }
      button.setAttribute('aria-pressed', String(selectedItem?.code === item.code));
      button.addEventListener('click', () => {
        search.value = '';
        search.blur();
        document.body.classList.remove('search-open');
        selectItem(item, selectedItem?.code === item.code ? false : 'push');
      });
      root.append(button);
    }
  }

  function selectItem(item, historyMode) {
    selectedItem = item;
    document.body.classList.toggle('has-selection', Boolean(item));
    byId('teacherView').hidden = !item;
    byId('emptyState').hidden = Boolean(item);
    if (historyMode) {
      const url = new URL(location.href);
      url.searchParams.delete(isStudent ? 'teacher' : 'class');
      if (isStudent) url.searchParams.set('view', 'student');
      else url.searchParams.delete('view');
      if (item) url.searchParams.set(isStudent ? 'class' : 'teacher', item.code);
      else url.searchParams.delete(isStudent ? 'class' : 'teacher');
      history[historyMode === 'push' ? 'pushState' : 'replaceState'](null, '', url);
    }
    if (!item) {
      document.title = `ตาราง${isStudent ? 'นักเรียน' : 'ครู'} ${data.term} | ${data.school}`;
      renderChoices();
      return;
    }
    safeStorageSet(isStudent ? 'kabson-class-code' : 'kabson-teacher-code', item.code);
    byId('teacherName').textContent = item.name;
    byId('teacherCode').textContent = isStudent ? `ชั้น ${item.name}` : `รหัสครู ${item.code}`;
    byId('lessonCount').textContent = String(item.lessons);
    const dayLoads = data.days.map((day) => ({
      name: day.name,
      count: item.slots.filter((slot) => slot.day === day.number && slot.kind === 'class').length
    }));
    const busiest = dayLoads.reduce((best, current) => current.count > best.count ? current : best, dayLoads[0]);
    byId('busyDay').textContent = busiest?.count ? busiest.name : '—';
    byId('busyDetail').textContent = busiest?.count ? `${busiest.count} คาบ${isStudent ? 'เรียน' : 'สอน'}` : 'ไม่มีคาบเรียน';
    document.title = `ตาราง${isStudent ? 'เรียน' : 'สอน'} ${item.name} | ภาคเรียน ${data.term}`;
    if (!dayNames.has(selectedDay)) selectedDay = data.days[0]?.number;
    renderDayTabs();
    renderAgenda();
    renderWeekTable();
    renderChoices();
  }

  function slotAt(day, period) {
    return selectedItem.slots.find((slot) => slot.day === day && slot.period === period);
  }

  function slotDisplay(slot) {
    const card = document.createElement(slot ? 'button' : 'div');
    const kind = slot?.kind === 'class' ? 'class' : slot ? 'activity' : 'free';
    card.className = `slot slot-${kind}${slot ? ' slot-open' : ''}`;
    if (slot) {
      card.type = 'button';
      card.setAttribute('aria-label', `${dayNames.get(slot.day)} คาบ ${slot.period} ${slot.title} ดูรายละเอียด`);
      card.addEventListener('click', () => openSlotDialog(slot, card));
      if (/พักกลางวัน/.test(slot.title)) card.classList.add('slot-lunch');
      if (/ประชุม/.test(slot.title)) card.classList.add('slot-meeting');
      if (/PLC/i.test(slot.title)) card.classList.add('slot-plc');
    }
    const title = document.createElement('span');
    title.className = 'slot-title';
    title.textContent = slot?.title || 'ว่าง';
    card.append(title);
    if (slot) {
      let details = [];
      if (slot.kind === 'class') {
        details = isStudent
          ? [slot.subjectCode, slot.teacher && `ครู${slot.teacher}`, slot.room && `ห้อง ${slot.room}`]
          : [slot.subjectCode, slot.sections?.join(', '), slot.room && `ห้อง ${slot.room}`];
      } else if (isStudent && slot.teacher && !/พักกลางวัน/.test(slot.title)) {
        details = [`ครู${slot.teacher}`];
      }
      if (details.filter(Boolean).length) {
        const detail = document.createElement('span');
        detail.className = 'slot-detail';
        detail.textContent = details.filter(Boolean).join(' · ');
        card.append(detail);
      }
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
    corner.scope = 'col'; corner.textContent = 'วัน / คาบ'; header.append(corner);
    for (const period of periods) {
      const cell = document.createElement('th');
      cell.scope = 'col'; cell.append(periodLabel(period)); header.append(cell);
    }
    for (const day of data.days) {
      const row = body.insertRow();
      const dayHeading = document.createElement('th');
      dayHeading.scope = 'row';
      dayHeading.className = 'day-heading';
      dayHeading.textContent = day.name;
      if (day.number === todayDay) {
        row.classList.add('is-today');
        const badge = document.createElement('span');
        badge.className = 'today-badge';
        badge.textContent = 'วันนี้';
        dayHeading.append(badge);
      }
      row.append(dayHeading);
      for (const period of periods) row.insertCell().append(slotDisplay(slotAt(day.number, period.number)));
    }
  }

  function setMobileLayout(layout) {
    byId('scheduleSection').dataset.layout = layout;
    byId('weekLayoutButton').setAttribute('aria-pressed', String(layout === 'week'));
    byId('dayLayoutButton').setAttribute('aria-pressed', String(layout === 'day'));
  }

  function jumpToPeriod() {
    const jump = byId('periodJump');
    const periodIndex = periods.findIndex((period) => period.number === Number(jump.value));
    if (periodIndex < 0) return;
    const headers = byId('weekTable').tHead.rows[0].cells;
    const wrapper = document.querySelector('.desktop-table-wrap');
    const left = headers[periodIndex + 1].offsetLeft - headers[0].offsetWidth;
    wrapper.scrollTo({ left, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    jump.value = '';
  }

  function openSlotDialog(slot, trigger) {
    const period = periods.find((item) => item.number === slot.period);
    const time = period?.startTime && period?.endTime ? ` · ${period.startTime}–${period.endTime}` : '';
    byId('slotDialogMeta').textContent = `วัน${dayNames.get(slot.day)} · คาบ ${slot.period}${time}`;
    byId('slotDialogTitle').textContent = slot.title;
    const details = byId('slotDialogDetails');
    details.replaceChildren();
    if (slot.subjectCode) addDetail('รหัสวิชา', slot.subjectCode);
    if (isStudent && slot.teacher) addDetail('ครูผู้สอน', slot.teacher);
    if (!isStudent && slot.sections?.length) addDetail('ชั้นเรียน', slot.sections.join(', '));
    if (isStudent && slot.sections?.length > 1) addDetail('เรียนรวม', slot.sections.join(', '));
    if (slot.room) addDetail('ห้องเรียน', slot.room);
    if (!details.children.length) addDetail('ประเภท', slot.kind === 'break' ? 'พัก' : 'กิจกรรม');
    lastDialogTrigger = trigger;
    byId('slotDialog').showModal();
    byId('closeSlotDialog').focus();

    function addDetail(label, value) {
      const term = document.createElement('dt');
      term.textContent = label;
      const description = document.createElement('dd');
      description.textContent = value;
      details.append(term, description);
    }
  }

  function renderDayTabs() {
    const root = byId('dayTabs'); root.replaceChildren();
    for (const day of data.days) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'day-tab';
      button.textContent = day.name;
      button.setAttribute('aria-pressed', String(selectedDay === day.number));
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
        const time = document.createElement('small');
        time.textContent = `${period.startTime}–${period.endTime}`;
        label.append(time);
      }
      row.append(label, slotDisplay(slotAt(selectedDay, period.number)));
      root.append(row);
    }
  }

  async function shareSelection() {
    if (!selectedItem) return;
    const url = new URL(location.href);
    if (isStudent) { url.searchParams.set('view', 'student'); url.searchParams.set('class', selectedItem.code); }
    else url.searchParams.set('teacher', selectedItem.code);
    const title = `ตาราง${isStudent ? 'เรียน' : 'สอน'} ${selectedItem.name} ภาคเรียน ${data.term}`;
    try {
      if (navigator.share) await navigator.share({ title, url: url.toString() });
      else { await navigator.clipboard.writeText(url.toString()); showToast('คัดลอกลิงก์แล้ว'); }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      try { await navigator.clipboard.writeText(url.toString()); showToast('คัดลอกลิงก์แล้ว'); }
      catch { showToast('คัดลอกไม่ได้ กรุณาคัดลอก URL จากแถบที่อยู่'); }
    }
  }

  function currentDayInBangkok() {
    try {
      const name = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Asia/Bangkok' }).format(new Date());
      return ({ Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 })[name] || null;
    } catch { return null; }
  }
  function safeStorageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function safeStorageSet(key, value) { try { localStorage.setItem(key, value); } catch { /* Private browsing. */ } }
  function showToast(message) {
    const toast = byId('toast'); toast.textContent = message; toast.classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
  }
})();
