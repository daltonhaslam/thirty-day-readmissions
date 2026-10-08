# Reader feedback

The feedback form at the bottom of every page posts to a Google Apps Script web app
(`apps-script.gs`). Each submission becomes a row in a Google Sheet and an email to the Sheet's
owner, with Reply-To set to the reader's address when they leave one. Nothing else is stored.

## One-time setup (about 5 minutes)

1. Open **sheets.new** in your browser to create a blank Google Sheet. Name it
   "Thirty Day Readmissions feedback".
2. In the Sheet, choose **Extensions → Apps Script**. Delete the sample code, paste all of
   `apps-script.gs`, and click **Save**.
3. Click **Deploy → New deployment**. Click the gear next to "Select type" and choose **Web app**.
   - Description: `feedback`
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**, then **Authorize access** and pick your Google account. Google shows
   "Google hasn't verified this app" for any personal script: click **Advanced**, then
   **Go to … (unsafe)**, then **Allow**. Google lists two permissions: edit this one spreadsheet,
   and send email as you. The code only ever sends to your own address, and only you can edit it
   as long as you don't share the Sheet.
5. Copy the **Web app URL** (it ends in `/exec`). It goes into `FEEDBACK_URL` in `web/src/js/site.js`;
   rebuild (`cd web && npm run build`) and push.

## Changing the script later

Edit and save, then **Deploy → Manage deployments → ✎ (edit) → Version: New version → Deploy**.
The URL stays the same.

## Limits

- Bursts over 20 submissions in 10 minutes are refused (spam protection).
- At most 30 notification emails a day (Gmail allows a personal account's scripts about 100 a day
  in total). Past that, submissions are still saved to the Sheet.
