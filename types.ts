export interface Note {
  id: string;
  title: string;
  content: string;
  lastModified: number;
}

export type TagColor = 'default' | 'gray' | 'brown' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'red';

export interface Tag {
  id: string;
  label: string;
  color: TagColor;
}

export interface FileSystemNode {
  id: string;
  name: string;
  type: 'note' | 'folder';
  children?: FileSystemNode[]; // For folders
  parentId?: string;

  lastModified: number;
  tags?: Tag[];
}

export interface BreadcrumbItem {
  id: string;
  name: string;
}

export enum SidebarView {
  FILES = 'FILES',
  SEARCH = 'SEARCH',
  TRASH = 'TRASH',
  TAGS = 'TAGS'
}

export type ContrastLevel = 'standard' | 'high';
export type ThemeMode = 'system' | 'light' | 'dark';

export interface AppSettings {
  title: string;
  logo: string;
  darkMode: boolean;
  theme?: ThemeMode;
  contrast?: ContrastLevel;
}

export type SaveStatusState = 'version' | 'saved' | 'saving' | 'idle' | 'error' | 'ai_generating' | 'ai_success';

export interface SaveStatusInfo {
  state: SaveStatusState;
  message: string;
}

export interface TopBarNotification {
  id: string;
  type: 'ai_loading' | 'ai_success' | 'ai_error' | 'tree_saving' | 'tree_saved' | 'tree_error' | 'info';
  message: string;
}
