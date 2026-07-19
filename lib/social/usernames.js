export const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;

export function normalizeUsername(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function usernameError(value) {
  const username = normalizeUsername(value);
  if (!username) return "Choose a username.";
  if (!USERNAME_PATTERN.test(username)) {
    return "Use 3–24 lowercase letters, numbers, or underscores.";
  }
  return null;
}
