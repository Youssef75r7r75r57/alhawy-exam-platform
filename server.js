"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Busboy = require("busboy");
const { pipeline } = require("node:stream/promises");

const ROOT = __dirname;
const DATA_DIR = path.resolve(process.env.MIYAAR_DATA_DIR || ROOT);
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, ".miyaar-data.json");
const VIDEO_DIR = path.join(DATA_DIR, "videos");
fs.mkdirSync(VIDEO_DIR, { recursive: true });
const PORT = Number(process.env.PORT) || 4173;
const MAX_VIDEO_BYTES = 800 * 1024 * 1024;
const VIDEO_CODE_MAX_USES = 2;
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const VIDEO_GRADES = [
  "الصف الأول الابتدائي", "الصف الثاني الابتدائي", "الصف الثالث الابتدائي",
  "الصف الرابع الابتدائي", "الصف الخامس الابتدائي", "الصف السادس الابتدائي",
  "الصف الأول الإعدادي", "الصف الثاني الإعدادي", "الصف الثالث الإعدادي",
  "الصف الأول الثانوي", "الصف الثاني الثانوي", "الصف الثالث الثانوي"
];
const sessions = new Map();
const activeAttempts = new Map();
const loginFailures = new Map();

const starterExam = {
  id: "demo-history", title: "مراجعة تاريخ مصر القديمة", subject: "الدراسات الاجتماعية", grade: "الصف الأول الإعدادي",
  duration: 10, instructions: "اختر الإجابة الصحيحة لكل سؤال، وخذ وقتك في التفكير.", code: "TALIBA", createdAt: new Date().toISOString(),
  questions: [
    { id: "demo-q1", prompt: "ما النهر الذي قامت على ضفافه الحضارة المصرية القديمة؟", options: ["نهر النيل", "نهر دجلة", "نهر الفرات", "نهر الأردن"], correct: 0, points: 2 },
    { id: "demo-q2", prompt: "أي من الآثار التالية بناه المصريون القدماء؟", options: ["الأهرامات", "قلعة قايتباي", "برج القاهرة", "قلعة صلاح الدين"], correct: 0, points: 2 },
    { id: "demo-q3", prompt: "ما اسم الكتابة التصويرية التي استخدمها المصري القديم؟", options: ["الخط العربي", "الكتابة الهيروغليفية", "الكتابة المسمارية", "الكتابة اللاتينية"], correct: 1, points: 2 }
  ]
};

function loadDatabase() {
  try {
    const value = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    if (value && Array.isArray(value.students) && Array.isArray(value.exams) && Array.isArray(value.results)) {
      return { version: 1, revision: Number(value.revision) || 1, teacher: value.teacher || null, students: value.students, exams: value.exams, results: value.results, videos: Array.isArray(value.videos) ? value.videos : [] };
    }
  } catch (error) { /* Create the first database on first launch. */ }
  return { version: 1, revision: 1, teacher: null, students: [], exams: process.env.NODE_ENV === "production" ? [] : [starterExam], results: [], videos: [] };
}

let db = loadDatabase();
const removeOldMotherPhones = db.students.some((student) => Object.hasOwn(student, "motherPhone"));
if (removeOldMotherPhones) db.students.forEach((student) => { delete student.motherPhone; });
const setupKey = process.env.MIYAAR_SETUP_KEY || crypto.randomBytes(10).toString("hex");

