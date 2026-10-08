/**
 * Thirty Day Readmissions — reader feedback receiver (Google Apps Script web app).
 *
 * Paste this into the Apps Script editor of a blank Google Sheet (Extensions > Apps Script),
 * then Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone.
 * Each submission becomes a row in the Sheet and an email to the Sheet owner.
 * Nothing else is stored. Readers are asked not to include patient information.
 */
var SITE_NAME = 'Thirty Day Readmissions';
var SITE_URL = 'https://thirty-day-readmissions.vercel.app/';
var MAX_MESSAGE = 2000;
var MAX_FIELD = 200;
var BURST_LIMIT = 20;          // submissions per 10 minutes, all readers combined
var BURST_WINDOW_SECONDS = 600;
var KINDS = { data: 'Data looks wrong', confusing: 'Something is confusing', idea: 'Idea for the site', other: 'Other' };
var HEADERS = ['Received', 'Kind', 'Message', 'Email', 'Page', 'Page title'];
var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function doPost(e) {
  var result = handleFeedback((e && e.parameter) || {}, {
    now: new Date(),
    owner: Session.getEffectiveUser().getEmail(),
    sheet: SpreadsheetApp.getActiveSpreadsheet().getSheets()[0],
    mailer: MailApp,
    cache: CacheService.getScriptCache(),
    lock: LockService.getScriptLock(),
  });
  return ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.TEXT);
}

// Returns 'ok' | 'ignored' (spam trap) | 'rejected' (empty) | 'busy' (rate limited).
function handleFeedback(p, env) {
  if (p.website) return 'ignored';
  var message = clean(p.message, MAX_MESSAGE);
  if (message.length < 5) return 'rejected';
  var recent = Number(env.cache.get('recent') || 0);
  if (recent >= BURST_LIMIT) return 'busy';
  env.cache.put('recent', String(recent + 1), BURST_WINDOW_SECONDS);

  var kind = KINDS[p.kind] ? p.kind : 'other';
  var emailRaw = oneLine(clean(p.email, MAX_FIELD));
  var email = EMAIL.test(emailRaw) ? emailRaw : '';
  var page = oneLine(clean(p.page, MAX_FIELD));
  var title = oneLine(clean(p.title, MAX_FIELD));

  env.lock.waitLock(5000);
  try {
    if (env.sheet.getLastRow() === 0) env.sheet.appendRow(HEADERS);
    env.sheet.appendRow([env.now, KINDS[kind], message, email, page, title].map(safeCell));
  } finally {
    env.lock.releaseLock();
  }

  if (env.mailer.getRemainingDailyQuota() > 0) {
    var mail = {
      to: env.owner,
      subject: oneLine('[' + SITE_NAME + '] ' + KINDS[kind] + ': ' + (title || page || 'site')),
      body: message + '\n\n---\nPage: ' + SITE_URL + page + '\nKind: ' + KINDS[kind]
        + '\nFrom: ' + (email || 'no email given') + '\nReceived: ' + env.now.toISOString(),
    };
    if (email) mail.replyTo = email;
    env.mailer.sendEmail(mail);
  }
  return 'ok';
}

// Strip control characters (keeping tabs and line breaks), trim, and cap length.
function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

function oneLine(value) {
  return value.replace(/[\r\n\t]+/g, ' ').trim();
}

// A cell starting with = + - @ would run as a spreadsheet formula; prefix an apostrophe.
function safeCell(value) {
  return typeof value === 'string' && /^[=+\-@]/.test(value) ? "'" + value : value;
}
