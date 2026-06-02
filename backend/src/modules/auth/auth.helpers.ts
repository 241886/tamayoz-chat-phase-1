export const userSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  status: true,
  lastSeenAt: true,
  createdAt: true,
  updatedAt: true
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
