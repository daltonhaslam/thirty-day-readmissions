/**
 * @OnlyCurrentDoc
 *
 * Thirty Day Readmissions: reader feedback receiver (Google Apps Script web app).
 *
 * Paste this into the Apps Script editor of a blank Google Sheet (Extensions > Apps Script),
 * then Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone.
 * Each submission becomes a row in the Sheet and an email to the Sheet owner.
 * Nothing else is stored. Readers are asked not to include patient information.
 */
var SITE_NAME = 'Thirty Day Readmissions';
var SITE_URL = 'https://thirty-day-readmissions.vercel.app/';
// MIN_MESSAGE, MAX_MESSAGE, KINDS, and EMAIL mirror web/src/js/feedback.js (a test keeps them equal).
var MIN_MESSAGE = 5;
var MAX_MESSAGE = 2000;
var MIN_FILL_MS = 1500;        // first keystroke to send; faster (or no timing at all) is treated as a bot
var MAX_FIELD = 200;
var BURST_LIMIT = 20;          // saved submissions per fixed 10-minute window, all readers combined
var BURST_WINDOW_MS = 600000;
var MAX_EMAILS_PER_DAY = 30;   // keeps a flood from using up the account's shared daily mail quota
var ROUTE = /^#[a-z0-9-]{0,60}$/i;  // the site's own page anchors, e.g. #hospital-010006
var KINDS = { data: 'Data looks wrong', confusing: 'Something is confusing', idea: 'Idea for the site', other: 'Other' };
var HEADERS = ['Received', 'Kind', 'Message', 'Email', 'Page', 'Page title'];
var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function doPost(e) {
  // Services are looked up lazily, so rejected or rate-limited posts don't open the spreadsheet.
  var result = handleFeedback((e && e.parameter) || {}, {
    now: new Date(),
    get owner() { return Session.getEffectiveUser().getEmail(); },
    get sheet() { return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]; },
    get mailer() { return MailApp; },
    get store() { return PropertiesService.getScriptProperties(); },
    get cache() { return CacheService.getScriptCache(); },
    get lock() { return LockService.getScriptLock(); },
  });
  return ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.TEXT);
}

// Returns 'ok' | 'ignored' (bot signals) | 'rejected' (empty) | 'busy' (rate limited or lock timeout).
function handleFeedback(p, env) {
  if (p.trap || !(Number(p.elapsed) >= MIN_FILL_MS)) return 'ignored';
  var message = clean(p.message, MAX_MESSAGE);
  if (message.length < MIN_MESSAGE) return 'rejected';

  var kindLabel = Object.prototype.hasOwnProperty.call(KINDS, p.kind) ? KINDS[p.kind] : KINDS.other;
  var emailRaw = field(p.email);
  var email = EMAIL.test(emailRaw) ? emailRaw : '';
  var page = ROUTE.test(field(p.page)) ? field(p.page) : '';
  var title = field(p.title);

  var lock = env.lock;
  try {
    lock.waitLock(5000);
  } catch (err) {
    return 'busy';
  }
  try {
    var cache = env.cache;
    var windowKey = 'recent-' + Math.floor(env.now.getTime() / BURST_WINDOW_MS);
    var recent = Number(cache.get(windowKey) || 0);
    if (recent >= BURST_LIMIT) return 'busy';
    var sheet = env.sheet;
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
    var row = sheet.getLastRow() + 1;
    // Reader columns as plain text: no date/number conversion ("3/14", "12345") and no formulas.
    sheet.getRange(row, 2, 1, HEADERS.length - 1).setNumberFormat('@');
    sheet.getRange(row, 1, 1, HEADERS.length).setValues([[env.now, kindLabel, message, email, page, title].map(safeCell)]);
    cache.put(windowKey, String(recent + 1), BURST_WINDOW_MS / 1000);
  } finally {
    lock.releaseLock();
  }

  var store = env.store;
  var dayKey = 'mail-' + env.now.toISOString().slice(0, 10);
  var sentToday = Number(store.getProperty(dayKey) || 0);
  var mailer = env.mailer;
  if (sentToday < MAX_EMAILS_PER_DAY && mailer.getRemainingDailyQuota() > 0) {
    // Details first and a subject built only from fixed text and the route, so reader text
    // can't pass itself off as the header of the email.
    var mail = {
      to: env.owner,
      subject: '[' + SITE_NAME + '] ' + kindLabel + (page ? ' ' + page : ''),
      body: 'Kind: ' + kindLabel + '\nPage: ' + SITE_URL + page + '\nPage title: ' + (title || 'not given')
        + '\nFrom: ' + (email || 'no email given') + '\nReceived: ' + env.now.toISOString()
        + '\n\nMessage from the reader:\n' + message,
    };
    if (email) mail.replyTo = email;
    mailer.sendEmail(mail);
    store.setProperty(dayKey, String(sentToday + 1));
  }
  return 'ok';
}

// Strip control characters (keeping tabs and line breaks), trim, and cap length.
function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

// A short single-line field (email, page, title).
function field(value) {
  return oneLine(clean(value, MAX_FIELD));
}

function oneLine(value) {
  return value.replace(/[\r\n\t]+/g, ' ').trim();
}

// A cell starting with = + - @ (or a full-width look-alike) could run as a formula. The apostrophe keeps
// it text in Sheets; the space keeps it text in Excel if the Sheet is ever downloaded as CSV.
function safeCell(value) {
  return typeof value === 'string' && /^[=+\-@]/.test(value.normalize('NFKC')) ? "' " + value : value;
}
