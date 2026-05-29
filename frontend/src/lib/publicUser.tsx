import { createContext, ReactNode, useContext, useState } from "react";

// Free-text handle a visitor picks (or randomly generates) on the public page.
// It is sent with every public print so the owner can see who printed what.
const STORAGE_KEY = "printcast.public.username";
export const USERNAME_MAX_LENGTH = 32;

const ADJECTIVES = [
  "happy", "brave", "sunny", "lucky", "cosmic", "fuzzy", "swift", "quiet",
  "merry", "shiny", "witty", "calm", "bold", "jolly", "snappy", "zesty",
];
const ANIMALS = [
  "otter", "fox", "panda", "koala", "tiger", "heron", "lynx", "gecko",
  "narwhal", "badger", "puffin", "wombat", "ferret", "mantis", "yak", "moth",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomUsername(): string {
  return `${pick(ADJECTIVES)}-${pick(ANIMALS)}-${Math.floor(Math.random() * 100)}`;
}

type PublicUsernameContextValue = {
  username: string;
  setUsername: (value: string) => void;
  randomize: () => void;
};

const PublicUsernameContext = createContext<PublicUsernameContextValue | null>(null);

export function PublicUsernameProvider({ children }: { children: ReactNode }) {
  const [username, setUsernameState] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) ?? ""
  );

  function setUsername(value: string) {
    const trimmed = value.slice(0, USERNAME_MAX_LENGTH);
    setUsernameState(trimmed);
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
  }

  function randomize() {
    setUsername(randomUsername());
  }

  return (
    <PublicUsernameContext.Provider value={{ username, setUsername, randomize }}>
      {children}
    </PublicUsernameContext.Provider>
  );
}

export function usePublicUsername(): PublicUsernameContextValue {
  const ctx = useContext(PublicUsernameContext);
  if (!ctx) {
    throw new Error("usePublicUsername must be used within a PublicUsernameProvider");
  }
  return ctx;
}
