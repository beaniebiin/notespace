import { RightSidebarPlugin } from '../RightSidebarTypes';
import { IdeaClipPlugin } from './IdeaClipPlugin';
import { LinkClipPlugin } from './LinkClipPlugin';
import { ScratchpadPlugin } from './ScratchpadPlugin';

export { IdeaClipPlugin, LinkClipPlugin, ScratchpadPlugin };

/**
 * Default registered plugins list.
 * Builders can extend this by synthesizing additional plugins:
 * `const myPlugins = [...defaultRightSidebarPlugins, myCustomPlugin];`
 */
export const defaultRightSidebarPlugins: RightSidebarPlugin[] = [
  IdeaClipPlugin,
  LinkClipPlugin,
  ScratchpadPlugin,
];

/**
 * Helper utility to cleanly register or replace a plugin in a registry.
 */
export function registerRightSidebarPlugin(
  registry: RightSidebarPlugin[],
  plugin: RightSidebarPlugin
): RightSidebarPlugin[] {
  const existingIndex = registry.findIndex((p) => p.id === plugin.id);
  if (existingIndex !== -1) {
    const next = [...registry];
    next[existingIndex] = plugin;
    return next;
  }
  return [...registry, plugin];
}
