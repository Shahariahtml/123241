import { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  User,
  sendEmailVerification,
  updateProfile as updateFirebaseProfile,
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';

interface AuthContextType {
  currentUser: User | null;
  signup: (email: string, password: string) => Promise<void>;
  signin: (email: string, password: string) => Promise<void>;
  signout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function signup(email: string, password: string) {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(user);
    
    const displayName = email.split('@')[0];
    await updateFirebaseProfile(user, { displayName });
    
    await setDoc(doc(db, 'users', user.uid), {
      email: user.email,
      displayName,
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      online: true
    });
  }

  async function signin(email: string, password: string): Promise<void> {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    
    if (!user.emailVerified) {
      await signOut(auth);
      throw new Error('Please verify your email before signing in.');
    }

    await updateDoc(doc(db, 'users', user.uid), {
      lastSeen: new Date().toISOString(),
      online: true
    });
  }

  async function signout() {
    if (currentUser) {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        lastSeen: new Date().toISOString(),
        online: false
      });
    }
    return signOut(auth);
  }

  function resetPassword(email: string) {
    return sendPasswordResetEmail(auth, email);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            await updateDoc(doc(db, 'users', user.uid), {
              online: true,
              lastSeen: new Date().toISOString()
            });
          }
        } catch (error) {
          console.error('Error updating user status:', error);
        }
      }
      setCurrentUser(user);
      setLoading(false);
    });

    return () => {
      if (currentUser) {
        updateDoc(doc(db, 'users', currentUser.uid), {
          online: false,
          lastSeen: new Date().toISOString()
        }).catch(console.error);
      }
      unsubscribe();
    };
  }, [currentUser]);

  const value = {
    currentUser,
    signup,
    signin,
    signout,
    resetPassword,
    loading,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}