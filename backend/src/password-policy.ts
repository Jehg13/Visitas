export function isValidPassword(password: string) {
  const length = Array.from(password).length;
  return length >= 8 &&
    length <= 128 &&
    /\p{Lu}/u.test(password) &&
    /\p{Ll}/u.test(password) &&
    /\d/.test(password) &&
    /[^\p{L}\p{N}\s]/u.test(password);
}
