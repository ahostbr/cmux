/// <reference types="vite/client" />

import type { CmuxWindowsApi, ElectronAppApi, WorkspaceWindowApi } from '../preload/index';
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

declare global {
  interface Window {
    electronApp: ElectronAppApi;
    liteWinTerminal: CmuxWindowsApi;
    workspaceWindow?: WorkspaceWindowApi;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        allowpopups?: string;
        partition?: string;
      };
    }
  }
}

export {};
