// The Buddy mark, as inline SVG.
//
// Shared deliberately: onboarding tells people to look for this glyph in their
// login fields, so the thing it draws and the thing they will actually see have
// to be the same shape. Two copies would drift the first time either is tweaked.
//
// Filled rather than line art. At 14 to 20px a stroked shield turns to mush,
// and the lock knocked out in white is what makes it read as our icon rather
// than a generic padlock.
export const BUDDY_MARK = `
  <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" aria-hidden="true">
    <path d="M12 2.4 20.6 5.5V12c0 4.7-3.6 8.4-8.6 10.1C7 20.4 3.4 16.7 3.4 12V5.5Z"
          fill="currentColor"/>
    <path d="M10 11.6V9.9a2 2 0 0 1 4 0v1.7" stroke="#fff" stroke-width="1.7"
          stroke-linecap="round" fill="none"/>
    <rect x="8.4" y="11.3" width="7.2" height="5.6" rx="1.3" fill="#fff"/>
  </svg>`
