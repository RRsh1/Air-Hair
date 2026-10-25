/** Hebrew messages for Better Auth errors shown on staff screens. Never reveal whether an email exists. */
export function authErrorMessage(error: { status?: number; code?: string; message?: string } | null | undefined): string {
  if (!error) return "";
  if (error.status === 429 || error.code === "ACCOUNT_TEMPORARILY_LOCKED") {
    return "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.";
  }
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_PASSWORD":
      return "האימייל או הסיסמה שגויים.";
    case "INVALID_CODE":
    case "INVALID_TWO_FACTOR_CODE":
    case "INVALID_BACKUP_CODE":
    case "OTP_HAS_EXPIRED":
      return "הקוד שגוי או שפג תוקפו. נסו את הקוד הנוכחי מהאפליקציה.";
    case "INVALID_TOKEN":
      return "הקישור לא תקף או שפג תוקפו. בקשו קישור חדש.";
    case "PASSWORD_TOO_SHORT":
      return "הסיסמה צריכה להכיל לפחות 12 תווים.";
    case "PASSWORD_TOO_LONG":
      return "הסיסמה ארוכה מדי.";
  }
  if (error.status === 401) return "צריך להתחבר מחדש.";
  return "משהו השתבש. נסו שוב.";
}
