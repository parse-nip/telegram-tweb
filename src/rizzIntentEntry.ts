/**
 * Standalone preview: open /rizz-intent.html in dev (pnpm start).
 * Append ?resetIntent=1 to clear the saved choice and see the screen again.
 */

import '@/materialize.scss';
import '@/scss/style.scss';
import deferredPromise from '@helpers/cancellablePromise';
import sessionStorage from '@lib/sessionStorage';
import pageRizzIntent, {registerIntentComplete} from '@/pages/pageRizzIntent';

async function main() {
  const params = new URLSearchParams(location.search);
  if(params.get('resetIntent') === '1') {
    sessionStorage.delete('rizz_intent_done');
    sessionStorage.delete('rizz_intent_choice');
  }

  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  document.documentElement.classList.toggle('night', mq.matches);

  const intentDone = deferredPromise<void>();
  registerIntentComplete(intentDone);
  const authPages = document.getElementById('auth-pages');
  if(authPages) {
    authPages.style.display = '';
  }

  await pageRizzIntent.mount();
  await intentDone;

  const hint = document.createElement('p');
  hint.className = 'rizz-intent-preview-hint';
  hint.textContent = 'Preview: choice saved. Use the main app for full flow; add ?resetIntent=1 to this URL to try again.';
  document.body.append(hint);
}

main().catch(console.error);
