import React from 'react';
import { TextStatistics } from '../../services/textStatistics';

/**
 * Context data and action triggers supplied to all right sidebar plugins.
 * Ensures plugins remain pure, isolated, and decoupled from core app state.
 */
export interface RightSidebarContext {
  activeNoteId: string | null;
  activeNoteTitle: string;
  editorContent: string;
  statistics: TextStatistics;
  onNavigateLink: (targetNoteId?: string | null, targetSectionId?: string | null) => void;
  onInsertMarkdown?: (markdown: string) => void;
  onAiAction?: (
    prompt: string,
    files?: { mimeType: string; data: string; name?: string }[],
    endpointId?: string | number,
    model?: string,
    excludeContent?: boolean,
    wrapCodeBlock?: boolean,
    systemInstruction?: string
  ) => void;
  isAiLoading?: boolean;
  onOpenAiEndpointSettings?: () => void;
}

/**
 * Standard contract that every RightSidebar plugin must implement.
 * Builders can create custom extensions by adhering to this interface.
 */
export interface RightSidebarPlugin {
  id: string;
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tooltip?: string;
  badge?: (ctx: RightSidebarContext) => number | string | undefined;
  render: (ctx: RightSidebarContext) => React.ReactNode;
}
