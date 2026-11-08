(() => {
  "use strict";

  const grades = [
    "الصف الأول الابتدائي", "الصف الثاني الابتدائي", "الصف الثالث الابتدائي",
    "الصف الرابع الابتدائي", "الصف الخامس الابتدائي", "الصف السادس الابتدائي",
    "الصف الأول الإعدادي", "الصف الثاني الإعدادي", "الصف الثالث الإعدادي",
    "الصف الأول الثانوي", "الصف الثاني الثانوي", "الصف الثالث الثانوي"
  ];
  const letters = ["أ", "ب", "ج", "د", "هـ", "و"];
  const icons = {
    timer: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9 2h6M12 5V2"/></svg>',
    question: '<svg viewBox="0 0 24 24"><path d="M9.5 9a2.5 2.5 0 1 1 4.7 1.2c-.8 1.4-2.2 1.5-2.2 3.3"/><path d="M12 17.5h.01"/><circle cx="12" cy="12" r="9"/></svg>',
    score: '<svg viewBox="0 0 24 24"><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 5-6"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>'
  };
  const app = document.getElementById("studentApp");
  const toastRegion = document.getElementById("toastRegion");
  const requestedCode = new URLSearchParams(window.location.search).get("code") || "";
  let profile = null;
  let results = [];
  let authMode = "login";
  let attempt = null;
  let activeVideo = null;
  let resultId = null;
  let timerHandle = null;
  let submitting = false;

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || "تعذر إكمال الطلب. حاول مرة أخرى.");
      error.data = data;
      throw error;
    }
    return data;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function toast(message, isError = false) {
    const item = document.createElement("div");
    item.className = `toast ${isError ? "error" : ""}`;
    item.innerHTML = `<span class="toast-icon">${isError ? "!" : "✓"}</span><span>${escapeHtml(message)}</span>`;
    toastRegion.appendChild(item);
    window.setTimeout(() => item.remove(), 3200);
  }

  function maxScore(exam) {
    return exam.questions.reduce((total, question) => total + Number(question.points || 0), 0);
  }

  function render() {
    if (timerHandle) { window.clearInterval(timerHandle); timerHandle = null; }
    if (!profile) app.innerHTML = renderAuth();
    else if (activeVideo) app.innerHTML = renderVideoPlayer();
    else if (attempt) app.innerHTML = renderExam();
    else if (resultId) app.innerHTML = renderResult(resultId);
    else app.innerHTML = renderJoin();
    if (attempt) startTimer();
  }

  function brand(name = "") {
    return `<div class="student-brand"><span class="brand-mark"><span></span><span></span><span></span></span><span class="student-brand-title">الحاوي<small>الأستاذ أحمد مصطفى</small></span>${name ? `<span class="student-name">${escapeHtml(name)}</span>` : ""}</div>`;
  }

  function renderAuth() {
    const signup = authMode === "signup";
    const gradeOptions = [`<option value="">اختر الصف الدراسي</option>`, ...grades.map((grade) => `<option value="${escapeHtml(grade)}">${escapeHtml(grade)}</option>`)].join("");
    return `<div class="student-shell">${brand()}<div class="join-card card"><div class="join-form-pane"><div class="eyebrow">حساب الطالب</div><h1>${signup ? "إنشاء حساب طالب" : "تسجيل دخول الطالب"}</h1><p>${signup ? "شاهد الشروحات، وامتحن، وتابع نتائجك." : "تابع شروحاتك وامتحاناتك ونتائجك."}</p>
      <form id="authForm" data-mode="${signup ? "signup" : "login"}">
        ${signup ? `<div class="field"><label for="studentName">اسم الطالب</label><input id="studentName" name="name" required minlength="2" maxlength="80" autocomplete="name" placeholder="الاسم الكامل" /></div><div class="field"><label for="studentGrade">الصف الدراسي</label><select id="studentGrade" name="grade" required>${gradeOptions}</select></div><div class="field"><label for="studentPhone">رقم هاتف الطالب</label><input id="studentPhone" name="phone" type="tel" inputmode="tel" required minlength="8" maxlength="20" autocomplete="tel" placeholder="رقم الهاتف" /></div>` : `<div class="field"><label for="loginPhone">رقم هاتف الطالب</label><input id="loginPhone" name="phone" type="tel" inputmode="tel" required autocomplete="username" placeholder="رقم الهاتف المسجل" /></div>`}
        <div class="field"><label for="studentPassword">كلمة المرور</label><input id="studentPassword" name="password" type="password" required minlength="8" autocomplete="${signup ? "new-password" : "current-password"}" placeholder="٨ أحرف على الأقل" /></div>
        <button class="primary-button join-submit" type="submit">${signup ? "إنشاء حسابي" : "دخول إلى حسابي"} <span>←</span></button>
      </form><p class="auth-switch">${signup ? "لديك حساب بالفعل؟" : "أول مرة هنا؟"} <button class="link-button" type="button" data-action="toggle-auth">${signup ? "سجّل الدخول" : "أنشئ حسابًا"}</button></p>
      </div><div class="join-art-pane"><div class="student-illustration"><svg viewBox="0 0 48 48"><path d="M10 10h19a4 4 0 0 1 4 4v25H14a4 4 0 0 1-4-4V10Z"/><path d="M14 16h13M14 21h13M14 26h8M31 18l5-5 5 5v13h-5l-5 5V18Z"/><path d="m34 24 2 2 3-4"/></svg></div><h2>تعلّم وتابع تقدمك</h2><p>شروحاتك ونتائجك في حسابك الخاص.</p><span class="tiny-spark">✳</span></div></div></div>`;
  }

  function renderVideoPlayer() {
    return `<div class="student-shell">${brand(profile.name)}<button class="ghost-button student-video-back" data-action="back-video">← العودة للصفحة الرئيسية</button><section class="student-video-player-card card"><div class="student-video-player-heading"><div><div class="eyebrow">مكتبة فيديوهات الشرح</div><h1>${escapeHtml(activeVideo.title)}</h1><p>${escapeHtml(activeVideo.lesson)} · ${escapeHtml(activeVideo.grade)}</p></div></div><div class="student-video-frame"><video controls playsinline preload="metadata" controlslist="nodownload" src="${escapeHtml(activeVideo.streamUrl)}">متصفحك لا يدعم تشغيل الفيديو.</video></div><div class="student-video-player-foot"><span>${formatStudentFileSize(activeVideo.size)}</span></div></section></div>`;
  }

  function formatStudentFileSize(bytes) {
    const size = Number(bytes) || 0;
    return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} ميجابايت` : `${Math.max(1, Math.round(size / 1024))} كيلوبايت`;
  }

  function renderJoin() {
    const history = [...results].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    const historyMarkup = history.length ? `<div class="profile-results card"><div class="section-title"><div><h2>درجاتي السابقة</h2><p>اضغط على محاولة لمراجعة إجاباتك</p></div></div><div class="student-history">${history.map((result) => `<button class="student-history-row" data-action="view-result" data-id="${escapeHtml(result.id)}"><span class="history-copy"><b>${escapeHtml(result.examTitle)}</b><small>${escapeHtml(result.studentGrade || profile.grade)} · ${new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", year: "numeric" }).format(new Date(result.submittedAt))}</small></span><span class="history-score">${result.score}<small> / ${result.maxScore}</small></span><span class="history-percent">${Math.round(result.percentage)}٪</span></button>`).join("")}</div></div>` : `<div class="card empty-state profile-empty"><span class="empty-icon">${icons.score}</span><b>ستظهر درجاتك هنا بعد أول امتحان</b><p>بعد تسليم الامتحان يمكنك مراجعة درجتك وإجاباتك من ملفك الشخصي.</p></div>`;
    return `<div class="student-shell">${brand(profile.name)}<section class="student-profile-card card"><div class="student-profile-top"><div class="profile-avatar" aria-hidden="true">${escapeHtml(Array.from(profile.name)[0] || "ط")}</div><div class="student-profile-title"><div class="eyebrow">ملفي الشخصي</div><h1>${escapeHtml(profile.name)}</h1><span>حساب الطالب</span></div><div class="student-profile-actions"><button class="link-button" data-action="logout">تسجيل الخروج</button></div></div><div class="profile-details-grid"><div class="profile-detail"><span>الصف الدراسي</span><b>${escapeHtml(profile.grade)}</b></div><div class="profile-detail"><span>رقم الهاتف</span><b dir="ltr">${escapeHtml(profile.phone)}</b></div></div></section><section class="student-video-access card"><div class="student-video-access-mark"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/></svg></div><div class="student-video-access-copy"><div class="eyebrow">شرح الدروس</div><h2>شاهد فيديو الدرس</h2><p>أدخل كود المشاهدة الذي أرسله المدرس.</p></div><form id="videoCodeForm"><label class="sr-only" for="videoAccessCode">كود مشاهدة الفيديو</label><input id="videoAccessCode" name="code" required maxlength="12" placeholder="كود الفيديو" autocomplete="off" /><button class="primary-button" type="submit">فتح الدرس ←</button></form></section><div class="join-card card student-entry-card"><div class="join-form-pane"><div class="eyebrow">صفحة الطالب</div><h2>ادخل امتحانك</h2><p>اكتب كود الامتحان المرسل من المدرس لبدء الحل.</p><form id="joinForm"><div class="field"><label for="joinCode">كود الامتحان</label><input id="joinCode" name="code" required maxlength="12" placeholder="مثال: TALIBA" autocomplete="off" value="${escapeHtml(requestedCode)}" style="text-align:right;letter-spacing:1px;text-transform:uppercase" /></div><button class="primary-button join-submit" type="submit">دخول الامتحان <span>←</span></button></form></div><div class="join-art-pane"><div class="student-illustration"><svg viewBox="0 0 48 48"><path d="M10 10h19a4 4 0 0 1 4 4v25H14a4 4 0 0 1-4-4V10Z"/><path d="M14 16h13M14 21h13M14 26h8M31 18l5-5 5 5v13h-5l-5 5V18Z"/><path d="m34 24 2 2 3-4"/></svg></div><h2>أهلاً بك يا ${escapeHtml(profile.name)}</h2><p>بعد التسليم، ستظهر نتيجتك هنا في حسابك.</p><span class="tiny-spark">✳</span></div></div>${historyMarkup}</div>`;
  }

  function renderExam() {
    const exam = attempt.exam;
    const question = exam.questions[attempt.index];
    const answered = Object.keys(attempt.answers).length;
    const progress = Math.round(((attempt.index + 1) / exam.questions.length) * 100);
    const options = question.options.map((option, index) => `<button type="button" class="student-option ${attempt.answers[question.id] === index ? "selected" : ""}" data-action="answer" data-index="${index}" aria-pressed="${attempt.answers[question.id] === index ? "true" : "false"}"><span class="option-letter">${letters[index] || index + 1}</span><span>${escapeHtml(option)}</span></button>`).join("");
    const dots = exam.questions.map((item, index) => `<button type="button" class="question-dot ${index === attempt.index ? "current" : ""} ${attempt.answers[item.id] != null ? "answered" : ""}" aria-label="السؤال ${index + 1}" data-action="goto-question" data-index="${index}">${index + 1}</button>`).join("");
    const instructions = exam.instructions ? `<p class="exam-instructions">${escapeHtml(exam.instructions)}</p>` : "";
    return `<div class="student-shell">${brand(profile.name)}<div class="exam-intro"><div class="exam-intro-top"><span class="status-pill">امتحان جارٍ</span><span class="timer-pill" id="examTimer">${icons.timer}<span>--:--</span></span></div><h1>${escapeHtml(exam.title)}</h1><p>${escapeHtml(exam.subject || "امتحان")} · ${escapeHtml(exam.grade)}</p>${instructions}<div class="exam-detail-items"><span>${icons.question}<b>${exam.questions.length}</b> أسئلة</span><span>${icons.score}<b>${maxScore(exam)}</b> درجات</span><span>${icons.timer}<b>${Number(exam.duration)}</b> دقيقة</span></div></div><div class="progress-section"><div class="progress-meta"><span>السؤال ${attempt.index + 1} من ${exam.questions.length}</span><span>${answered} من ${exam.questions.length} أُجيب عنها</span></div><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div></div><div class="exam-workspace"><section class="card question-panel"><div class="question-topline"><span>السؤال ${String(attempt.index + 1).padStart(2, "0")}</span><b>${Number(question.points)} درجة</b></div><h2>${escapeHtml(question.prompt)}</h2><div class="student-options">${options}</div><div class="exam-controls">${attempt.index > 0 ? '<button type="button" class="outline-button" data-action="previous">→ السابق</button>' : "<span></span>"}${attempt.index < exam.questions.length - 1 ? '<button type="button" class="primary-button" data-action="next">التالي ←</button>' : '<button type="button" class="primary-button submit-exam" data-action="submit-exam">إنهاء وتسليم الإجابات</button>'}</div>${attempt.index < exam.questions.length - 1 ? '<div class="exam-controls" style="margin-top:7px"><button type="button" class="link-button submit-exam" data-action="submit-exam">تسليم الامتحان</button></div>' : ""}</section><aside class="card question-nav"><b>أسئلة الامتحان</b><div class="question-dots">${dots}</div><small>اضغط على رقم السؤال للانتقال إليه. راجع إجاباتك قبل التسليم.</small></aside></div></div>`;
  }

  function renderResult(id) {
    const result = results.find((item) => item.id === id);
    if (!result) { resultId = null; return renderJoin(); }
    const correctCount = result.answers.filter((answer) => answer.earned === answer.points).length;
    const reviews = result.answers.map((answer, index) => {
      const correct = answer.earned === answer.points;
      const selected = answer.selectedIndex == null ? "لم تتم الإجابة" : answer.options[answer.selectedIndex];
      const right = answer.options[answer.correctIndex];
      return `<article class="card review-question"><div class="review-head"><b>${index + 1}. ${escapeHtml(answer.prompt)}</b><span class="review-mark ${correct ? "" : "incorrect"}">${correct ? "إجابة صحيحة" : answer.selectedIndex == null ? "بدون إجابة" : "تحتاج مراجعة"}</span></div><div class="review-answer"><span>إجابتك: <b>${escapeHtml(selected)}</b></span>${correct ? "" : `<span>الإجابة الصحيحة: <b class="correct-answer">${escapeHtml(right)}</b></span>`}</div><div class="review-points">الدرجة: ${answer.earned} من ${answer.points}</div></article>`;
    }).join("");
    return `<div class="student-shell">${brand(profile.name)}<div class="result-hero card"><div class="result-check">${icons.check}</div><h1>أحسنت يا ${escapeHtml(profile.name)}!</h1><p>تم تسليم إجاباتك في ${escapeHtml(result.examTitle)}</p><div class="result-score"><b>${result.score}</b><span>/ ${result.maxScore} درجة</span></div><div class="result-meta"><span>النسبة <b>${Math.round(result.percentage)}٪</b></span><span>إجابات صحيحة <b>${correctCount}</b> من ${result.answers.length}</span></div></div><div class="section-title" style="margin:21px 0 11px"><div><h2>مراجعة إجاباتك</h2><p>الإجابة الصحيحة موضحة باللون الأخضر</p></div></div><div class="review-list">${reviews}</div><div class="student-finish"><button class="ghost-button" data-action="back-profile">العودة لملفي ودرجاتي</button></div></div>`;
  }

  function startTimer() {
    updateTimer();
    if (attempt) timerHandle = window.setInterval(updateTimer, 1000);
  }

  function updateTimer() {
    if (!attempt) return;
    const remaining = Math.max(0, Math.ceil((attempt.endsAt - Date.now()) / 1000));
    const timer = document.getElementById("examTimer");
    if (timer) {
      const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
      const seconds = String(remaining % 60).padStart(2, "0");
      timer.innerHTML = `${icons.timer}<span>${minutes}:${seconds}</span>`;
      timer.classList.toggle("warning", remaining <= 60);
    }
    if (remaining === 0) submitAttempt(true);
  }

  function confirmSubmit() {
    if (!attempt || submitting) return;
    const unanswered = attempt.exam.questions.length - Object.keys(attempt.answers).length;
    const backdrop = document.createElement("div");
    backdrop.className = "confirm-backdrop";
    backdrop.innerHTML = `<div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="studentConfirmTitle"><h2 id="studentConfirmTitle">تسليم الامتحان؟</h2><p>${unanswered ? `لم تُجب عن ${unanswered} سؤال. ` : ""}بعد التسليم ستظهر درجتك ومراجعة إجاباتك.</p><div class="confirm-actions"><button class="primary-button" data-confirm="yes">تسليم ومشاهدة النتيجة</button><button class="ghost-button" data-confirm="no">متابعة الحل</button></div></div>`;
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop || event.target.closest('[data-confirm="no"]')) backdrop.remove();
      else if (event.target.closest('[data-confirm="yes"]')) { backdrop.remove(); submitAttempt(false); }
    });
    document.body.appendChild(backdrop);
  }

  async function submitAttempt(autoSubmitted) {
    if (!attempt || submitting) return;
    submitting = true;
    if (timerHandle) window.clearInterval(timerHandle);
    timerHandle = null;
    try {
      const data = await api("/api/student/attempts/submit", { method: "POST", body: JSON.stringify({ attemptId: attempt.id, answers: attempt.answers }) });
      results.unshift(data.result);
      attempt = null;
      resultId = data.result.id;
      render();
      if (autoSubmitted) toast("انتهى الوقت، وتم تسليم إجاباتك تلقائيًا.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      if (error.data?.previousResult) {
        results.unshift(error.data.previousResult);
        attempt = null;
        resultId = error.data.previousResult.id;
        render();
        toast("تم تسليم هذا الامتحان من حسابك بالفعل، وهذه نتيجتك.", true);
      } else {
        toast(error.message, true);
        if (attempt && Date.now() <= attempt.endsAt + 120_000) startTimer();
      }
    } finally { submitting = false; }
  }

  async function logout() {
    try { await api("/api/student/logout", { method: "POST", body: "{}" }); }
    catch (error) { /* Expired sessions are handled by clearing the local screen state. */ }
    profile = null;
    results = [];
    attempt = null;
    activeVideo = null;
    resultId = null;
    authMode = "login";
    render();
  }

  app.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "toggle-auth") { authMode = authMode === "signup" ? "login" : "signup"; render(); }
    else if (action === "logout") await logout();
    else if (action === "back-video") { activeVideo = null; render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
    else if (action === "back-profile") { resultId = null; render(); }
    else if (action === "view-result") { resultId = button.dataset.id; render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
    else if (action === "answer" && attempt) {
      const question = attempt.exam.questions[attempt.index];
      if (!question) return;
      attempt.answers[question.id] = Number(button.dataset.index);
      render();
    }
    else if (action === "previous" && attempt) { attempt.index = Math.max(0, attempt.index - 1); render(); }
    else if (action === "next" && attempt) { attempt.index = Math.min(attempt.exam.questions.length - 1, attempt.index + 1); render(); }
    else if (action === "goto-question" && attempt) { attempt.index = Math.max(0, Math.min(attempt.exam.questions.length - 1, Number(button.dataset.index))); render(); }
    else if (action === "submit-exam") confirmSubmit();
  });

  app.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      if (form.id === "authForm") {
        const values = Object.fromEntries(new FormData(form).entries());
        const mode = form.dataset.mode;
        const data = await api(mode === "signup" ? "/api/student/signup" : "/api/student/login", { method: "POST", body: JSON.stringify(values) });
        profile = data.profile;
        results = data.results || [];
        render();
      } else if (form.id === "passwordForm") {
        const values = Object.fromEntries(new FormData(form).entries());
        await api("/api/student/password", { method: "POST", body: JSON.stringify(values) });
        form.reset();
        toast("تم تحديث كلمة المرور.");
      } else if (form.id === "videoCodeForm") {
        const code = String(new FormData(form).get("code") || "").replace(/\s+/g, "").toUpperCase();
        const data = await api("/api/student/videos/access", { method: "POST", body: JSON.stringify({ code }) });
        activeVideo = { ...data.video, streamUrl: data.streamUrl };
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (form.id === "joinForm") {
        const code = String(new FormData(form).get("code") || "").trim().toUpperCase().replace(/\s+/g, "");
        const data = await api("/api/student/attempts/start", { method: "POST", body: JSON.stringify({ code }) });
        if (data.alreadyTaken) {
          results = [data.result, ...results.filter((result) => result.id !== data.result.id)];
          resultId = data.result.id;
          toast("أكملت هذا الامتحان من قبل. هذه نتيجتك السابقة.");
          render();
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        attempt = { id: data.attemptId, exam: data.exam, answers: {}, index: 0, startedAt: data.startedAt, endsAt: data.endsAt };
        resultId = null;
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (error) { toast(error.message, true); }
    finally { if (submit && submit.isConnected) submit.disabled = false; }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") document.querySelector(".confirm-backdrop")?.remove();
  });

  (async function boot() {
    try {
      const data = await api("/api/student/me");
      profile = data.profile;
      results = data.results || [];
    } catch (error) { authMode = "login"; }
    render();
  })();
})();