function persist() {
  db.revision += 1;
  const temp = `${DB_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(db), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temp, DB_FILE);
}

if (removeOldMotherPhones) persist();

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

function fail(res, status, message) { send(res, status, { error: message }); }

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) { reject(Object.assign(new Error("حجم الطلب كبير."), { status: 413 })); req.destroy(); }
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (error) { reject(Object.assign(new Error("صيغة البيانات غير صحيحة."), { status: 400 })); }
    });
    req.on("error", reject);
  });
}

function normalizePhone(value) {
  return String(value || "").replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[\s()+-]/g, "");
}

function passwordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  return new Promise((resolve, reject) => crypto.scrypt(String(password), salt, 64, (error, key) => error ? reject(error) : resolve({ salt, hash: key.toString("hex") })));
}

async function verifyPassword(password, record) {
  if (!record || !record.salt || !record.hash) return false;
  const attempt = await passwordHash(password, record.salt);
  const saved = Buffer.from(record.hash, "hex");
  const actual = Buffer.from(attempt.hash, "hex");
  return saved.length === actual.length && crypto.timingSafeEqual(saved, actual);
}

function readCookie(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)miyaar_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function getSession(req) {
  const token = readCookie(req);
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) { sessions.delete(token); return null; }
  session.expiresAt = Date.now() + SESSION_TTL;
  return { ...session, token };
}

function sessionCookie(token, req) {
  const secure = req.socket.encrypted || req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  return `miyaar_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_TTL / 1000)}${secure}`;
}

function createSession(res, req, role, studentId = "") {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, { role, studentId, expiresAt: Date.now() + SESSION_TTL });
  res.setHeader("Set-Cookie", sessionCookie(token, req));
}

function clearSession(req, res) {
  const token = readCookie(req);
  if (token) sessions.delete(token);
  const secure = req.socket.encrypted || req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `miyaar_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
}

function teacherOnly(req, res) {
  if (getSession(req)?.role === "teacher") return true;
  fail(res, 401, "سجّل دخولك إلى صفحة المدرس أولاً.");
  return false;
}

function studentOnly(req, res) {
  const session = getSession(req);
  if (session?.role === "student" && db.students.some((student) => student.id === session.studentId)) return session;
  fail(res, 401, "سجّل دخولك إلى حساب الطالب أولاً.");
  return null;
}

function safeStudent(student) {
  return { id: student.id, name: student.name, grade: student.grade, phone: student.phone, createdAt: student.createdAt };
}

function safeExam(exam) {
  return { ...exam, questions: exam.questions.map(({ correct, ...question }) => question) };
}

function safeVideo(video, includeCode = false) {
  const visible = {
    id: video.id, title: video.title, lesson: video.lesson, grade: video.grade,
    mimeType: video.mimeType, size: video.size, createdAt: video.createdAt
  };
  if (includeCode) visible.code = video.code;
  return visible;
}

function newVideoCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 7 }, () => characters[crypto.randomInt(characters.length)]).join("");
  } while (db.videos.some((video) => video.code === code));
  return code;
}

function receiveVideoUpload(req) {
  return new Promise((resolve, reject) => {
    let parser;
    try {
      parser = Busboy({ headers: req.headers, limits: { fileSize: MAX_VIDEO_BYTES, files: 1, fields: 3, parts: 5, fieldSize: 200 } });
    } catch (error) {
      reject(Object.assign(new Error("أرسل ملف فيديو بصيغة صحيحة."), { status: 400 }));
      return;
    }

    const fields = {};
    let upload = null;
    let fileTask = Promise.resolve();
    let parseError = null;

    parser.on("field", (name, value) => { fields[name] = value; });
    parser.on("file", (name, file, info) => {
      const mimeExtension = { "video/mp4": "mp4", "video/webm": "webm" }[info.mimeType];
      const nameExtension = { ".mp4": "mp4", ".webm": "webm" }[path.extname(info.filename || "").toLowerCase()];
      const extension = mimeExtension || nameExtension;
      if (name !== "video" || upload || !extension) {
        parseError ||= Object.assign(new Error("ارفع ملف فيديو MP4 أو WebM واحدًا فقط."), { status: 400 });
        file.resume();
        return;
      }

      const fileName = `${crypto.randomUUID()}.${extension}`;
      const target = path.join(VIDEO_DIR, fileName);
      let exceededLimit = false;
      file.once("limit", () => {
        exceededLimit = true;
        parseError ||= Object.assign(new Error("حجم الفيديو أكبر من الحد المسموح (800 ميجابايت)."), { status: 413 });
      });
      upload = { fileName, mimeType: extension === "webm" ? "video/webm" : "video/mp4", size: 0 };
      fileTask = pipeline(file, fs.createWriteStream(target, { flags: "wx", mode: 0o600 }))
        .then(() => {
          if (exceededLimit) return;
          upload.size = fs.statSync(target).size;
        })
        .catch((error) => { parseError ||= error; });
    });
    parser.on("filesLimit", () => { parseError ||= Object.assign(new Error("ارفع ملف فيديو واحدًا فقط."), { status: 400 }); });
    parser.on("fieldsLimit", () => { parseError ||= Object.assign(new Error("بيانات الفيديو غير مكتملة."), { status: 400 }); });
    parser.on("partsLimit", () => { parseError ||= Object.assign(new Error("بيانات الفيديو غير مكتملة."), { status: 400 }); });
    parser.on("error", (error) => { parseError ||= error; });
    parser.on("close", async () => {
      await fileTask;
      if (parseError || !upload || !upload.size) {
        if (upload) fs.rmSync(path.join(VIDEO_DIR, upload.fileName), { force: true });
        reject(parseError || Object.assign(new Error("اختر ملف فيديو قبل الحفظ."), { status: 400 }));
        return;
      }
      resolve({ fields, upload });
    });
    req.pipe(parser);
  });
}

