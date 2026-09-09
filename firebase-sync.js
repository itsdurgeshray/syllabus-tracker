// Google Sign-In + Firestore sync — loaded as an ES module, exposes a small
// bridge (window.CloudSync) so the classic app.js script can drive it.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, signOut as fbSignOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAKEgbNJ0djHlKAHTmR_NCU8_rnYxdKiRs",
  authDomain: "syllabus-trackerr.firebaseapp.com",
  projectId: "syllabus-trackerr",
  storageBucket: "syllabus-trackerr.firebasestorage.app",
  messagingSenderId: "141824625591",
  appId: "1:141824625591:web:95ad1eb8affdf56104f632",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();

let currentUser = null;
let unsubscribeSnapshot = null;
let saveTimer = null;

function userDoc(uid) { return doc(db, "users", uid); }

async function signIn() {
  // Redirect-based flow: works reliably in Safari and on mobile, where popup
  // sign-in is often blocked by tracking-prevention / third-party cookie rules.
  await signInWithRedirect(auth, provider);
}

// Surfaces errors from the redirect round-trip (e.g. blocked by browser policy,
// account picker cancelled) — resolves to null on a normal, no-redirect page load.
getRedirectResult(auth).catch(err => {
  console.error("CloudSync: sign-in redirect failed", err);
  window.dispatchEvent(new CustomEvent("cloud-signin-error", { detail: err }));
});

async function signOutUser() {
  await fbSignOut(auth);
}

/** Debounced push of the full local state object up to this user's Firestore doc. */
function pushState(state) {
  if (!currentUser) return;
  clearTimeout(saveTimer);
  window.dispatchEvent(new CustomEvent("cloud-syncing"));
  saveTimer = setTimeout(() => {
    setDoc(userDoc(currentUser.uid), { data: state, updatedAt: Date.now() })
      .then(() => window.dispatchEvent(new CustomEvent("cloud-saved")))
      .catch(err => {
        console.error("CloudSync: failed to save", err);
        window.dispatchEvent(new CustomEvent("cloud-error", { detail: err }));
      });
  }, 600);
}

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }

  if (!user) {
    window.dispatchEvent(new CustomEvent("cloud-auth", { detail: { user: null, remoteState: null } }));
    return;
  }

  let remoteState = null;
  try {
    const snap = await getDoc(userDoc(user.uid));
    if (snap.exists()) remoteState = snap.data().data;
  } catch (err) {
    console.error("CloudSync: failed to load", err);
  }

  window.dispatchEvent(new CustomEvent("cloud-auth", { detail: { user, remoteState } }));

  // Live updates from other devices/tabs signed into the same account.
  unsubscribeSnapshot = onSnapshot(userDoc(user.uid), snap => {
    if (snap.metadata.hasPendingWrites) return; // ignore the echo of our own writes
    if (!snap.exists()) return;
    window.dispatchEvent(new CustomEvent("cloud-update", { detail: snap.data().data }));
  });
});

/** Uploads an image blob to this user's own Storage folder and resolves its download URL. */
async function uploadImage(blob) {
  if (!currentUser) throw new Error("Sign in with Google to add images to notes.");
  const ext = (blob.type && blob.type.split("/")[1]) || "png";
  const path = `users/${currentUser.uid}/notes/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const fileRef = storageRef(storage, path);
  await uploadBytes(fileRef, blob, { contentType: blob.type || "image/png" });
  return getDownloadURL(fileRef);
}

window.CloudSync = {
  signIn,
  signOut: signOutUser,
  pushState,
  uploadImage,
  getUser: () => currentUser,
};
