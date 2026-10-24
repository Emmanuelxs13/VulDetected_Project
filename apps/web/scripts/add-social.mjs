import { readFileSync, writeFileSync } from 'node:fs';
const en = JSON.parse(readFileSync('messages/en.json', 'utf8'));
const es = JSON.parse(readFileSync('messages/es.json', 'utf8'));
en.auth.social = {
  or: 'or',
  continueGoogle: 'Continue with Google',
  continueGithub: 'Continue with GitHub',
  signUpGoogle: 'Sign up with Google',
  signUpGithub: 'Sign up with GitHub',
};
es.auth.social = {
  or: 'o',
  continueGoogle: 'Continuar con Google',
  continueGithub: 'Continuar con GitHub',
  signUpGoogle: 'Registrarse con Google',
  signUpGithub: 'Registrarse con GitHub',
};
writeFileSync('messages/en.json', JSON.stringify(en, null, 2) + '\n');
writeFileSync('messages/es.json', JSON.stringify(es, null, 2) + '\n');
console.log('ok');
