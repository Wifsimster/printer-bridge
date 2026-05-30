import { ReactNode, useCallback, useMemo, useState } from "react";
import {
  PublicUsernameContext,
  USERNAME_MAX_LENGTH,
} from "@/lib/publicUsername";

const STORAGE_KEY = "printcast.public.username";

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

export function PublicUsernameProvider({ children }: { children: ReactNode }) {
  const [username, setUsernameState] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) ?? ""
  );

  const setUsername = useCallback((value: string) => {
    const trimmed = value.slice(0, USERNAME_MAX_LENGTH);
    setUsernameState(trimmed);
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  const randomize = useCallback(() => {
    setUsername(randomUsername());
  }, [setUsername]);

  const value = useMemo(
    () => ({ username, setUsername, randomize }),
    [username, setUsername, randomize]
  );

  return (
    <PublicUsernameContext.Provider value={value}>
      {children}
    </PublicUsernameContext.Provider>
  );
}
