(() => {
  "use strict";

  const letters = ["أ", "ب", "ج", "د", "هـ", "و"];
  const grades = [
    "الصف الأول الابتدائي", "الصف الثاني الابتدائي", "الصف الثالث الابتدائي",
    "الصف الرابع الابتدائي", "الصف الخامس الابتدائي", "الصف السادس الابتدائي",
    "الصف الأول الإعدادي", "الصف الثاني الإعدادي", "الصف الثالث الإعدادي",
    "الصف الأول الثانوي", "الصف الثاني الثانوي", "الصف الثالث الثانوي"
  ];
  const icons = {
    exam: '<svg viewBox="0 0 24 24"><path d="M8 4.5h8a2 2 0 0 1 2 2v13H6v-13a2 2 0 0 1 2-2Z"/><path d="M9 10h6M9 14h6M9 18h3"/></svg>',
    students: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 3.5 4.8"/></svg>',
    score: '<svg viewBox="0 0 24 24"><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 5-6"/></svg>',
    question: '<svg viewBox="0 0 24 24"><path d="M9.5 9a2.5 2.5 0 1 1 4.7 1.2c-.8 1.4-2.2 1.5-2.2 3.3"/><path d="M12 17.5h.01"/><circle cx="12" cy="12" r="9"/></svg>',
    timer: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9 2h6M12 5V2"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="m14 5 5 5M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>'
  };

  const appContent = document.getElementById("appContent");
  const toastRegion = document.getElementById("toastRegion");
  const sidebar = document.getElementById("sidebar");
  const pageNames = { dashboard: "لوحة التحكم", exams: "الامتحانات", results: "النتائج", videos: "فيديوهات الشرح", join: "دخول الامتحان", create: "إنشاء امتحان" };
  let store = { exams: [], results: [], videos: [] };
  let teacherAuthed = false;
  let teacherNeedsSetup = false;
  let revision = 0;
  let currentView = "dashboard";
  let selectedResultId = null;
  let selectedResultsGrade = "";
  let selectedVideoGrade = "";
  let videoSearchTerm = "";
  let draft = null;
  let videoDraft = null;
  let teacherPoll = null;

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "تعذر إكمال الطلب. حاول مرة أخرى.");
    return data;
  }

  async function loadTeacherState() {
    const data = await api("/api/teacher/state");
    store = { exams: data.exams || [], results: data.results || [], videos: data.videos || [] };
    revision = data.revision || 0;
  }

  async function saveStore() {
    try {
      const data = await api("/api/teacher/state", { method: "PUT", body: JSON.stringify({ exams: store.exams }) });
      store = { exams: data.exams || [], results: data.results || [], videos: data.videos || [] };
      revision = data.revision || revision;
      return true;
    } catch (error) {
      toast(error.message || "تعذر حفظ التغييرات على الخادم.", "error");
      return false;
    }
  }

  function renderTeacherAuth() {
    const setup = teacherNeedsSetup;
    return `<div class="teacher-auth-card card"><div class="student-brand"><span class="brand-mark"><span></span><span></span><span></span></span> الحاوي</div><div class="eyebrow">الأستاذ أحمد مصطفى · مدرس الدراسات والتاريخ</div><h1>${setup ? "إعداد حساب المدرس" : "تسجيل دخول المدرس"}</h1><p>${setup ? "أنشئ كلمة مرور خاصة لحماية الدروس والامتحانات ونتائج الطلاب." : "سجّل الدخول لإدارة فيديوهات الشرح والامتحانات ومراجعة نتائج الطلاب."}</p><form id="teacherAuthForm" data-mode="${setup ? "setup" : "login"}">${setup ? '<div class="field"><label for="teacherSetupKey">رمز الإعداد الظاهر في سجلات تشغيل الموقع</label><input id="teacherSetupKey" name="setupKey" required autocomplete="off" /></div>' : ""}<div class="field"><label for="teacherPassword">كلمة المرور</label><input id="teacherPassword" name="password" type="password" required minlength="8" autocomplete="${setup ? "new-password" : "current-password"}" placeholder="٨ أحرف على الأقل" /></div>${setup ? '<div class="field"><label for="teacherPasswordConfirm">تأكيد كلمة المرور</label><input id="teacherPasswordConfirm" name="confirmPassword" type="password" required minlength="8" autocomplete="new-password" /></div>' : ""}<button class="primary-button join-submit" type="submit">${setup ? "إنشاء حساب المدرس" : "دخول إلى لوحة المدرس"} <span>←</span></button></form><p class="teacher-auth-note">صفحة المدرس منفصلة ومحميّة عن صفحة الطالب.</p></div>`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", year: "numeric" }).format(date);
  }

  function totalPoints(exam) {
    return (exam.questions || []).reduce((sum, question) => sum + Number(question.points || 0), 0);
  }

  function toast(message, type = "success") {
    const item = document.createElement("div");
    item.className = `toast ${type === "error" ? "error" : ""}`;
    item.innerHTML = `<span class="toast-icon">${type === "error" ? "!" : "✓"}</span><span>${escapeHtml(message)}</span>`;
    toastRegion.appendChild(item);
    window.setTimeout(() => item.remove(), 3100);
  }

  function randomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    do {
      code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    } while (store.exams.some((exam) => exam.code === code));
    return code;
  }

  function switchView(view) {
    if (view === "join") {
      window.location.href = "student.html";
      return;
    }
    currentView = view;
    selectedResultId = null;
    sidebar.classList.remove("open");
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function render() {
    if (!teacherAuthed) {
      document.body.classList.add("teacher-auth");
      appContent.innerHTML = renderTeacherAuth();
      return;
    }
    document.body.classList.remove("teacher-auth");
    document.querySelectorAll("[data-view].nav-link").forEach((button) => button.classList.toggle("active", button.dataset.view === currentView));
    document.getElementById("pageCrumb").textContent = pageNames[currentView] || pageNames.dashboard;
    document.getElementById("examCountNav").textContent = store.exams.length;
    document.getElementById("videoCountNav").textContent = store.videos.length;

    if (currentView === "dashboard") appContent.innerHTML = renderDashboard();
    else if (currentView === "exams") appContent.innerHTML = renderExams();
    else if (currentView === "results") appContent.innerHTML = selectedResultId ? renderResultDetail(selectedResultId) : renderResults();
    else if (currentView === "create") appContent.innerHTML = renderCreate();
    else if (currentView === "videos") appContent.innerHTML = videoDraft ? renderVideoForm() : renderVideos();
  }

  function startTeacherPolling() {
    if (teacherPoll) window.clearInterval(teacherPoll);
    teacherPoll = window.setInterval(async () => {
      if (!teacherAuthed) return;
      try {
        const data = await api("/api/teacher/state");
        if (data.revision === revision) return;
        store = { exams: data.exams || [], results: data.results || [], videos: data.videos || [] };
        revision = data.revision || revision;
        if (currentView !== "create") render();
      } catch (error) {
        if (/سجّل دخولك/.test(error.message)) {
          teacherAuthed = false;
          if (teacherPoll) window.clearInterval(teacherPoll);
          render();
        }
      }
    }, 4000);
  }

  function pageHeading(kicker, title, description, action = "") {
    return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
  }

  function renderDashboard() {
    const attempts = store.results.length;
    const average = attempts ? Math.round(store.results.reduce((sum, item) => sum + (item.percentage || 0), 0) / attempts) : 0;
    const examRows = store.exams.length ? store.exams.slice(0, 4).map((exam, index) => `
      <div class="exam-row">
        <div class="exam-name"><span class="exam-cover">${["✳", "⌘", "◈", "✦"][index % 4]}</span><div class="exam-name-copy"><b>${escapeHtml(exam.title)}</b><small>${escapeHtml(exam.subject || "مادة متنوعة")} · ${escapeHtml(exam.grade)}</small></div></div>
        <div class="exam-meta">${exam.questions.length} أسئلة · ${Number(exam.duration)} دقائق</div>
        <div class="row-actions"><button class="icon-button" title="نسخ كود الامتحان" aria-label="نسخ كود الامتحان" data-action="copy" data-code="${escapeHtml(exam.code)}">${icons.copy}</button><button class="icon-button" title="جرّب كطالب" aria-label="جرّب كطالب" data-action="open-student" data-code="${escapeHtml(exam.code)}">↗</button></div>
      </div>`).join("") : `<div class="empty-state"><span class="empty-icon">＋</span><b>ابدأ بإنشاء أول امتحان</b><p>أضف الأسئلة وحدد الصف، وبعدها شارك الكود مع طلابك.</p><button class="primary-button" data-action="create">إنشاء امتحان</button></div>`;

    return `
      <div class="welcome-banner">
        <div class="welcome-copy"><div class="welcome-kicker"><span>✳</span> مساحة تعليمية منظمة</div><h1>شرح أوضح، تعلّم أعمق، ومتابعة للتقدم.</h1><div class="welcome-actions"><button class="banner-button" data-action="create">＋ أنشئ امتحانًا جديدًا</button></div></div>
        <div class="banner-art" aria-hidden="true"><div class="art-orbit"></div><span class="art-spark">✳</span><div class="art-sheet"><div class="sheet-head"><span></span><i></i></div><div class="sheet-line"></div><div class="sheet-line short"></div><div class="sheet-check"><i class="checked"></i><span></span></div><div class="sheet-check"><i></i><span></span></div><div class="sheet-check"><i></i><span></span></div><div class="sheet-line short"></div></div><div class="art-badge"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></div></div>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><span class="stat-icon">${icons.exam}</span><div><b class="stat-value">${store.exams.length}</b><span class="stat-label">امتحان منشور</span></div></div>
        <div class="stat-card"><span class="stat-icon">${icons.students}</span><div><b class="stat-value">${attempts}</b><span class="stat-label">محاولة طالب</span></div></div>
        <div class="stat-card"><span class="stat-icon">${icons.score}</span><div><b class="stat-value">${attempts ? `${average}%` : "—"}</b><span class="stat-label">متوسط الدرجات</span></div></div>
        <div class="stat-card"><span class="stat-icon">${icons.question}</span><div><b class="stat-value">${store.exams.reduce((sum, exam) => sum + exam.questions.length, 0)}</b><span class="stat-label">سؤال في بنك الامتحانات</span></div></div>
      </div>
      <div class="dashboard-lower">
        <section class="card panel"><div class="section-title"><div><h2>أحدث الامتحانات</h2><p>امتحاناتك الجاهزة لمشاركة الطلاب</p></div></div><div class="exam-list">${examRows}</div></section>
      </div>`;
  }

  function renderExams() {
    const options = [`<option value="">كل الصفوف</option>`, ...grades.map((grade) => `<option value="${escapeHtml(grade)}">${escapeHtml(grade)}</option>`)].join("");
    return `<div class="page-header"><span class="page-heading"><h1>الامتحانات</h1></span><button class="primary-button" data-action="create">＋ إنشاء امتحان</button></div>
      <div class="toolbar"><label class="search-box">${icons.search}<input id="examSearch" type="search" placeholder="ابحث باسم الامتحان أو المادة" autocomplete="off" /></label><select id="gradeFilter" class="filter-select" aria-label="تصفية حسب الصف">${options}</select></div>
      <div id="examTableMount">${examTable(store.exams)}</div>`;
  }

  function examTable(exams) {
    if (!exams.length) return `<div class="card empty-state"><span class="empty-icon">⌕</span><b>${store.exams.length ? "لا توجد نتائج مطابقة" : "لا توجد امتحانات بعد"}</b><p>${store.exams.length ? "جرّب تغيير كلمة البحث أو الصف." : "أنشئ امتحانًا جديدًا وسيظهر هنا كود مشاركته وعدد محاولاته."}</p></div>`;
    const rows = exams.map((exam) => {
      const count = store.results.filter((result) => result.examId === exam.id).length;
      return `<tr><td><span class="table-title">${escapeHtml(exam.title)}</span><span class="table-sub">${escapeHtml(exam.subject || "مادة متنوعة")} · ${escapeHtml(exam.grade)}</span></td><td>${exam.questions.length} أسئلة</td><td>${Number(exam.duration)} دقائق</td><td><span class="code-chip">${escapeHtml(exam.code)}</span></td><td>${count} محاولة</td><td><span class="status-pill">منشور</span></td><td><div class="table-actions-cell"><button class="table-action" data-action="copy" data-code="${escapeHtml(exam.code)}">نسخ الكود</button><button class="icon-button" title="تعديل الامتحان" aria-label="تعديل الامتحان" data-action="edit-exam" data-id="${escapeHtml(exam.id)}">${icons.edit}</button><button class="icon-button danger" title="حذف الامتحان" aria-label="حذف الامتحان" data-action="delete-exam" data-id="${escapeHtml(exam.id)}">${icons.trash}</button></div></td></tr>`;
    }).join("");
    return `<div class="card data-card"><div class="data-table-wrap"><table class="data-table"><thead><tr><th>الامتحان</th><th>عدد الأسئلة</th><th>المدة</th><th>كود المشاركة</th><th>المحاولات</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  function formatFileSize(bytes) {
    const size = Number(bytes) || 0;
    return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} ميجابايت` : `${Math.max(1, Math.round(size / 1024))} كيلوبايت`;
  }

  function renderVideos() {
    const gradeOptions = [`<option value="">كل الصفوف الدراسية</option>`, ...grades.map((grade) => `<option value="${escapeHtml(grade)}" ${selectedVideoGrade === grade ? "selected" : ""}>${escapeHtml(grade)}</option>`)].join("");
    const content = store.videos.length ? `<div class="toolbar"><label class="search-box">${icons.search}<input id="videoSearch" type="search" value="${escapeHtml(videoSearchTerm)}" placeholder="ابحث باسم الفيديو أو الدرس" autocomplete="off" /></label><select id="videoGradeFilter" class="filter-select" aria-label="تصفية فيديوهات الشرح حسب الصف">${gradeOptions}</select></div><div id="teacherVideoList">${videoCards(store.videos)}</div>` : `<div class="card empty-state"><span class="empty-icon">▶</span><b>أضف أول فيديو شرح</b><p>ارفع فيديو الدرس، وسيُنشأ له كود خاص تشاركه مع طلابك.</p></div>`;
    return `${pageHeading("مكتبة الدروس", "فيديوهات الشرح", "ارفع الشروحات ورتبها حسب الصف والدرس، ولكل فيديو كود مشاهدة خاص.", '<button class="primary-button" data-action="add-video">＋ إضافة فيديو شرح</button>')}
      <div class="video-library-note"><span class="video-note-icon">ⓘ</span><span>الحد الأقصى للفيديو الواحد 800 ميجابايت. مساحة الاستضافة الحالية 5 جيجابايت، تكفي نحو 6 فيديوهات بهذا الحجم.</span></div>${content}`;
  }

  function videoCards(videos) {
    const cards = videos.map((video) => `
      <article class="teacher-video-card card">
        <div class="teacher-video-card-top"><div class="teacher-video-cover" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/></svg></div><span class="teacher-video-grade">${escapeHtml(video.grade)}</span></div>
        <div class="teacher-video-copy"><h2>${escapeHtml(video.title)}</h2><p>${escapeHtml(video.lesson)}</p></div>
        <div class="teacher-video-meta"><span>${formatFileSize(video.size)}</span><span>${formatDate(video.createdAt)}</span></div>
        <div class="teacher-video-code"><span><small>كود مشاهدة الدرس</small><b dir="ltr">${escapeHtml(video.code)}</b></span><button class="outline-button" data-action="copy-video-code" data-code="${escapeHtml(video.code)}">نسخ الكود</button></div>
        <div class="teacher-video-actions"><button class="table-action" data-action="edit-video" data-id="${escapeHtml(video.id)}">تعديل بيانات الدرس</button><button class="icon-button danger" title="حذف الفيديو" aria-label="حذف الفيديو" data-action="delete-video" data-id="${escapeHtml(video.id)}">${icons.trash}</button></div>
      </article>`).join("");
    if (cards) return `<div class="teacher-video-grid">${cards}</div>`;
    return `<div class="card empty-state video-filter-empty"><span class="empty-icon">⌕</span><b>لا توجد فيديوهات مطابقة</b><p>غيّر الصف أو كلمة البحث لعرض فيديوهات أخرى.</p></div>`;
  }

  function filterVideos() {
    const search = document.getElementById("videoSearch");
    const grade = document.getElementById("videoGradeFilter");
    const mount = document.getElementById("teacherVideoList");
    if (!search || !grade || !mount) return;
    videoSearchTerm = search.value;
    selectedVideoGrade = grade.value;
    const term = videoSearchTerm.trim().toLocaleLowerCase("ar");
    const filtered = store.videos.filter((video) => {
      const content = `${video.title} ${video.lesson} ${video.grade}`.toLocaleLowerCase("ar");
      return (!term || content.includes(term)) && (!selectedVideoGrade || video.grade === selectedVideoGrade);
    });
    mount.innerHTML = videoCards(filtered);
  }

  function beginVideoCreate() {
    videoDraft = { editingId: null, title: "", lesson: "", grade: "" };
    currentView = "videos";
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function beginVideoEdit(videoId) {
    const video = store.videos.find((item) => item.id === videoId);
    if (!video) return;
    videoDraft = { editingId: video.id, title: video.title, lesson: video.lesson, grade: video.grade };
    currentView = "videos";
    render();
  }

  function renderVideoForm() {
    const gradeOptions = [`<option value="">اختر الصف الدراسي</option>`, ...grades.map((grade) => `<option value="${escapeHtml(grade)}" ${videoDraft.grade === grade ? "selected" : ""}>${escapeHtml(grade)}</option>`)].join("");
    const editing = Boolean(videoDraft.editingId);
    const uploadField = editing ? `<div class="video-existing-file"><span class="teacher-video-cover" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/></svg></span><span><b>الفيديو محفوظ بأمان</b><small>تعديل البيانات لن يغير ملف الفيديو أو كود المشاهدة.</small></span></div>` : `<div class="field full"><label for="videoFile">ملف الفيديو *</label><label class="video-file-drop" for="videoFile"><span class="video-file-icon">↑</span><b>اختر فيديو من جهازك</b><small>MP4 أو WebM · حتى 800 ميجابايت</small><input id="videoFile" name="video" type="file" accept="video/mp4,video/webm,.mp4,.webm" required /></label><div class="video-upload-progress" id="videoUploadProgress" hidden><progress max="100" value="0"></progress><span id="videoUploadStatus">جاهز للرفع</span></div></div>`;
    return `${pageHeading("إدارة مكتبة الفيديو", editing ? "تعديل بيانات الفيديو" : "إضافة فيديو شرح", "اكتب بيانات الدرس وارفع ملف الفيديو. سننشئ كودًا آمنًا لمشاركته مع الطلاب.", '<button class="back-button" data-action="cancel-video">← الرجوع للفيديوهات</button>')}
      <form id="videoForm"><div class="form-layout"><div class="card form-card"><div class="form-section-head"><span class="step-num">١</span><div><b>بيانات الدرس</b><small>هذه المعلومات ستظهر في ملف الطالب بعد إدخال الكود</small></div></div><div class="field-grid"><div class="field"><label for="videoTitle">عنوان الفيديو *</label><input id="videoTitle" name="title" required minlength="2" maxlength="100" placeholder="مثال: نشأة الحضارة المصرية" value="${escapeHtml(videoDraft.title)}" /></div><div class="field"><label for="videoLesson">اسم الدرس أو الوحدة *</label><input id="videoLesson" name="lesson" required minlength="2" maxlength="120" placeholder="مثال: الوحدة الأولى — الدرس الأول" value="${escapeHtml(videoDraft.lesson)}" /></div><div class="field full"><label for="videoGrade">الصف الدراسي *</label><select id="videoGrade" name="grade" required>${gradeOptions}</select></div>${uploadField}</div>${editing ? "" : `<div class="video-upload-status-box"><b>خصوصية مشاهدة الدرس</b><span>لا يعمل الفيديو إلا من صفحة الطالب بعد تسجيل الدخول وإدخال كوده الخاص.</span></div>`}<div class="form-actions"><span class="form-actions-note">${editing ? "يمكنك تغيير العنوان والدرس والصف." : "سيظهر كود المشاهدة بعد اكتمال الرفع."}</span><button class="primary-button large" type="submit">${editing ? "حفظ التعديلات" : "رفع الفيديو وإنشاء الكود"} <span>←</span></button></div></div><aside class="card form-side"><div class="side-preview-mark">▶</div><h3>درس منظم لكل طالب</h3><p>تصل الشروحات للطالب من حسابه الخاص بعد إدخال كود الدرس.</p><ul class="side-preview-list"><li>${icons.check}حدد الصف والدرس بوضوح</li><li>${icons.check}كود منفصل لكل فيديو</li><li>${icons.check}تشغيل داخل صفحة الطالب</li></ul></aside></div></form>`;
  }

  function uploadVideo(formData, onProgress) {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", "/api/teacher/videos");
      request.withCredentials = true;
      request.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      });
      request.addEventListener("load", () => {
        let data = {};
        try { data = JSON.parse(request.responseText); } catch (error) { /* The request helper below reports a readable message. */ }
        if (request.status >= 200 && request.status < 300) resolve(data);
        else reject(new Error(data.error || "تعذر رفع الفيديو. حاول مرة أخرى."));
      });
      request.addEventListener("error", () => reject(new Error("انقطع الاتصال أثناء رفع الفيديو. حاول مرة أخرى.")));
      request.send(formData);
    });
  }

  function renderResults() {
    const gradeOptions = [`<option value="">اختر الصف الدراسي لعرض امتحاناته</option>`, ...grades.map((grade) => `<option value="${escapeHtml(grade)}" ${selectedResultsGrade === grade ? "selected" : ""}>${escapeHtml(grade)}</option>`)].join("");
    const gradeExams = store.exams.filter((exam) => !selectedResultsGrade || exam.grade === selectedResultsGrade);
    const examDate = (exam) => new Date(exam.createdAt || 0).getTime();
    const sortedExams = [...gradeExams].sort((a, b) => examDate(b) - examDate(a));
    const recentExams = sortedExams.slice(0, 1);
    const previousExams = sortedExams.slice(1);
    const gradeIds = new Set(gradeExams.map((exam) => exam.id));
    const gradeResults = selectedResultsGrade ? store.results.filter((result) => gradeIds.has(result.examId)) : store.results;
    const count = gradeResults.length;
    const average = count ? Math.round(gradeResults.reduce((sum, item) => sum + Number(item.percentage || 0), 0) / count) : 0;
    const pass = gradeResults.filter((item) => item.percentage >= 50).length;

    const examCard = (exam, recent) => {
      const attempts = store.results.filter((result) => result.examId === exam.id).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
      const mean = attempts.length ? Math.round(attempts.reduce((sum, result) => sum + Number(result.percentage || 0), 0) / attempts.length) : null;
      const rows = attempts.map((result) => `<tr><td><span class="table-title">${escapeHtml(result.studentName)}</span><span class="table-sub">${escapeHtml(result.studentGrade || exam.grade)}</span></td><td><span class="score-text">${result.score} / ${result.maxScore}</span></td><td>${Math.round(result.percentage)}%</td><td>${formatDate(result.submittedAt)}</td><td><button class="table-action" data-action="view-result" data-id="${escapeHtml(result.id)}">مراجعة الإجابات ←</button></td></tr>`).join("");
      const scores = attempts.length
        ? `<div class="result-exam-content-heading"><div><b>درجات الطلاب في هذا الامتحان</b><span>${attempts.length} محاولة مسجلة</span></div><span class="result-exam-content-average">متوسط الفصل <b>${mean}%</b></span></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>الطالب</th><th>الدرجة</th><th>النسبة</th><th>تاريخ التسليم</th><th>الإجابات</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<div class="result-exam-no-scores"><b>لم تُسجل درجات لهذا الامتحان بعد</b><span>ستظهر محاولات الطلاب هنا بعد التسليم.</span></div>`;
      return `<details class="result-exam-accordion"><summary class="result-exam-card"><span class="result-exam-icon">${icons.exam}</span><span class="result-exam-copy"><small>${escapeHtml(exam.subject || "الدراسات الاجتماعية")} · ${formatDate(exam.createdAt)}</small><b>${escapeHtml(exam.title)}</b><span class="result-exam-grade">${escapeHtml(exam.grade)}</span></span><span class="result-exam-stat"><b>${attempts.length}</b><small>محاولة</small></span><span class="result-exam-average"><b>${mean == null ? "—" : `${mean}%`}</b><small>${recent ? "حديث" : "أرشيف"}</small></span><span class="result-exam-toggle" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="m5.5 7.5 4.5 4.5 4.5-4.5"/></svg></span></summary><div class="result-exam-content">${scores}</div></details>`;
    };
    const examGroup = (title, note, exams, recent) => `<section class="results-exam-section"><div class="results-section-heading"><div><h3>${title}</h3><p>${note}</p></div><span class="results-section-count">${exams.length}</span></div>${exams.length ? `<div class="results-exam-grid">${exams.map((exam) => examCard(exam, recent)).join("")}</div>` : `<div class="results-group-empty">لا توجد امتحانات ${recent ? "حديثة" : "سابقة"} لهذا الصف.</div>`}</section>`;
    const directory = !selectedResultsGrade
      ? `<div class="results-prompt card"><span class="results-prompt-icon">${icons.students}</span><div><b>ابدأ باختيار الصف الدراسي</b><p>سيظهر أحدث امتحان وحده، ثم قائمة بباقي امتحانات الصف.</p></div></div>`
      : gradeExams.length
        ? `<div class="results-exam-groups">${examGroup("الامتحان الأحدث", "آخر امتحان أُضيف لهذا الصف", recentExams, true)}${examGroup("الامتحانات السابقة", "باقي امتحانات هذا الصف", previousExams, false)}</div>`
        : `<div class="results-prompt card"><span class="results-prompt-icon">${icons.exam}</span><div><b>لا توجد امتحانات لهذا الصف حتى الآن</b><p>عند إنشاء امتحان واختيار هذا الصف، سيظهر هنا تلقائيًا.</p></div></div>`;
    return `${pageHeading("متابعة الطلاب", "النتائج", "اختر الصف ثم الامتحان لمراجعة المحاولات والدرجات والإجابات.")}
      <div class="results-filter-bar card"><div><span class="filter-label">تصفية النتائج</span><b>${selectedResultsGrade ? escapeHtml(selectedResultsGrade) : "حسب الصف الدراسي"}</b></div><label for="resultsGradeFilter">الصف الدراسي</label><select id="resultsGradeFilter" class="filter-select" aria-label="اختر الصف الدراسي">${gradeOptions}</select></div>
      ${directory}
      <div class="results-summary"><div class="card summary-card"><span>${selectedResultsGrade ? "محاولات الصف" : "إجمالي المحاولات"}</span><b>${count}</b></div><div class="card summary-card"><span>متوسط الدرجات</span><b>${count ? `${average}%` : "—"}</b></div><div class="card summary-card"><span>حققوا ٥٠٪ فأكثر</span><b>${pass}<small>${count ? ` من ${count}` : ""}</small></b></div></div>`;
  }

  function renderResultDetail(resultId) {
    const result = store.results.find((item) => item.id === resultId);
    if (!result) return `${pageHeading("متابعة التعلّم", "النتائج", "تعذر العثور على هذه المحاولة.", '<button class="back-button" data-action="back-results">← الرجوع للنتائج</button>')}`;
    return `<div class="page-heading"><div><div class="eyebrow">مراجعة المحاولة</div><h1>${escapeHtml(result.studentName)}</h1><p>${escapeHtml(result.examTitle)} · ${escapeHtml(result.studentGrade)} · ${escapeHtml(result.studentClass || "بدون فصل")} · ${formatDate(result.submittedAt)}</p></div><button class="back-button" data-action="back-results">← كل النتائج</button></div>
      <div class="result-hero card"><div class="result-check">${icons.check}</div><h1>ملخص النتيجة</h1><p>مراجعة إجابات الطالب</p><div class="result-score"><b>${result.score}</b><span>/ ${result.maxScore} درجة</span></div><div class="result-meta"><span>النسبة <b>${Math.round(result.percentage)}٪</b></span><span>الإجابات الصحيحة <b>${result.answers.filter((answer) => answer.earned === answer.points).length}</b> من ${result.answers.length}</span></div></div>
      <div class="section-title" style="margin:20px 0 11px"><div><h2>إجابات الامتحان</h2><p>الإجابة الصحيحة موضحة باللون الأخضر</p></div></div><div class="review-list">${renderReviewAnswers(result)}</div>`;
  }

  function renderReviewAnswers(result) {
    return result.answers.map((answer, index) => {
      const isCorrect = answer.earned === answer.points;
      const chosen = answer.selectedIndex == null ? "لم تتم الإجابة" : answer.options[answer.selectedIndex];
      const correct = answer.options[answer.correctIndex];
      return `<article class="card review-question"><div class="review-head"><b>${index + 1}. ${escapeHtml(answer.prompt)}</b><span class="review-mark ${isCorrect ? "" : "incorrect"}">${isCorrect ? "إجابة صحيحة" : answer.selectedIndex == null ? "بدون إجابة" : "تحتاج مراجعة"}</span></div><div class="review-answer"><span>إجابة الطالب: <b>${escapeHtml(chosen)}</b></span>${isCorrect ? "" : `<span>الإجابة الصحيحة: <b class="correct-answer">${escapeHtml(correct)}</b></span>`}</div><div class="review-points">الدرجة: ${answer.earned} من ${answer.points}</div></article>`;
    }).join("");
  }

  function newQuestion() {
    return { id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, prompt: "", options: ["", "", "", ""], correct: null, points: 1 };
  }

  function beginDraft() {
    draft = { editingId: null, title: "", subject: "الدراسات الاجتماعية", grade: "", duration: 30, instructions: "", code: randomCode(), questions: [newQuestion()] };
    switchView("create");
  }

  function beginEdit(examId) {
    const exam = store.exams.find((item) => item.id === examId);
    if (!exam) return;
    draft = {
      editingId: exam.id,
      title: exam.title,
      subject: exam.subject || "",
      grade: exam.grade,
      duration: Number(exam.duration),
      instructions: exam.instructions || "",
      code: exam.code,
      questions: exam.questions.map((question) => ({ ...question, options: [...question.options] }))
    };
    switchView("create");
  }

  function renderCreate() {
    if (!draft) draft = { editingId: null, title: "", subject: "الدراسات الاجتماعية", grade: "", duration: 30, instructions: "", code: randomCode(), questions: [newQuestion()] };
    const gradeOptions = [`<option value="">اختر الصف الدراسي</option>`, ...grades.map((grade) => `<option value="${escapeHtml(grade)}" ${draft.grade === grade ? "selected" : ""}>${escapeHtml(grade)}</option>`)].join("");
    const cards = draft.questions.map((question, index) => `
      <div class="question-card" data-question-id="${escapeHtml(question.id)}"><div class="question-card-head"><b>السؤال ${index + 1}</b>${draft.questions.length > 1 ? `<button type="button" class="question-delete" title="حذف السؤال" aria-label="حذف السؤال" data-action="remove-question" data-id="${escapeHtml(question.id)}">${icons.trash}</button>` : ""}</div>
        <div class="field"><label for="prompt-${escapeHtml(question.id)}">نص السؤال</label><textarea id="prompt-${escapeHtml(question.id)}" data-q-field="prompt" placeholder="اكتب السؤال بطريقة واضحة ومناسبة للصف">${escapeHtml(question.prompt)}</textarea></div>
        <span class="answers-label">الاختيارات — اختر الإجابة الصحيحة</span><div class="option-list">${question.options.map((option, optionIndex) => `<label class="option-field"><input type="radio" name="correct-${escapeHtml(question.id)}" value="${optionIndex}" data-q-field="correct" ${question.correct === optionIndex ? "checked" : ""} aria-label="اختيار الإجابة ${letters[optionIndex]} الصحيحة" /><input type="text" value="${escapeHtml(option)}" data-q-field="option" data-index="${optionIndex}" placeholder="الإجابة ${letters[optionIndex]}" aria-label="نص الإجابة ${letters[optionIndex]}" /></label>`).join("")}</div>
        <div class="points-row"><label for="points-${escapeHtml(question.id)}">درجة السؤال</label><input id="points-${escapeHtml(question.id)}" class="points-input" type="number" min="1" max="100" value="${escapeHtml(question.points)}" data-q-field="points" /><span class="field-hint">درجة</span></div>
      </div>`).join("");

    const heading = draft.editingId ? "تعديل الامتحان" : "إنشاء امتحان جديد";
    const submitLabel = draft.editingId ? "حفظ التعديلات" : "نشر الامتحان";
    return `${pageHeading("مساحة المعلم", heading, "أضف بيانات الامتحان والأسئلة، وبعد النشر شارك كود الدخول مع الطلاب.", '<button class="back-button" data-action="cancel-create">✕ إلغاء</button>')}
      <form id="createForm"><div class="form-layout"><div class="card form-card"><div class="form-section-head"><span class="step-num">١</span><div><b>بيانات الامتحان</b><small>التفاصيل التي ستظهر للطلاب قبل البدء</small></div></div><div class="field-grid">
        <div class="field"><label for="examTitle">اسم الامتحان *</label><input id="examTitle" name="title" maxlength="90" required placeholder="مثال: مراجعة الوحدة الأولى" value="${escapeHtml(draft.title)}" /></div>
        <div class="field"><label for="examSubject">المادة</label><input id="examSubject" name="subject" maxlength="50" placeholder="مثال: الرياضيات" value="${escapeHtml(draft.subject)}" /></div>
        <div class="field"><label for="examGrade">الصف الدراسي *</label><select id="examGrade" name="grade" required>${gradeOptions}</select></div>
        <div class="field"><label for="examDuration">مدة الامتحان</label><select id="examDuration" name="duration">${[10, 15, 20, 30, 45, 60, 90, 120].map((minutes) => `<option value="${minutes}" ${Number(draft.duration) === minutes ? "selected" : ""}>${minutes} دقيقة</option>`).join("")}</select></div>
        <div class="field full"><label for="examInstructions">تعليمات للطالب <span class="muted">(اختياري)</span></label><textarea id="examInstructions" name="instructions" maxlength="300" placeholder="مثال: أجب عن جميع الأسئلة قبل انتهاء الوقت">${escapeHtml(draft.instructions)}</textarea></div>
      </div><div class="divider"></div><div class="form-section-head"><span class="step-num">٢</span><div><b>أسئلة الامتحان</b><small>اختيار من متعدد — حدد الإجابة الصحيحة لكل سؤال</small></div></div><div class="question-editor">${cards}</div><button type="button" class="add-question" data-action="add-question">＋ أضف سؤالًا جديدًا</button>
      <div class="form-actions"><span class="form-actions-note">سيحصل كل طالب على نتيجته فور تسليم الامتحان.</span><button class="primary-button large" type="submit">${submitLabel} <span>←</span></button></div></div>
      <aside class="card form-side"><div class="side-preview-mark">✳</div><h3>جاهز لمشاركة طلابك</h3><p>سيكون الامتحان متاحًا فور نشره. أرسل كود الدخول للطلاب ليبدؤوا المحاولة.</p><ul class="side-preview-list"><li>${icons.check}يظهر للطالب اسم الامتحان والمدة</li><li>${icons.check}تصحيح تلقائي للأسئلة</li><li>${icons.check}مراجعة الإجابات والدرجة من النتائج</li></ul><div class="code-preview"><span>كود مشاركة مقترح</span><b>${escapeHtml(draft.code)}</b></div></aside></div></form>`;
  }

  function syncDraftFromForm() {
    if (!draft) return;
    const form = document.getElementById("createForm");
    if (!form) return;
    draft.title = form.elements.title.value;
    draft.subject = form.elements.subject.value;
    draft.grade = form.elements.grade.value;
    draft.duration = Number(form.elements.duration.value) || 30;
    draft.instructions = form.elements.instructions.value;
    for (const card of form.querySelectorAll(".question-card")) {
      const question = draft.questions.find((item) => item.id === card.dataset.questionId);
      if (!question) continue;
      question.prompt = card.querySelector('[data-q-field="prompt"]').value;
      question.options = [...card.querySelectorAll('[data-q-field="option"]')].map((input) => input.value);
      const correct = card.querySelector('[data-q-field="correct"]:checked');
      question.correct = correct ? Number(correct.value) : null;
      question.points = Math.min(100, Math.max(1, Number(card.querySelector('[data-q-field="points"]').value) || 1));
    }
  }

  function showConfirm({ title, message, confirmText = "تأكيد", danger = false, onConfirm }) {
    const backdrop = document.createElement("div");
    backdrop.className = "confirm-backdrop";
    backdrop.innerHTML = `<div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirmTitle"><h2 id="confirmTitle">${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p><div class="confirm-actions"><button class="${danger ? "danger-button" : "primary-button"}" data-confirm="yes">${escapeHtml(confirmText)}</button><button class="ghost-button" data-confirm="no">إلغاء</button></div></div>`;
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop || event.target.closest('[data-confirm="no"]')) backdrop.remove();
      if (event.target.closest('[data-confirm="yes"]')) { backdrop.remove(); onConfirm(); }
    });
    document.body.appendChild(backdrop);
  }

  async function copyText(value, successMessage = `تم نسخ كود الدخول: ${value}`) {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
      else {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      toast(successMessage);
    } catch (error) {
      toast(`كود الدخول: ${value}`, "error");
    }
  }

  function filterExams() {
    const search = document.getElementById("examSearch");
    const grade = document.getElementById("gradeFilter");
    if (!search || !grade) return;
    const term = search.value.trim().toLocaleLowerCase("ar");
    const list = store.exams.filter((exam) => {
      const content = `${exam.title} ${exam.subject || ""} ${exam.grade}`.toLocaleLowerCase("ar");
      return (!term || content.includes(term)) && (!grade.value || exam.grade === grade.value);
    });
    document.getElementById("examTableMount").innerHTML = examTable(list);
  }

  document.addEventListener("click", async (event) => {
    const nav = event.target.closest("[data-view]");
    if (nav) {
      if (nav.dataset.view === "create") beginDraft();
      else switchView(nav.dataset.view);
      return;
    }
    const actionElement = event.target.closest("[data-action]");
    if (!actionElement) return;
    const action = actionElement.dataset.action;
    if (action === "teacher-logout") {
      try { await api("/api/teacher/logout", { method: "POST", body: "{}" }); } catch (error) { /* Clear the page even if the session has expired. */ }
      teacherAuthed = false;
      if (teacherPoll) window.clearInterval(teacherPoll);
      render();
    }
    else if (action === "create") beginDraft();
    else if (action === "cancel-create") { draft = null; switchView("exams"); }
    else if (action === "copy") copyText(actionElement.dataset.code);
    else if (action === "copy-student-link") {
      const studentUrl = new URL("student.html", window.location.href);
      copyText(studentUrl.href, "تم نسخ رابط صفحة الطالب.");
    }
    else if (action === "open-student") {
      const studentUrl = new URL("student.html", window.location.href);
      if (actionElement.dataset.code) studentUrl.searchParams.set("code", actionElement.dataset.code);
      window.open(studentUrl.href, "_blank", "noopener,noreferrer");
    }
    else if (action === "add-video") beginVideoCreate();
    else if (action === "cancel-video") { videoDraft = null; currentView = "videos"; render(); }
    else if (action === "copy-video-code") copyText(actionElement.dataset.code, `تم نسخ كود مشاهدة الفيديو: ${actionElement.dataset.code}`);
    else if (action === "edit-video") beginVideoEdit(actionElement.dataset.id);
    else if (action === "delete-video") {
      const video = store.videos.find((item) => item.id === actionElement.dataset.id);
      if (!video) return;
      showConfirm({ title: "حذف فيديو الشرح؟", message: `سيُحذف ملف «${video.title}» نهائيًا، ولن يعمل كود المشاهدة بعد ذلك.`, confirmText: "حذف الفيديو", danger: true, onConfirm: async () => {
        try {
          const data = await api(`/api/teacher/videos/${encodeURIComponent(video.id)}`, { method: "DELETE" });
          store.videos = store.videos.filter((item) => item.id !== video.id);
          revision = data.revision || revision;
          render();
          toast("تم حذف فيديو الشرح.");
        } catch (error) { toast(error.message, "error"); }
      } });
    }

    else if (action === "add-question") {
      syncDraftFromForm();
      draft.questions.push(newQuestion());
      render();
      appContent.querySelector(".question-card:last-of-type textarea")?.focus();
    }
    else if (action === "remove-question") {
      if (draft.questions.length < 2) return;
      syncDraftFromForm();
      draft.questions = draft.questions.filter((question) => question.id !== actionElement.dataset.id);
      render();
    }
    else if (action === "edit-exam") beginEdit(actionElement.dataset.id);
    else if (action === "delete-exam") {
      const exam = store.exams.find((item) => item.id === actionElement.dataset.id);
      if (!exam) return;
      showConfirm({ title: "حذف الامتحان؟", message: `سيُحذف «${exam.title}» من قائمة الامتحانات. ستبقى النتائج السابقة محفوظة.`, confirmText: "حذف الامتحان", danger: true, onConfirm: async () => { store.exams = store.exams.filter((item) => item.id !== exam.id); if (await saveStore()) { render(); toast("تم حذف الامتحان."); } } });
    }
    else if (action === "view-result") { selectedResultId = actionElement.dataset.id; render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
    else if (action === "back-results") { selectedResultId = null; render(); }

  });

  document.addEventListener("input", (event) => {
    if (event.target.id === "examSearch" || event.target.id === "gradeFilter") filterExams();
    if (event.target.id === "videoSearch" || event.target.id === "videoGradeFilter") filterVideos();
    if (currentView === "create" && event.target.closest("#createForm")) syncDraftFromForm();
  });
  document.addEventListener("change", (event) => {
    if (event.target.id === "gradeFilter") filterExams();
    if (event.target.id === "videoGradeFilter") filterVideos();
    if (event.target.id === "videoFile") {
      const file = event.target.files?.[0];
      const label = event.target.closest(".video-file-drop");
      if (file && label) {
        label.querySelector("b").textContent = file.name;
        label.querySelector("small").textContent = `${formatFileSize(file.size)}${file.size > 800 * 1024 * 1024 ? " · الحجم أكبر من الحد" : " · جاهز للرفع"}`;
      }
    }
    if (event.target.id === "resultsGradeFilter") { selectedResultsGrade = event.target.value; render(); }
    if (event.target.matches('[data-q-field="correct"], [data-q-field="points"]')) syncDraftFromForm();
  });

  document.addEventListener("submit", async (event) => {
    if (event.target.id === "teacherAuthForm") {
      event.preventDefault();
      const form = event.target;
      const values = Object.fromEntries(new FormData(form).entries());
      const mode = form.dataset.mode;
      if (mode === "setup" && values.password !== values.confirmPassword) { toast("كلمتا المرور غير متطابقتين.", "error"); return; }
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        await api(mode === "setup" ? "/api/teacher/setup" : "/api/teacher/login", { method: "POST", body: JSON.stringify({ password: values.password, setupKey: values.setupKey }) });
        await loadTeacherState();
        teacherAuthed = true;
        currentView = "dashboard";
        render();
        startTeacherPolling();
      } catch (error) { toast(error.message, "error"); }
      finally { if (submit.isConnected) submit.disabled = false; }
      return;
    }
    if (event.target.id === "videoForm") {
      event.preventDefault();
      const form = event.target;
      const values = Object.fromEntries(new FormData(form).entries());
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        let data;
        if (videoDraft.editingId) {
          data = await api(`/api/teacher/videos/${encodeURIComponent(videoDraft.editingId)}`, {
            method: "PUT",
            body: JSON.stringify({ title: values.title, lesson: values.lesson, grade: values.grade })
          });
          store.videos = store.videos.map((video) => video.id === data.video.id ? data.video : video);
          toast("تم حفظ بيانات الفيديو.");
        } else {
          const file = form.elements.video.files[0];
          if (!file) { toast("اختر ملف الفيديو أولًا.", "error"); return; }
          if (file.size > 800 * 1024 * 1024) { toast("حجم الفيديو أكبر من الحد المسموح (800 ميجابايت).", "error"); return; }
          if (!["video/mp4", "video/webm"].includes(file.type) && !/\.(mp4|webm)$/i.test(file.name)) { toast("ارفع فيديو بصيغة MP4 أو WebM.", "error"); return; }
          const progressBox = document.getElementById("videoUploadProgress");
          const progress = document.querySelector("#videoUploadProgress progress");
          const status = document.getElementById("videoUploadStatus");
          progressBox.hidden = false;
          status.textContent = "جارٍ رفع الفيديو… 0٪";
          const formData = new FormData(form);
          data = await uploadVideo(formData, (percent) => {
            progress.value = percent;
            status.textContent = percent < 100 ? `جارٍ رفع الفيديو… ${percent}٪` : "اكتمل الرفع، جارٍ حفظ بيانات الدرس…";
          });
          store.videos.unshift(data.video);
          toast(`تم رفع الفيديو. كود المشاهدة: ${data.video.code}`);
        }
        revision = data.revision || revision;
        videoDraft = null;
        render();
      } catch (error) { toast(error.message, "error"); }
      finally { if (submit.isConnected) submit.disabled = false; }
      return;
    }
    if (event.target.id === "createForm") {
      event.preventDefault();
      syncDraftFromForm();
      if (!draft.title.trim() || !draft.grade) { toast("اكتب اسم الامتحان واختر الصف الدراسي.", "error"); return; }
      if (!draft.questions.length) { toast("أضف سؤالًا واحدًا على الأقل.", "error"); return; }
      for (let index = 0; index < draft.questions.length; index += 1) {
        const question = draft.questions[index];
        if (!question.prompt.trim()) { toast(`اكتب نص السؤال ${index + 1}.`, "error"); return; }
        if (question.options.some((option) => !option.trim())) { toast(`أكمل الاختيارات الأربعة للسؤال ${index + 1}.`, "error"); return; }
        if (question.correct == null) { toast(`حدد الإجابة الصحيحة للسؤال ${index + 1}.`, "error"); return; }
      }
      const payload = {
        title: draft.title.trim(), subject: draft.subject.trim(), grade: draft.grade,
        duration: Number(draft.duration), instructions: draft.instructions.trim(), code: draft.code,
        questions: draft.questions.map((question) => ({ ...question, prompt: question.prompt.trim(), options: question.options.map((option) => option.trim()) }))
      };
      const editingId = draft.editingId;
      let message;
      if (editingId) {
        const index = store.exams.findIndex((item) => item.id === editingId);
        if (index < 0) { toast("تعذر العثور على الامتحان المراد تعديله.", "error"); return; }
        store.exams[index] = { ...store.exams[index], ...payload };
        message = `تم حفظ تعديلات «${payload.title}».`;
      } else {
        const exam = { id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...payload, createdAt: new Date().toISOString() };
        store.exams.unshift(exam);
        message = `تم نشر الامتحان. كود الدخول: ${exam.code}`;
      }
      if (!(await saveStore())) return;
      draft = null;
      switchView("exams");
      toast(message);
    }
  });

  document.getElementById("mobileMenu").addEventListener("click", () => sidebar.classList.toggle("open"));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") sidebar.classList.remove("open");
  });

  (async function boot() {
    try {
      await loadTeacherState();
      teacherAuthed = true;
      render();
      startTeacherPolling();
    } catch (error) {
      try {
        const status = await api("/api/status");
        teacherNeedsSetup = !status.teacherConfigured;
      } catch (statusError) {
        teacherNeedsSetup = false;
        toast("تعذر الاتصال بالخادم. تأكد من تشغيل الموقع عبر node server.js.", "error");
      }
      teacherAuthed = false;
      render();
    }
  })();
})();
