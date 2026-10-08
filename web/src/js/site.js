// The site's name, used by the page title, masthead, and build.
export const SITE_NAME = 'Thirty Day Readmissions';
export const LINKEDIN_URL = 'https://www.linkedin.com/in/dalton-haslam';
// Set at build time by build.mjs (esbuild define); empty means the feedback form is hidden.
// eslint-disable-next-line no-undef
export const FEEDBACK_URL = typeof __FEEDBACK_URL__ === 'string' ? __FEEDBACK_URL__ : '';
