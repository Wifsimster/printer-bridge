import { createContext, useContext } from "react";

// Free-text handle a visitor picks (or randomly generates) on the public page.
// It is sent with every public print so the owner can see who printed what.
export const USERNAME_MAX_LENGTH = 32;

export type PublicUsernameContextValue = {
  username: string;
  setUsername: (value: string) => void;
  randomize: () => void;
};

export const PublicUsernameContext =
  createContext<PublicUsernameContextValue | null>(null);

export function usePublicUsername(): PublicUsernameContextValue {
  const ctx = useContext(PublicUsernameContext);
  if (!ctx) {
    throw new Error("usePublicUsername must be used within a PublicUsernameProvider");
  }
  return ctx;
}
