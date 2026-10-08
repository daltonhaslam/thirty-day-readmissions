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
var MAX_FIELD = 200;
var BURST_LIMIT = 20;          // submissions per 10 minutes, all readers combined
var BURST_WINDOW_SECONDS = 600;
var MAX_EMAILS_PER_DAY = 30;   // keeps a flood from using up the account's shared daily mail quota
var ROUTE = /^#[a-z0-9-]{0,60}$/i;  // the site's own page anchors, e.g. #hospital-010006
var KINDS = { data: 'Data looks wrong', confusing: 'Something is confusing', idea: 'Idea for the site', other: 'Other' };
var HEADERS = ['Received', 'Kind', 'Message', 'Email', 'Page', 'Page title'];
var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function doPost(e) {
  var result = handleFeedback((e && e.parameter) || {}, {
    now: new Date(),
    owner: Session.getEffectiveUser().getEmail(),
    sheet: SpreadsheetApp.getActiveSpreadsheet().getSheets()[0],
    mailer: MailApp,
    store: PropertiesService.getScriptProperties(),
    cache: CacheService.getScriptCache(),
    lock: LockService.getScriptLock(),
  });
  return ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.TEXT);
}

// Returns 'ok' | 'rejected' (empty) | 'busy' (rate limited). The site filters obvious bots before posting.
function handleFeedback(p, env) {
  var message = clean(p.message, MAX_MESSAGE);
  if (message.length < MIN_MESSAGE) return 'rejected';
  var recent = Number(env.cache.get('recent') || 0);
  if (recent >= BURST_LIMIT) return 'busy';
  env.cache.put('recent', String(recent + 1), BURST_WINDOW_SECONDS);

  var kindLabel = Object.prototype.hasOwnProperty.call(KINDS, p.kind) ? KINDS[p.kind] : KINDS.other;
  var emailRaw = field(p.email);
  var email = EMAIL.test(emailRaw) ? emailRaw : '';
  var page = ROUTE.test(field(p.page)) ? field(p.page) : '';
  var title = field(p.title);

  env.lock.waitLock(5000);
  try {
    if (env.sheet.getLastRow() === 0) env.sheet.appendRow(HEADERS);
    env.sheet.appendRow([env.now, kindLabel, message, email, page, title].map(safeCell));
  } finally {
    env.lock.releaseLock();
  }

  var dayKey = 'mail-' + env.now.toISOString().slice(0, 10);
  var sentToday = Number(env.store.getProperty(dayKey) || 0);
  if (sentToday < MAX_EMAILS_PER_DAY && env.mailer.getRemainingDailyQuota() > 0) {
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
    env.mailer.sendEmail(mail);
    env.store.setProperty(dayKey, String(sentToday + 1));
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

// A cell starting with = + - @ (or a full-width look-alike) would run as a formula; prefix an apostrophe.
function safeCell(value) {
  return typeof value === 'string' && /^[=+\-@]/.test(value.normalize('NFKC')) ? "'" + value : value;
}
