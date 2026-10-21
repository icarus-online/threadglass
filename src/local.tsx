import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { extractDocument } from '../shared/extract.ts';
import styles from './style.css?inline';
function launch() {
  if (document.getElementById('threadglass-local')) return;
  const data = extractDocument();
  if (!data.post && !data.listing.length) {
    alert(
      'Threadglass could not find supported discussion content already loaded on this page. It cannot unlock restricted content.',
    );
    return;
  }
  const host = document.createElement('div');
  host.id = 'threadglass-local';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;overflow:auto;background:#f7f7f2';
  const shadow = host.attachShadow({ mode: 'open' }),
    style = document.createElement('style');
  style.textContent = styles;
  shadow.append(style);
  const root = document.createElement('div');
  shadow.append(root);
  document.body.append(host);
  const oldOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  const reactRoot = createRoot(root);
  reactRoot.render(
    <App
      initial={data}
      localMode
      onExit={() => {
        reactRoot.unmount();
        host.remove();
        document.documentElement.style.overflow = oldOverflow;
      }}
    />,
  );
}
const button = document.createElement('button');
button.textContent = 'Read with Threadglass';
button.style.cssText =
  'position:fixed;right:16px;bottom:20px;z-index:2147483646;background:#254f42;color:white;border:1px solid #a5c9b2;border-radius:24px;padding:14px 20px;font:14px system-ui;cursor:pointer;box-shadow:0 4px 20px #0003';
button.addEventListener('click', launch);
document.body.append(button);