function streamVideo(req, res, video) {
  const filePath = path.join(VIDEO_DIR, video.fileName);
  let size;
  try { size = fs.statSync(filePath).size; }
  catch (error) { return fail(res, 404, "ملف الفيديو غير متاح حاليًا."); }
  if (!size) return fail(res, 404, "ملف الفيديو غير متاح حاليًا.");

  let start = 0;
  let end = size - 1;
  let status = 200;
  const requestedRange = req.headers.range;
  if (requestedRange) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(requestedRange);
    if (!match) {
      res.writeHead(416, { "Content-Range": `bytes */${size}`, "Cache-Control": "private, no-store" });
      return res.end();
    }
    if (!match[1]) {
      const suffix = Number(match[2]);
      start = Math.max(0, size - suffix);
    } else start = Number(match[1]);
    if (match[2] && match[1]) end = Math.min(Number(match[2]), size - 1);
    if (start >= size || start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${size}`, "Cache-Control": "private, no-store" });
      return res.end();
    }
    status = 206;
  }

  res.writeHead(status, {
    "Content-Type": video.mimeType,
    "Content-Length": end - start + 1,
    "Content-Disposition": "inline",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    ...(status === 206 ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {})
  });
  if (req.method === "HEAD") return res.end();
  const source = fs.createReadStream(filePath, { start, end });
  source.on("error", () => { if (!res.headersSent) fail(res, 500, "تعذر تشغيل الفيديو."); else res.destroy(); });
  source.pipe(res);
}

function authRateLimited(req, res, key) {
  const ip = req.socket.remoteAddress || "unknown";
  const mapKey = `${key}:${ip}`;
  const window = loginFailures.get(mapKey);
  if (window && window.until > Date.now() && window.count >= 12) {
    fail(res, 429, "محاولات دخول كثيرة. انتظر دقائق ثم حاول مجددًا.");
    return true;
  }
  return false;
}

function recordFailure(req, key) {
  const mapKey = `${key}:${req.socket.remoteAddress || "unknown"}`;
  const current = loginFailures.get(mapKey);
  if (!current || current.until < Date.now()) loginFailures.set(mapKey, { count: 1, until: Date.now() + 10 * 60 * 1000 });
  else current.count += 1;
}

function clearFailures(req, key) { loginFailures.delete(`${key}:${req.socket.remoteAddress || "unknown"}`); }

function validExam(exam) {
  return exam && typeof exam.id === "string" && typeof exam.title === "string" && exam.title.trim() &&
    typeof exam.grade === "string" && typeof exam.code === "string" && /^[A-Z0-9]{4,12}$/.test(exam.code) &&
    Array.isArray(exam.questions) && exam.questions.length > 0 && exam.questions.length <= 100 &&
    exam.questions.every((q) => q && typeof q.id === "string" && typeof q.prompt === "string" && Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 6 && q.options.every((o) => typeof o === "string") && Number.isInteger(Number(q.correct)) && Number(q.correct) >= 0 && Number(q.correct) < q.options.length && Number.isFinite(Number(q.points)) && Number(q.points) >= 0 && Number(q.points) <= 100);
}

async function handleApi(req, res, url) {
  const route = url.pathname;
  if (req.method === "GET" && route === "/api/status") return send(res, 200, { teacherConfigured: Boolean(db.teacher) });

  if (req.method === "POST" && route === "/api/teacher/setup") {
    if (db.teacher) return fail(res, 409, "تم إعداد حساب المدرس بالفعل. استخدم تسجيل الدخول.");
    const body = await parseBody(req);
    const suppliedKey = Buffer.from(String(body.setupKey || ""));
    const expectedKey = Buffer.from(setupKey);
    if (suppliedKey.length !== expectedKey.length || !crypto.timingSafeEqual(suppliedKey, expectedKey)) return fail(res, 403, "رمز الإعداد غير صحيح. راجع نافذة تشغيل الموقع.");
    if (String(body.password || "").length < 8) return fail(res, 400, "كلمة المرور يجب ألا تقل عن ٨ أحرف.");
    db.teacher = await passwordHash(body.password);
    persist();
    createSession(res, req, "teacher");
    return send(res, 201, { ok: true });
  }

  if (req.method === "POST" && route === "/api/teacher/login") {
    if (authRateLimited(req, res, "teacher")) return;
    const body = await parseBody(req);
    if (!db.teacher || !(await verifyPassword(body.password, db.teacher))) {
      recordFailure(req, "teacher");
      return fail(res, 401, "كلمة المرور غير صحيحة.");
    }
    clearFailures(req, "teacher");
    createSession(res, req, "teacher");
    return send(res, 200, { ok: true });
  }

  if (req.method === "POST" && route === "/api/teacher/logout") {
    clearSession(req, res);
    return send(res, 200, { ok: true });
  }

  if (route === "/api/teacher/state" && req.method === "GET") {
    if (!teacherOnly(req, res)) return;
    return send(res, 200, { revision: db.revision, exams: db.exams, results: db.results, videos: db.videos.map((video) => safeVideo(video, true)) });
  }

  if (route === "/api/teacher/state" && req.method === "PUT") {
    if (!teacherOnly(req, res)) return;
    const body = await parseBody(req);
    if (!Array.isArray(body.exams) || body.exams.length > 500 || !body.exams.every(validExam)) return fail(res, 400, "بيانات الامتحانات غير مكتملة أو غير صالحة.");
    const codes = body.exams.map((exam) => exam.code.toUpperCase());
    const ids = body.exams.map((exam) => exam.id);
    if (new Set(codes).size !== codes.length || new Set(ids).size !== ids.length) return fail(res, 400, "تأكد من عدم تكرار كود أو معرّف الامتحان.");
    db.exams = body.exams.map((exam) => ({ ...exam, code: exam.code.toUpperCase(), duration: Math.min(600, Math.max(1, Number(exam.duration) || 1)) }));
    persist();
    return send(res, 200, { revision: db.revision, exams: db.exams, results: db.results, videos: db.videos.map((video) => safeVideo(video, true)) });
  }

  if (route === "/api/teacher/videos" && req.method === "POST") {
    if (!teacherOnly(req, res)) return;
    const { fields, upload } = await receiveVideoUpload(req);
    const title = String(fields.title || "").trim().slice(0, 100);
    const lesson = String(fields.lesson || "").trim().slice(0, 120);
    const grade = String(fields.grade || "").trim();
    if (title.length < 2 || lesson.length < 2 || !VIDEO_GRADES.includes(grade)) {
      fs.rmSync(path.join(VIDEO_DIR, upload.fileName), { force: true });
      return fail(res, 400, "أكمل اسم الفيديو والدرس والصف الدراسي.");
    }
    const video = {
      id: `v-${crypto.randomUUID()}`, title, lesson, grade,
      code: newVideoCode(), fileName: upload.fileName, mimeType: upload.mimeType,
      size: upload.size, createdAt: new Date().toISOString(),
      accessesByStudent: {}, accessSessions: []
    };
    db.videos.unshift(video);
    try { persist(); }
    catch (error) {
      db.videos.shift();
      fs.rmSync(path.join(VIDEO_DIR, upload.fileName), { force: true });
      throw error;
    }
    return send(res, 201, { video: safeVideo(video, true), revision: db.revision });
  }

  const teacherVideoMatch = route.match(/^\/api\/teacher\/videos\/([^/]+)$/);
  if (teacherVideoMatch && (req.method === "PUT" || req.method === "DELETE")) {
    if (!teacherOnly(req, res)) return;
    const video = db.videos.find((item) => item.id === decodeURIComponent(teacherVideoMatch[1]));
    if (!video) return fail(res, 404, "لم نعثر على فيديو الشرح المطلوب.");
    if (req.method === "PUT") {
      const body = await parseBody(req);
      const title = String(body.title || "").trim().slice(0, 100);
      const lesson = String(body.lesson || "").trim().slice(0, 120);
      const grade = String(body.grade || "").trim();
      if (title.length < 2 || lesson.length < 2 || !VIDEO_GRADES.includes(grade)) return fail(res, 400, "أكمل اسم الفيديو والدرس والصف الدراسي.");
      video.title = title;
      video.lesson = lesson;
      video.grade = grade;
      persist();
      return send(res, 200, { video: safeVideo(video, true), revision: db.revision });
    }
    db.videos = db.videos.filter((item) => item.id !== video.id);
    persist();
    if (/^[0-9a-f-]+\.(mp4|webm)$/i.test(video.fileName || "")) fs.rmSync(path.join(VIDEO_DIR, video.fileName), { force: true });
    return send(res, 200, { ok: true, revision: db.revision });
  }

  if (req.method === "POST" && route === "/api/student/videos/access") {
    const session = studentOnly(req, res);
    if (!session) return;
    if (authRateLimited(req, res, "video")) return;
    const body = await parseBody(req);
    const code = String(body.code || "").replace(/\s+/g, "").toUpperCase();
    const video = db.videos.find((item) => item.code === code);
    if (!video) {
      recordFailure(req, "video");
      return fail(res, 404, "كود الفيديو غير صحيح. راجع الكود مع المدرس.");
    }
    const student = db.students.find((item) => item.id === session.studentId);
    if (!student || student.grade !== video.grade) {
      return fail(res, 403, `هذا الفيديو مخصص لـ ${video.grade}، بينما الصف المسجل في ملفك هو ${student?.grade || "غير محدد"}. اطلب فيديو الصف الصحيح أو حدّث بيانات ملفك.`);
    }
    const accesses = video.accessesByStudent && typeof video.accessesByStudent === "object" && !Array.isArray(video.accessesByStudent)
      ? video.accessesByStudent
      : (video.accessesByStudent = {});
    const previousAccesses = Number(accesses[session.studentId]) || 0;
    if (previousAccesses >= VIDEO_CODE_MAX_USES) {
      return fail(res, 403, "استخدمت كود هذا الفيديو مرتين. اطلب كودًا جديدًا من المدرس.");
    }
    const accessSessions = Array.isArray(video.accessSessions) ? video.accessSessions : (video.accessSessions = []);
    const accessToken = crypto.randomBytes(32).toString("hex");
    accesses[session.studentId] = previousAccesses + 1;
    accessSessions.push({ token: accessToken, studentId: session.studentId, grade: student.grade });
    try { persist(); }
    catch (error) {
      if (previousAccesses) accesses[session.studentId] = previousAccesses;
      else delete accesses[session.studentId];
      accessSessions.pop();
      throw error;
    }
    clearFailures(req, "video");
    const streamUrl = `/api/student/videos/${encodeURIComponent(video.id)}/content?access=${encodeURIComponent(accessToken)}`;
    return send(res, 200, { video: safeVideo(video), streamUrl });
  }

  const studentVideoMatch = route.match(/^\/api\/student\/videos\/([^/]+)\/content$/);
  if (studentVideoMatch && (req.method === "GET" || req.method === "HEAD")) {
    const session = studentOnly(req, res);
    if (!session) return;
    const id = decodeURIComponent(studentVideoMatch[1]);
    const accessToken = String(url.searchParams.get("access") || "");
    const video = db.videos.find((item) => item.id === id);
    const student = db.students.find((item) => item.id === session.studentId);
    const accessGranted = video && student?.grade === video.grade && Array.isArray(video.accessSessions) && video.accessSessions.some((access) => access.token === accessToken && access.studentId === session.studentId && access.grade === student.grade);
    if (!video || !accessGranted || !/^[0-9a-f-]+\.(mp4|webm)$/i.test(video.fileName || "")) return fail(res, 404, "ملف الفيديو غير متاح بهذا الكود.");
    return streamVideo(req, res, video);
  }

  if (req.method === "POST" && route === "/api/student/signup") {
    const body = await parseBody(req);
    const name = String(body.name || "").trim().slice(0, 80);
    const grade = String(body.grade || "").trim().slice(0, 60);
    const phone = normalizePhone(body.phone);
    if (name.length < 2 || !VIDEO_GRADES.includes(grade) || !/^\d{8,15}$/.test(phone)) return fail(res, 400, "أكمل الاسم والصف ورقم هاتف صحيحًا.");
    if (String(body.password || "").length < 8) return fail(res, 400, "كلمة المرور يجب ألا تقل عن ٨ أحرف.");
    if (db.students.some((student) => student.phone === phone)) return fail(res, 409, "هذا الرقم مسجل بالفعل. سجّل الدخول إلى حسابك.");
    const credential = await passwordHash(body.password);
    const student = { id: `s-${crypto.randomUUID()}`, name, grade, phone, credential, createdAt: new Date().toISOString() };
    db.students.push(student);
    persist();
    createSession(res, req, "student", student.id);
    return send(res, 201, { profile: safeStudent(student), results: [] });
  }

  if (req.method === "POST" && route === "/api/student/login") {
    if (authRateLimited(req, res, "student")) return;
    const body = await parseBody(req);
    const phone = normalizePhone(body.phone);
    const student = db.students.find((item) => item.phone === phone);
    if (!student || !(await verifyPassword(body.password, student.credential))) {
      recordFailure(req, "student");
      return fail(res, 401, "رقم الهاتف أو كلمة المرور غير صحيحة.");
    }
    clearFailures(req, "student");
    createSession(res, req, "student", student.id);
    const results = db.results.filter((result) => result.studentId === student.id).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    return send(res, 200, { profile: safeStudent(student), results });
  }

  if (req.method === "POST" && route === "/api/student/logout") {
    clearSession(req, res);
    return send(res, 200, { ok: true });
  }

  if (route === "/api/student/me" && req.method === "GET") {
    const session = studentOnly(req, res);
    if (!session) return;
    const student = db.students.find((item) => item.id === session.studentId);
    const results = db.results.filter((result) => result.studentId === student.id).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    return send(res, 200, { profile: safeStudent(student), results });
  }


  if (route === "/api/student/password" && req.method === "POST") {
    const session = studentOnly(req, res);
    if (!session) return;
    const body = await parseBody(req);
    const student = db.students.find((item) => item.id === session.studentId);
    if (!(await verifyPassword(body.currentPassword, student.credential))) return fail(res, 401, "كلمة المرور الحالية غير صحيحة.");
    if (String(body.newPassword || "").length < 8) return fail(res, 400, "كلمة المرور الجديدة يجب ألا تقل عن ٨ أحرف.");
    student.credential = await passwordHash(body.newPassword);
    persist();
    return send(res, 200, { ok: true });
  }

  if (req.method === "POST" && route === "/api/student/attempts/start") {
    const session = studentOnly(req, res);
    if (!session) return;
    const body = await parseBody(req);
    const code = String(body.code || "").trim().toUpperCase();
    const exam = db.exams.find((item) => item.code.toUpperCase() === code);
    if (!exam) return fail(res, 404, "لم نعثر على امتحان بهذا الكود. راجع الكود مع معلمك.");
    const previousResult = db.results
      .filter((result) => result.studentId === session.studentId && result.examId === exam.id)
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0];
    if (previousResult) return send(res, 200, { alreadyTaken: true, result: previousResult });
    const attemptId = crypto.randomUUID();
    const startedAt = Date.now();
    activeAttempts.set(attemptId, { studentId: session.studentId, exam: JSON.parse(JSON.stringify(exam)), startedAt, endsAt: startedAt + Number(exam.duration) * 60_000, submitted: false });
    return send(res, 200, { attemptId, startedAt, endsAt: startedAt + Number(exam.duration) * 60_000, exam: safeExam(exam) });
  }

  if (req.method === "POST" && route === "/api/student/attempts/submit") {
    const session = studentOnly(req, res);
    if (!session) return;
    const body = await parseBody(req);
    const record = activeAttempts.get(String(body.attemptId || ""));
    if (!record || record.studentId !== session.studentId) return fail(res, 404, "انتهت صلاحية محاولة الامتحان. ابدأ الامتحان من جديد.");
    if (record.submitted) return fail(res, 409, "تم تسليم هذه المحاولة بالفعل.");
    if (Date.now() > record.endsAt + 120_000) return fail(res, 409, "انتهى وقت الامتحان. ابدأ محاولة جديدة إذا كان الامتحان متاحًا.");
    const exam = record.exam;
    const student = db.students.find((item) => item.id === session.studentId);
    if (!exam || !student) return fail(res, 404, "تعذر العثور على الامتحان أو حساب الطالب.");
    const previousResult = db.results.find((result) => result.studentId === student.id && result.examId === exam.id);
    if (previousResult) {
      record.submitted = true;
      return send(res, 409, { error: "تم تسليم هذا الامتحان من حسابك بالفعل.", previousResult });
    }
    const selections = body.answers && typeof body.answers === "object" ? body.answers : {};
    const answers = exam.questions.map((question) => {
      const selectedRaw = selections[question.id];
      const selectedIndex = typeof selectedRaw === "number" && Number.isInteger(selectedRaw) && selectedRaw >= 0 && selectedRaw < question.options.length ? selectedRaw : null;
      const points = Number(question.points) || 0;
      return { questionId: question.id, prompt: question.prompt, options: [...question.options], selectedIndex, correctIndex: Number(question.correct), points, earned: selectedIndex === Number(question.correct) ? points : 0 };
    });
    const maxScore = answers.reduce((sum, answer) => sum + answer.points, 0);
    const score = answers.reduce((sum, answer) => sum + answer.earned, 0);
    const result = {
      id: `r-${crypto.randomUUID()}`, examId: exam.id, examTitle: exam.title,
      studentId: student.id, studentName: student.name, studentGrade: student.grade, studentClass: "",
      score, maxScore, percentage: maxScore ? Math.round(score / maxScore * 100) : 0,
      submittedAt: new Date().toISOString(), durationSeconds: Math.max(0, Math.floor((Date.now() - record.startedAt) / 1000)), answers
    };
    record.submitted = true;
    db.results.push(result);
    persist();
    return send(res, 201, { result, revision: db.revision });
  }

  fail(res, 404, "المسار المطلوب غير موجود.");
}

const publicFiles = new Set(["index.html", "student.html", "styles.css", "student.css", "app.js", "student.js"]);
const mimeTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/healthz") return send(res, 200, { ok: true });
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    if (req.method !== "GET" && req.method !== "HEAD") return fail(res, 405, "الطريقة غير مدعومة.");
    const requested = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    if (!publicFiles.has(requested)) return fail(res, 404, "الصفحة غير موجودة.");
    const file = path.join(ROOT, requested);
    const content = fs.readFileSync(file);
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    return res.end(req.method === "HEAD" ? undefined : content);
  } catch (error) {
    if (res.headersSent) return res.end();
    const status = error.status || 500;
    return fail(res, status, status === 500 ? "حدث خطأ أثناء معالجة الطلب." : error.message);
  }
});

server.requestTimeout = 30 * 60 * 1000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Alhawy learning platform is running on http://localhost:${PORT}`);
  if (!db.teacher) console.log(`One-time teacher setup key: ${setupKey}`);
});
