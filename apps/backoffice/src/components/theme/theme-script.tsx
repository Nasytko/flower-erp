/** Runs before paint to avoid theme flash. Keep in sync with theme.ts storage key. */
export function ThemeScript() {
  const script = `(function(){try{var k='flower.theme';var t=localStorage.getItem(k);var theme=(t==='light'||t==='dark'||t==='system')?t:'system';document.documentElement.setAttribute('data-theme',theme);}catch(e){document.documentElement.setAttribute('data-theme','system');}})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
