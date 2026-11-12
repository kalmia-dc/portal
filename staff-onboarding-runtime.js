import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';
import {startPortalAuth} from './portal-auth.js?v=onboarding-access-20261112';

export async function connectOnboarding() {
  const app = initializeApp({apiKey:'AIzaSyDdMe7feUF6CKPHH0YIx7Suk-WnXtOYUu8',
    authDomain:'kalmia-shift.firebaseapp.com',databaseURL:'https://kalmia-shift-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId:'kalmia-shift'});
  await startPortalAuth(app,{pageName:'入社手続き'});
  const endpoint=httpsCallable(getFunctions(app,'asia-southeast1'),'staffOnboarding',{timeout:60000});
  return async request=>(await endpoint(request)).data;
}
