#!/usr/bin/env node
// Pushes the sign-in email setup to the hosted Supabase project: Resend SMTP, the code-only
// template and subject for both "Magic Link" and "Confirm signup", OTP settings and the
// email rate limit. Hosted templates are not read from supabase/config.toml, so this is the
// one way they reach production.
//
//   npm run push:auth-email                       (asks for both secrets, input hidden)
//   npm run push:auth-email -- --templates-only   (template and subject only; no Resend key)
//
// SUPABASE_ACCESS_TOKEN: a personal access token (supabase.com/dashboard/account/tokens).
// RESEND_SMTP_KEY: a Resend API key with sending access to mail.lietner.app only.
// Either can also come from the environment. SUPABASE_PROJECT_REF overrides the production project.

import { readFile } from 'node:fs/promises';

const ref = process.env.SUPABASE_PROJECT_REF || 'tpcsptccqgykwufprkto';
const templatesOnly = process.argv.includes('--templates-only');
const token = await secret('SUPABASE_ACCESS_TOKEN', 'Supabase access token');
const smtpKey = templatesOnly ? '' : await secret('RESEND_SMTP_KEY', 'Resend API key (sending access)');

const template = await readFile(new URL('../supabase/templates/magic_link.html', import.meta.url), 'utf8');
if (!template.includes('{{ .Token }}')) fail('supabase/templates/magic_link.html has no {{ .Token }}.');

const subject = 'Your Lietner sign-in code';
const patch = {
  mailer_subjects_magic_link: subject,
  mailer_subjects_confirmation: subject,
  mailer_templates_magic_link_content: template,
  mailer_templates_confirmation_content: template,
};
if (!templatesOnly) {
  Object.assign(patch, {
    smtp_host: 'smtp.resend.com',
    smtp_port: '465',
    smtp_user: 'resend',
    smtp_pass: smtpKey,
    smtp_admin_email: 'code@mail.lietner.app',
    smtp_sender_name: 'Lietner',
    mailer_otp_length: 6,
    mailer_otp_exp: 3600,
    // One code per address per minute; the app asks people to wait rather than reporting the cap.
    smtp_max_frequency: 60,
    // Project-wide, per hour. Resend's daily cap is the real limit; the app explains its refusal.
    rate_limit_email_sent: 30,
    site_url: 'https://lietner.app',
  });
}

const url = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const current = await call('GET');
// A key the API doesn't return is a typo here, not a setting to create. The password is never returned.
const unknown = Object.keys(patch).filter((key) => key !== 'smtp_pass' && !(key in current));
if (unknown.length) fail(`The Management API doesn't know: ${unknown.join(', ')}. Nothing was changed.`);

console.log(`Project ${ref}:`);
for (const [key, value] of Object.entries(patch)) {
  console.log(`  ${key}: ${describe(key, current[key], value)}`);
}

await call('PATCH', patch);
console.log('Done. Send yourself a code to check it.');

async function call(method, body) {
  const response = await fetch(url, { method, headers, body: body && JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) fail(`${method} ${response.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

function describe(key, before, after) {
  if (key === 'smtp_pass') return 'set (hidden)';
  if (typeof after === 'string' && after.length > 60) {
    return before === after ? 'unchanged' : `updated (${after.length} characters)`;
  }
  return before === after ? `${JSON.stringify(after)} (unchanged)` : `${JSON.stringify(before)} → ${JSON.stringify(after)}`;
}

/** Reads a secret from the environment, or asks for it without echoing it. */
async function secret(name, label) {
  let value = process.env[name]?.trim() || (process.stdin.isTTY ? await askHidden(`${label}: `) : '');
  value = value.trim();
  if (!value) fail(`Set ${name}, or run this in a terminal to be asked for it.`);
  // A pasted placeholder ("…") or a curly quote can't go in an HTTP header.
  if (!/^[\x21-\x7e]+$/.test(value)) fail(`${name} has spaces or non-ASCII characters. Paste the real value, not a placeholder.`);
  return value;
}

function askHidden(prompt) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    let value = '';
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          return resolve(value);
        }
        if (char === '\u0003') {
          stdout.write('\n');
          process.exit(130);
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on('data', onData);
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
