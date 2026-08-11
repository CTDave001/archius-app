import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <meta
          name="description"
          content="Archius is a focused AI workspace for clear answers, research, drafting, and deeper reasoning."
        />
        <meta name="theme-color" content="#FAF8F3" />
        <meta name="color-scheme" content="light dark" />
        <title>Archius — AI that actually works</title>
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: globalStyle }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const globalStyle = `
  html, body, #root {
    width: 100%;
    height: 100%;
    margin: 0;
  }

  body {
    overflow: hidden;
    overscroll-behavior: none;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  * {
    box-sizing: border-box;
  }

  *:focus-visible {
    outline: 2px solid #5FA8D3 !important;
    outline-offset: 2px;
  }

  ::selection {
    color: #122A39;
    background: rgba(95, 168, 211, 0.34);
  }

  ::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  ::-webkit-scrollbar-thumb {
    border: 3px solid transparent;
    border-radius: 999px;
    background-clip: padding-box;
    background-color: rgba(71, 85, 105, 0.38);
  }
`;
