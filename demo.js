(() => {
  "use strict";

  const isGitHubPages = window.location.hostname.endsWith(".github.io");
  const isExplicitDemo = new URLSearchParams(window.location.search).get("demo") === "1";
  if (!isGitHubPages && !isExplicitDemo) return;

  window.ALHAWY_STATIC_DEMO = true;

  const storageKey = "alhawy-static-demo-v1";
  const exam = {
    id: "demo-exam-1",
    title: "مراجعة الوحدة الأولى",
    subject: "الدراسات الاجتماعية",
    grade: "الصف الثالث الإعدادي",
    code: "HAWY26",
    duration: 10,
    instructions: "هذه محاولة تجريبية للتعرف على شكل الامتحان.",
    createdAt: "2026-10-24T10:00:00.000Z",
    questions: [
      {
        id: "demo-question-1",
        prompt: "ما عاصمة مصر؟",
        options: ["الإسكندرية", "القاهرة", "الأقصر", "أسوان"],
        correct: 1,
        points: 2
      },
      {
        id: "demo-question-2",
        prompt: "أي نهر ارتبط بقيام الحضارة المصرية القديمة؟",
        options: ["نهر النيل", "نهر دجلة", "نهر الفرات", "نهر الأردن"],
        correct: 0,
        points: 3
      }
    ]
  };
  const profile = {
    id: "demo-student",
    name: "محمد أحمد",
    grade: "الصف الثالث الإعدادي",
    phone: "01000000000"
  };
  const sampleResult = {
    id: "demo-result-1",
    examId: exam.id,
    examTitle: exam.title,
    studentId: profile.id,
    studentName: profile.name,
    studentGrade: profile.grade,
    studentClass: "٣/أ",
    score: 2,
    maxScore: 5,
    percentage: 40,
    submittedAt: "2026-10-24T10:30:00.000Z",
    answers: [
      { questionId: exam.questions[0].id, prompt: exam.questions[0].prompt, options: exam.questions[0].options, selectedIndex: 1, correctIndex: 1, points: 2, earned: 2 },
      { questionId: exam.questions[1].id, prompt: exam.questions[1].prompt, options: exam.questions[1].options, selectedIndex: 1, correctIndex: 0, points: 3, earned: 0 }
    ]
  };
  const initialState = {
    revision: 1,
    exams: [exam],
    results: [sampleResult],
    videos: [],
    profile,
    studentLoggedIn: true,
    attempt: null
  };

  function loadState() {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return structuredClone(initialState);
    try {
      return { ...structuredClone(initialState), ...JSON.parse(saved) };
    } catch (error) {
      console.error("تعذر قراءة بيانات العرض المحلية؛ ستتم إعادة تهيئتها.", error);
      window.localStorage.removeItem(storageKey);
      return structuredClone(initialState);
    }
  }

  let state = loadState();
  const originalFetch = window.fetch.bind(window);

  function saveState() {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function response(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }

  async function readBody(init) {
    if (!init?.body) return {};
    if (typeof init.body === "string") return JSON.parse(init.body);
    return {};
  }

  function fail(message, status = 400) {
    return response({ error: message }, status);
  }

  function resultFor(attempt, answers) {
    const reviewedAnswers = attempt.exam.questions.map((question) => {
      const selected = answers[question.id];
      const selectedIndex = Number.isInteger(selected) && selected >= 0 && selected < question.options.length
        ? selected
        : null;
      const points = Number(question.points) || 0;
      return {
        questionId: question.id,
        prompt: question.prompt,
        options: [...question.options],
        selectedIndex,
        correctIndex: Number(question.correct),
        points,
        earned: selectedIndex === Number(question.correct) ? points : 0
      };
    });
    const maxScore = reviewedAnswers.reduce((sum, answer) => sum + answer.points, 0);
    const score = reviewedAnswers.reduce((sum, answer) => sum + answer.earned, 0);
    return {
      id: `demo-result-${Date.now()}`,
      examId: attempt.exam.id,
      examTitle: attempt.exam.title,
      studentId: state.profile.id,
      studentName: state.profile.name,
      studentGrade: state.profile.grade,
      studentClass: "٣/أ",
      score,
      maxScore,
      percentage: maxScore ? Math.round((score / maxScore) * 100) : 0,
      submittedAt: new Date().toISOString(),
      answers: reviewedAnswers
    };
  }

  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, window.location.href);
    if (!url.pathname.startsWith("/api/")) return originalFetch(input, init);

    const method = (init.method || "GET").toUpperCase();
    const route = url.pathname;
    const body = await readBody(init);

    if (route === "/api/status" && method === "GET") return response({ teacherConfigured: true });

    if (route === "/api/teacher/state" && method === "GET") {
      return response({ revision: state.revision, exams: state.exams, results: state.results, videos: state.videos });
    }
    if (route === "/api/teacher/state" && method === "PUT") {
      state.exams = Array.isArray(body.exams) ? body.exams : state.exams;
      state.revision += 1;
      saveState();
      return response({ revision: state.revision, exams: state.exams, results: state.results, videos: state.videos });
    }
    if (route === "/api/teacher/login" || route === "/api/teacher/setup" || route === "/api/teacher/logout") {
      return response({ ok: true });
    }
    if (route === "/api/student/me" && method === "GET") {
      return state.studentLoggedIn
        ? response({ profile: state.profile, results: state.results.filter((item) => item.studentId === state.profile.id) })
        : fail("سجّل الدخول إلى حساب العرض للمتابعة.", 401);
    }
    if ((route === "/api/student/signup" || route === "/api/student/login") && method === "POST") {
      state.profile = {
        id: "demo-student",
        name: String(body.name || state.profile.name),
        grade: String(body.grade || state.profile.grade),
        phone: String(body.phone || state.profile.phone)
      };
      state.studentLoggedIn = true;
      saveState();
      return response({ profile: state.profile, results: state.results.filter((item) => item.studentId === state.profile.id) });
    }
    if (route === "/api/student/logout" && method === "POST") {
      state.studentLoggedIn = false;
      saveState();
      return response({ ok: true });
    }
    if (route === "/api/student/password" && method === "POST") return response({ ok: true });
    if (route === "/api/student/attempts/start" && method === "POST") {
      const found = state.exams.find((item) => item.code.toUpperCase() === String(body.code || "").trim().toUpperCase());
      if (!found) return fail("كود العرض للامتحان هو HAWY26.", 404);
      const startedAt = Date.now();
      state.attempt = { id: `demo-attempt-${startedAt}`, exam: found, startedAt, endsAt: startedAt + Number(found.duration) * 60_000 };
      saveState();
      return response({ attemptId: state.attempt.id, startedAt, endsAt: state.attempt.endsAt, exam: found });
    }
    if (route === "/api/student/attempts/submit" && method === "POST") {
      if (!state.attempt || state.attempt.id !== body.attemptId) return fail("ابدأ الامتحان مرة أخرى.", 404);
      const result = resultFor(state.attempt, body.answers || {});
      state.results.unshift(result);
      state.attempt = null;
      state.revision += 1;
      saveState();
      return response({ result });
    }
    if (route === "/api/student/videos/access" && method === "POST") {
      return fail("تشغيل الفيديوهات ورفعها غير متاح في نسخة العرض الثابتة.", 501);
    }

    return fail("هذه العملية غير متاحة في نسخة العرض الثابتة.", 501);
  };

  const style = document.createElement("style");
  style.textContent = `
    body { padding-top: 42px !important; }
    .static-demo-banner {
      position: fixed; inset: 0 0 auto; z-index: 10000; min-height: 42px;
      display: flex; align-items: center; justify-content: center; padding: 8px 16px;
      background: #173c36; color: #fff; text-align: center;
      font: 500 13px/1.6 "IBM Plex Sans Arabic", sans-serif;
    }
  `;
  document.head.append(style);
  const banner = document.createElement("div");
  banner.className = "static-demo-banner";
  banner.textContent = "نسخة عرض مجانية — بيانات تجريبية محفوظة على هذا المتصفح فقط، دون خادم أو رفع فيديوهات.";
  document.body.prepend(banner);
})();
