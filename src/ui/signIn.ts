import { GOOGLE_CLIENT_ID, isIosStandalone } from '../auth/config';
import { renderGoogleButton } from '../auth/google';
import type { SessionUser, SignInProblem } from '../auth/session';
import { t } from '../strings';
import type { Account } from './account';
import { openDialog } from './dialog';
import { h } from './dom';

const PROBLEM_TEXT: Record<SignInProblem, string> = t.account.errors;

function problemText(error: unknown): string {
  const problem = (error as { problem?: SignInProblem } | null)?.problem;
  if (!problem) console.error('Sign-in failed', error);
  return PROBLEM_TEXT[problem ?? 'generic'];
}

/**
 * Sign-in dialog: Google (ID-token button) or a 6-digit code sent by email, behind an age
 * confirmation. Resolves to the signed-in user, or null if closed.
 */
export function openSignIn(account: Account): Promise<SessionUser | null> {
  const sessionReady = account.load();
  return openDialog<SessionUser | null>({
    title: t.account.signInTitle,
    className: 'sign-in',
    cancelValue: null,
    body: (close) => {
      const error = h('p', { class: 'form-error', role: 'alert' });
      const showError = (message: string) => (error.textContent = message);

      const age = h('input', { type: 'checkbox', required: true });
      const ageRow = h('label', { class: 'checkbox-row' }, age, h('span', {}, t.account.ageLabel));
      const ageConfirmed = () => {
        if (age.checked) return true;
        showError(t.account.ageRequired);
        age.focus();
        return false;
      };

      // ---- Google ----
      const googleSlot = h('div', { class: 'google-slot' });
      const googleHint = h('p', { class: 'hint' }, t.account.googleNeedsAge);
      let googleRendered = false;
      const showGoogle = async () => {
        if (!GOOGLE_CLIENT_ID || googleRendered || !age.checked) return;
        googleRendered = true;
        googleHint.hidden = true;
        try {
          await renderGoogleButton(googleSlot, GOOGLE_CLIENT_ID, (idToken, nonce) => {
            void sessionReady
              .then((session) => session.signInWithGoogle(idToken, nonce))
              .then(close)
              .catch((failure: unknown) => showError(isIosStandalone() ? t.account.googleIosApp : problemText(failure)));
          });
        } catch (failure) {
          console.warn('Google sign-in unavailable', failure);
          googleRendered = false;
          googleHint.hidden = false;
          googleHint.textContent = isIosStandalone() ? t.account.googleIosApp : t.account.googleUnavailable;
        }
      };
      age.addEventListener('change', () => {
        if (age.checked) error.textContent = '';
        void showGoogle();
      });

      // ---- Email code ----
      const email = h('input', { class: 'field', type: 'email', autocomplete: 'email', inputMode: 'email', required: true, placeholder: t.account.emailPlaceholder });
      const sendButton = h('button', { class: 'btn primary', type: 'submit' }, t.account.sendCode);
      const code = h('input', {
        class: 'field code-field',
        inputMode: 'numeric',
        autocomplete: 'one-time-code',
        pattern: '[0-9]{6}',
        maxLength: 6,
        required: true,
        'aria-label': t.account.codeLabel,
      });
      const verifyButton = h('button', { class: 'btn primary', type: 'submit' }, t.account.verify);
      const sentNote = h('p', { class: 'hint', 'aria-live': 'polite' });

      const sendCode = async () => {
        if (!ageConfirmed() || !email.reportValidity()) return;
        error.textContent = '';
        sendButton.disabled = true;
        sendButton.textContent = t.account.sending;
        try {
          await (await sessionReady).sendCode(email.value.trim());
          emailStep.hidden = true;
          codeStep.hidden = false;
          sentNote.textContent = t.account.codeSent(email.value.trim());
          code.value = '';
          code.focus();
        } catch (failure) {
          showError(problemText(failure));
        } finally {
          sendButton.disabled = false;
          sendButton.textContent = t.account.sendCode;
        }
      };

      const emailStep = h(
        'form',
        {
          class: 'dialog-form',
          onsubmit: (event: Event) => {
            event.preventDefault();
            void sendCode();
          },
        },
        h('label', { class: 'field-label' }, t.account.emailLabel, email),
        sendButton,
      );

      const codeStep = h(
        'form',
        {
          class: 'dialog-form',
          hidden: true,
          onsubmit: async (event: Event) => {
            event.preventDefault();
            if (!code.reportValidity()) return;
            error.textContent = '';
            verifyButton.disabled = true;
            verifyButton.textContent = t.account.verifying;
            try {
              close(await (await sessionReady).verifyCode(email.value.trim(), code.value.trim()));
            } catch (failure) {
              showError(problemText(failure));
            } finally {
              verifyButton.disabled = false;
              verifyButton.textContent = t.account.verify;
            }
          },
        },
        sentNote,
        h('label', { class: 'field-label' }, t.account.codeLabel, code),
        verifyButton,
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            {
              class: 'btn link',
              type: 'button',
              onclick: () => {
                codeStep.hidden = true;
                emailStep.hidden = false;
                email.focus();
              },
            },
            t.account.otherEmail,
          ),
          h('button', { class: 'btn link', type: 'button', onclick: () => void sendCode() }, t.account.resend),
        ),
      );

      sessionReady.catch((failure: unknown) => showError(problemText(failure)));

      return [
        h('p', { class: 'dialog-message' }, t.account.signInIntro),
        ageRow,
        GOOGLE_CLIENT_ID && h('div', { class: 'google-block' }, googleSlot, googleHint),
        GOOGLE_CLIENT_ID && h('p', { class: 'or-divider', 'aria-hidden': 'true' }, h('span', {}, t.account.or)),
        emailStep,
        codeStep,
        error,
        h(
          'p',
          { class: 'legal' },
          `${t.account.legal} `,
          h('a', { href: '/terms', target: '_blank', rel: 'noopener' }, t.account.terms),
          ` ${t.account.and} `,
          h('a', { href: '/privacy', target: '_blank', rel: 'noopener' }, t.account.privacy),
          '.',
        ),
      ];
    },
  });
}
